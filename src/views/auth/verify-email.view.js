// ==============================================================================
// ImdConnect — Verify Email View
// ==============================================================================
import { authService } from '../../services/auth.service.js';

export const VerifyEmailView = {
    render() {
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const targetEmail = urlParams.get('email') || '';

        const container = document.createElement('main');
        container.className = 'auth-container';

        container.innerHTML = `
            <div class="auth-card" role="region" aria-label="Verify Email Notice">
                <header class="auth-header">
                    <a href="#/" class="auth-brand">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Text Only</span>
                    </a>
                    <h1 class="auth-title">Verify Your Email</h1>
                    <p class="auth-subtitle">We sent a confirmation link to your private email address</p>
                </header>

                <div class="alert-box alert-info">
                    <span>
                        Please check your inbox at <strong>${targetEmail || 'your email'}</strong> and click the link to activate your account.
                    </span>
                </div>

                <div id="verify-alert-area" aria-live="polite"></div>

                <div class="auth-form">
                    <button type="button" id="resend-email-btn" class="btn-secondary">
                        <span id="resend-btn-text">Resend Verification Email</span>
                    </button>

                    <a href="#/auth/login" class="btn-primary" style="text-decoration: none;">
                        Back to Sign In
                    </a>
                </div>

                <footer class="auth-footer">
                    <span>Did not receive it? Check your spam/junk folder.</span>
                </footer>
            </div>
        `;

        this.bindEvents(container, targetEmail);
        return container;
    },

    bindEvents(root, email) {
        const resendBtn = root.querySelector('#resend-email-btn');
        const btnText = root.querySelector('#resend-btn-text');
        const alertArea = root.querySelector('#verify-alert-area');

        resendBtn.addEventListener('click', async () => {
            if (!email) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>Email address not found. Please attempt login to re-trigger verification.</span>
                    </div>
                `;
                return;
            }

            resendBtn.disabled = true;
            btnText.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending...';

            const res = await authService.resendVerificationEmail(email);

            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error}</span>
                    </div>
                `;
                resendBtn.disabled = false;
                btnText.textContent = 'Resend Verification Email';
                return;
            }

            alertArea.innerHTML = `
                <div class="alert-box alert-success" role="status">
                    <span>Verification email resent successfully!</span>
                </div>
            `;
            btnText.textContent = 'Email Resent';
        });
    }
};
