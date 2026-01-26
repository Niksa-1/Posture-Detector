window.API_BASE_URL = 'https://posture-detector-j0j7.onrender.com/api';

window.UserStorage = {
    // From login.js
    setCurrentUser(user, token) {
        const sessionData = {
            id: user.id,
            name: user.name,
            email: user.email,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('currentUser', JSON.stringify(sessionData));
        localStorage.setItem('authToken', token);
        
        if (localStorage.getItem('rememberMe') === 'true') {
            localStorage.setItem('rememberedUser', user.email);
        }
    },
    // From index.js
    getCurrentUser() {
        const userData = localStorage.getItem('currentUser');
        return userData ? JSON.parse(userData) : null;
    },
    getAuthToken() {
        return localStorage.getItem('authToken');
    },
    logout() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
        // Clear remembered user if they didn't want to be remembered
        if (localStorage.getItem('rememberMe') !== 'true') {
            localStorage.removeItem('rememberedUser');
        }
    }
};