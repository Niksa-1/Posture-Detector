function switchTab(tab) {
    // Update tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Update form content
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

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Here you would normally send this to your backend
    console.log('Login attempt:', { email, password });
    
    alert('Login functionality will be connected to backend. For now, redirecting to home...');
    window.location.href = 'index.html';
}

function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }
    
    // Here you would normally send this to your backend
    console.log('Register attempt:', { name, email, password });
    
    alert('Registration functionality will be connected to backend. Welcome! Redirecting...');
    window.location.href = 'index.html';
}