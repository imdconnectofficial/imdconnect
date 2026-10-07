// ==============================================================================
// ImdConnect — Forgot Password View
// ==============================================================================
import { authService } from '../../services/auth.service.js';

export const ForgotPasswordView = {
    render() {
        const container = document.createElement('main');
        container.className = 'auth-container';

        container.innerHTML = `
            <div class="auth-card" role="region" aria-label="Forgot Password Card">
                <header class="auth-header">
                    <a href="#/" class="auth-brand">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Text Only</span>
                    </a>
                    <h1 class="auth-title">Reset Password</h1>
                    <p class="auth-subtitle">Enter your private email to receive password reset instructions</p>
                </header>

                <div id="forgot-alert-area" aria-live="polite"></div>

                <form id="forgot-form" class="auth-form" novalidate>
                    <div class="form-group">
                        <label for="forgot-email" class="form-label">Private Email Address</label>
                        <input 
                            type="email" 
                            id="forgot-email" 
                            name="email" 
                            class="form-input" 
                            placeholder="Enter your registered email" 
                            autocomplete="email" 
                            required 
                            autofocus
                        />
                    </div>

                    <button type="submit" id="forgot-submit-btn" class="btn-primary">
                        <span id="forgot-btn-text">Send Reset Instructions</span>
                    </button>
                </form>

                <footer class="auth-footer">
                    <span>Remember your password?</span>
                    <a href="#/auth/login" class="auth-link">Back to Sign in</a>
                </footer>
            </div>
        `;

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const form = root.querySelector('#forgot-form');
        const alertArea = root.querySelector('#forgot-alert-area');
        const submitBtn = root.querySelector('#forgot-submit-btn');
        const btnText = root.querySelector('#forgot-btn-text');
        const emailInput = root.querySelector('#forgot-email');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const email = emailInput.value.trim();
            if (!email) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>Please enter your registered email address.</span>
                    </div>
                `;
                return;
            }

            submitBtn.disabled = true;
            btnText.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending...';

            const res = await authService.forgotPassword(email);

            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error}</span>
                    </div>
                `;
                submitBtn.disabled = false;
                btnText.textContent = 'Send Reset Instructions';
                return;
            }

            // Always display non-enumerating generic confirmation
            alertArea.innerHTML = `
                <div class="alert-box alert-success" role="status">
                    <span>${res.message}</span>
                </div>
            `;
            btnText.textContent = 'Instructions Dispatched';
        });
    }
};
