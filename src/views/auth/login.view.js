// ==============================================================================
// ImdConnect — Login View
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { router } from '../../core/router.js';

export const LoginView = {
    render() {
        const container = document.createElement('main');
        container.className = 'auth-container';

        container.innerHTML = `
            <div class="auth-card" role="region" aria-label="Sign In Card">
                <header class="auth-header">
                    <a href="#/" class="auth-brand">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Text Only</span>
                    </a>
                    <h1 class="auth-title">Welcome Back</h1>
                    <p class="auth-subtitle">Sign in with your username or private email</p>
                </header>

                <div id="login-alert-area" aria-live="polite"></div>

                <form id="login-form" class="auth-form" novalidate>
                    <div class="form-group">
                        <label for="login-identifier" class="form-label">Username or Email</label>
                        <input 
                            type="text" 
                            id="login-identifier" 
                            name="identifier" 
                            class="form-input" 
                            placeholder="@username or user@example.com"
                            autocomplete="username" 
                            required
                            autofocus
                        />
                    </div>

                    <div class="form-group">
                        <div class="form-row-meta">
                            <label for="login-password" class="form-label">Password</label>
                            <a href="#/auth/forgot-password" class="auth-link">Forgot password?</a>
                        </div>
                        <div class="input-wrapper">
                            <input 
                                type="password" 
                                id="login-password" 
                                name="password" 
                                class="form-input" 
                                placeholder="Enter your password"
                                autocomplete="current-password" 
                                required
                            />
                            <button 
                                type="button" 
                                id="toggle-password-btn" 
                                class="input-icon-btn" 
                                aria-label="Toggle password visibility"
                                tabindex="-1"
                            >👁️</button>
                        </div>
                    </div>

                    <div class="form-row-meta">
                        <label class="checkbox-label">
                            <input type="checkbox" id="login-remember" class="checkbox-input" checked />
                            <span>Remember session</span>
                        </label>
                    </div>

                    <button type="submit" id="login-submit-btn" class="btn-primary">
                        <span id="btn-text">Sign In</span>
                    </button>
                </form>

                <footer class="auth-footer">
                    <span>Don't have an account?</span>
                    <a href="#/auth/register" class="auth-link">Create one</a>
                </footer>
            </div>
        `;

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const form = root.querySelector('#login-form');
        const alertArea = root.querySelector('#login-alert-area');
        const submitBtn = root.querySelector('#login-submit-btn');
        const btnText = root.querySelector('#btn-text');
        const togglePwdBtn = root.querySelector('#toggle-password-btn');
        const pwdInput = root.querySelector('#login-password');
        const identifierInput = root.querySelector('#login-identifier');

        // Toggle Password Visibility
        togglePwdBtn.addEventListener('click', () => {
            const isPassword = pwdInput.type === 'password';
            pwdInput.type = isPassword ? 'text' : 'password';
            togglePwdBtn.textContent = isPassword ? '🔒' : '👁️';
        });

        // Form Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const identifier = identifierInput.value.trim();
            const password = pwdInput.value;
            const rememberMe = root.querySelector('#login-remember').checked;

            if (!identifier || !password) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>Please enter your username/email and password.</span>
                    </div>
                `;
                return;
            }

            // UI 4-State: Loading State
            submitBtn.disabled = true;
            btnText.innerHTML = '<span class="spinner" aria-hidden="true"></span> Signing in...';

            try {
                const res = await authService.login({ identifier, password, rememberMe });

                if (!res.success) {
                    // UI 4-State: Error State (Non-leaking generic error)
                    alertArea.innerHTML = `
                        <div class="alert-box alert-error" role="alert">
                            <span>${res.error || 'Invalid credentials. Please try again.'}</span>
                        </div>
                    `;
                    submitBtn.disabled = false;
                    btnText.textContent = 'Sign In';

                    if (res.needsVerification) {
                        setTimeout(() => {
                            router.navigate(`#/auth/verify-email?email=${encodeURIComponent(res.email || '')}`);
                        }, 1200);
                    }
                    return;
                }

                // UI 4-State: Success State
                btnText.textContent = 'Success! Loading...';
                router.navigate('#/app');
            } catch (err) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>A network error occurred. Please check your connection.</span>
                    </div>
                `;
                submitBtn.disabled = false;
                btnText.textContent = 'Sign In';
            }
        });
    }
};
