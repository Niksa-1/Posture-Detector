// User data storage

const UserStorage = {
    // TODO: Replace with API endpoint: POST /api/auth/register
    saveUser(userData) {
        const users = this.getAllUsers();
        users.push({
            id: Date.now().toString(),
            name: userData.name,
            email: userData.email.toLowerCase(),
            password: userData.password, // TODO: Backend should hash this
            createdAt: new Date().toISOString()
        });
        localStorage.setItem('users', JSON.stringify(users));
        return true;
    },

    // TODO: Replace with API endpoint: POST /api/auth/login
    authenticateUser(email, password) {
        const users = this.getAllUsers();
        const user = users.find(u => 
            u.email === email.toLowerCase() && u.password === password
        );
        return user || null;
    },

    // TODO: Replace with API endpoint: GET /api/users/:email
    getUserByEmail(email) {
        const users = this.getAllUsers();
        return users.find(u => u.email === email.toLowerCase());
    },

    getAllUsers() {
        const usersJson = localStorage.getItem('users');
        return usersJson ? JSON.parse(usersJson) : [];
    },

    // Session management
    setCurrentUser(user) {
        const sessionData = {
            id: user.id,
            name: user.name,
            email: user.email,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(sessionData));
        
        // If "Remember Me" was checked, store in longer-term storage
        if (localStorage.getItem('rememberMe') === 'true') {
            localStorage.setItem('rememberedUser', user.email);
        }
    },

    getCurrentUser() {
        const userData = localStorage.getItem('currentUser');
        return userData ? JSON.parse(userData) : null;
    },

    logout() {
        localStorage.removeItem('currentUser');
        if (localStorage.getItem('rememberMe') !== 'true') {
            localStorage.removeItem('rememberedUser');
        }
    }
};

// Validation functions

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function checkPasswordStrength(password) {
    let strength = 0;
    let feedback = '';
    
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 2) {
        feedback = 'Weak';
        return { strength: 'weak', feedback, color: '#dc3545' };
    } else if (strength <= 3) {
        feedback = 'Medium';
        return { strength: 'medium', feedback, color: '#ffc107' };
    } else {
        feedback = 'Strong';
        return { strength: 'strong', feedback, color: '#28a745' };
    }
}

function updatePasswordStrength(inputId, indicatorId) {
    const password = document.getElementById(inputId).value;
    const indicator = document.getElementById(indicatorId);
    
    if (!password) {
        indicator.style.display = 'none';
        return;
    }
    
    const result = checkPasswordStrength(password);
    indicator.style.display = 'block';
    indicator.style.color = result.color;
    indicator.innerHTML = `<small>Password strength: <strong>${result.feedback}</strong></small>`;
}

// UI functions

function switchTab(tab) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    const forms = document.querySelectorAll('.form-content');
    forms.forEach(form => form.classList.remove('active'));

    const subtitle = document.getElementById('subtitle');
    
    if (tab === 'login') {
        document.getElementById('loginForm').classList.add('active');
        subtitle.textContent = 'Login to continue your posture journey';
    } else {
        document.getElementById('registerForm').classList.add('active');
        subtitle.textContent = 'Create an account to get started';
    }
}

function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    const eyeOpen = button.querySelector('.eye-open');
    const eyeClosed = button.querySelector('.eye-closed');
    
    if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'inline';
    } else {
        input.type = 'password';
        eyeOpen.style.display = 'inline';
        eyeClosed.style.display = 'none';
    }
}

function showMessage(message, type = 'info') {
    // Create a toast-style message
    const messageDiv = document.createElement('div');
    messageDiv.className = `alert alert-${type} position-fixed top-0 start-50 translate-middle-x mt-3`;
    messageDiv.style.zIndex = '9999';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// Form handlers

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    // Email validation
    if (!validateEmail(email)) {
        showMessage('Please enter a valid email address.', 'danger');
        return;
    }
    
    // Loading state
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    
    // Store remember me preference
    localStorage.setItem('rememberMe', rememberMe.toString());
    
    // Simulate async operation
    setTimeout(() => {
        // Authenticate user
        const user = UserStorage.authenticateUser(email, password);
        
        if (user) {
            UserStorage.setCurrentUser(user);
            submitBtn.textContent = 'Success!';
            showMessage(`Welcome back, ${user.name}!`, 'success');
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } else {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            showMessage('Invalid email or password. Please try again.', 'danger');
        }
    }, 500);
}

function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    // Email validation
    if (!validateEmail(email)) {
        showMessage('Please enter a valid email address.', 'danger');
        return;
    }
    
    // Validation
    if (password !== confirmPassword) {
        showMessage('Passwords do not match!', 'danger');
        return;
    }
    
    if (password.length < 8) {
        showMessage('Password must be at least 8 characters long.', 'danger');
        return;
    }
    
    // Check if user already exists
    if (UserStorage.getUserByEmail(email)) {
        showMessage('An account with this email already exists.', 'danger');
        return;
    }
    
    // Loading state
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';
    
    // Simulate async operation
    setTimeout(() => {
        // Register new user
        const userData = { name, email, password };
        UserStorage.saveUser(userData);
        
        // Auto-login after registration
        const newUser = UserStorage.getUserByEmail(email);
        UserStorage.setCurrentUser(newUser);
        
        submitBtn.textContent = 'Account Created!';
        showMessage(`Account created successfully! Welcome, ${name}!`, 'success');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }, 500);
}

// Initialization

// Pre-fill email if "Remember Me" was used
window.addEventListener('DOMContentLoaded', () => {
    const rememberedEmail = localStorage.getItem('rememberedUser');
    if (rememberedEmail) {
        document.getElementById('loginEmail').value = rememberedEmail;
        document.getElementById('rememberMe').checked = true;
    }
});