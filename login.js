// API FUNCTIONS

async function registerUser(name, email, password) {
    const response = await fetch(`${window.API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
    }
    
    return data;
}

async function loginUser(email, password) {
    const response = await fetch(`${window.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || 'Login failed');
    }
    
    return data;
}

async function getCurrentUser(token) {
    const response = await fetch(`${window.API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message || 'Failed to get user data');
    }
    
    return data;
}

// VALIDATION FUNCTIONS

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

// UI FUNCTIONS

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
    // Remove any existing messages first
    const existingMessages = document.querySelectorAll('.alert');
    existingMessages.forEach(msg => msg.remove());
    
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

function clearErrorsOnInput() {
    // Remove any visible error messages when user starts typing
    const existingMessages = document.querySelectorAll('.alert-danger');
    existingMessages.forEach(msg => msg.remove());
}

function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('input[required]');
    if (!submitBtn) return;

    function checkValidity() {
        let allFilled = true;
        inputs.forEach(input => {
            if (!input.value.trim() || (input.type === 'checkbox' && !input.checked)) {
                allFilled = false;
            }
        });
        submitBtn.disabled = !allFilled;
    }
    
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            checkValidity();
            clearErrorsOnInput();
        });
        input.addEventListener('change', checkValidity);
    });
    
    // Initial check
    checkValidity();
}

function updateAuthUI() {
    const authToken = window.UserStorage.getAuthToken();
    const currentUser = window.UserStorage.getCurrentUser();
    const loginBtn = document.querySelector('.btn-login');
    const nameLabel = document.querySelector('.user-name-label');

    if (!loginBtn) return;

    if (authToken && currentUser) {
        // Logged in → show Logout
        loginBtn.textContent = 'Logout';
        loginBtn.href = '#';
        loginBtn.onclick = (e) => {
            e.preventDefault();
            handleLogout();
        };
        if (nameLabel) {
            nameLabel.textContent = currentUser.name || 'User';
            nameLabel.style.display = 'inline-flex';
        }
    } else {
        // Logged out → show Login
        loginBtn.textContent = 'Login';
        loginBtn.href = './login.html';
        loginBtn.onclick = null;
        if (nameLabel) {
            nameLabel.textContent = '';
            nameLabel.style.display = 'none';
        }
    }
}

// FORM HANDLERS

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const rememberMe = document.getElementById('rememberMe').checked;
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    // Check for empty fields
    if (!email) {
        showMessage('Please enter your email address.', 'danger');
        document.getElementById('loginEmail').focus();
        return;
    }
    
    if (!password) {
        showMessage('Please enter your password.', 'danger');
        document.getElementById('loginPassword').focus();
        return;
    }
    
    // Email validation
    if (!validateEmail(email)) {
        showMessage('Please enter a valid email address.', 'danger');
        document.getElementById('loginEmail').focus();
        return;
    }
    
    // Loading state
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    
    // Store remember me preference
    localStorage.setItem('rememberMe', rememberMe.toString());
    
    // Call API
    loginUser(email, password)
        .then(data => {
            window.UserStorage.setCurrentUser(data.user, data.token);
            updateAuthUI();
            submitBtn.textContent = 'Success!';
            showMessage(`Welcome back, ${data.user.name}!`, 'success');
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        })
        .catch(error => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            showMessage(error.message, 'danger');
        });
}

function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    
    // Check for empty fields
    if (!name) {
        showMessage('Please enter your full name.', 'danger');
        document.getElementById('registerName').focus();
        return;
    }
    
    if (!email) {
        showMessage('Please enter your email address.', 'danger');
        document.getElementById('registerEmail').focus();
        return;
    }
    
    if (!password) {
        showMessage('Please enter a password.', 'danger');
        document.getElementById('registerPassword').focus();
        return;
    }
    
    if (!confirmPassword) {
        showMessage('Please confirm your password.', 'danger');
        document.getElementById('confirmPassword').focus();
        return;
    }
    
    if (!document.getElementById('agreeTerms').checked) {
        showMessage('Please agree to the Terms & Conditions.', 'danger');
        document.getElementById('agreeTerms').focus();
        return;
    }
    
    // Email validation
    if (!validateEmail(email)) {
        showMessage('Please enter a valid email address.', 'danger');
        document.getElementById('registerEmail').focus();
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
    
    // Loading state
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';
    
    // Call API
    registerUser(name, email, password)
        .then(data => {
            window.UserStorage.setCurrentUser(data.user, data.token);
            updateAuthUI();
            submitBtn.textContent = 'Account Created!';
            showMessage(`Account created successfully! Welcome, ${name}!`, 'success');
            
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        })
        .catch(error => {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            showMessage(error.message, 'danger');
        });
}

function handleLogout() {
    window.UserStorage.logout();
    updateAuthUI();
    window.location.href = './index.html';
}

// INITIALIZATION

// Pre-fill email if "Remember Me" was used
window.addEventListener('DOMContentLoaded', () => {
    const rememberedEmail = localStorage.getItem('rememberedUser');
    if (rememberedEmail) {
        document.getElementById('loginEmail').value = rememberedEmail;
        document.getElementById('rememberMe').checked = true;
    }
    
    // Initialize form validation
    validateForm('loginForm');
    validateForm('registerForm');

    updateAuthUI();
});