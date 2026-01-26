/*
// SETUP INSTRUCTIONS

1. Install dependencies:
   npm install @libsql/client bcrypt jsonwebtoken express cors dotenv

2. Create .env file:
   TURSO_DATABASE_URL=libsql://your-database-url.turso.io
   TURSO_AUTH_TOKEN=your-auth-token
   JWT_SECRET=your-secret-key-here
   PORT=3000

3. Run the schema.sql file on your Turso database
*/

const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// DATABASE CONNECTION

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// EXPRESS SETUP

const app = express();
app.use(
  cors({
    origin: [
      'https://niksa-1.github.io',
      'http://localhost:3000',
    ],
    credentials: true,
  })
);
app.use(express.json());

// AUTH FUNCTIONS

// Hash password
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Generate JWT token
function generateToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verify JWT token middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.userId = decoded.userId;
    next();
  });
}

// API ENDPOINTS

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    // Check if user exists
    const existingUser = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    });

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert user
    const result = await db.execute({
      sql: 'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      args: [name, email.toLowerCase(), passwordHash]
    });

    // Get created user
    const newUser = await db.execute({
      sql: 'SELECT id, name, email, created_at FROM users WHERE id = ?',
      args: [result.lastInsertRowid]
    });

    const user = newUser.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ? AND is_active = 1',
      args: [email.toLowerCase()]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await db.execute({
      sql: 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      args: [user.id]
    });

    // Generate token
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// Get current user (protected route example)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT id, name, email, created_at, last_login FROM users WHERE id = ?',
      args: [req.userId]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user data'
    });
  }
});

app.post('/api/stats/update', authenticateToken, async (req, res) => {
  const { total_ms, good_ms, bad_ms, streak_ms, alerts } = req.body;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Upsert logic: Update if exists for this user today, otherwise insert
    await db.execute({
      sql: `INSERT INTO posture_stats (user_id, date, total_ms, good_ms, bad_ms, longest_streak_ms, alert_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
              total_ms = ?,
              good_ms = ?,
              bad_ms = ?,
              longest_streak_ms = MAX(longest_streak_ms, ?),
              alert_count = ?`,
      args: [
        req.userId, today, total_ms, good_ms, bad_ms, streak_ms, alerts,
        total_ms, good_ms, bad_ms, streak_ms, alerts
      ]
    });

    res.json({ success: true, message: 'Stats synced successfully' });
  } catch (error) {
    console.error('Stats sync error:', error);
    res.status(500).json({ success: false, message: 'Failed to sync stats' });
  }
});

// Logout (optional - mainly for clearing client-side token)
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  // In a more complex system, you might invalidate the token here
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// START SERVER

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

// ERROR HANDLING

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

module.exports = app;