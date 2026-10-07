// ==============================================================================
// ImdConnect — Reset Password View
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { router } from '../../core/router.js';

export const ResetPasswordView = {
    render() {
        const container = document.createElement('main');
        container.className = 'auth-container';

        container.innerHTML = `
            <div class="auth-card" role="region" aria-label="Set New Password Card">
                <header class="auth-header">
                    <a href="#/" class="auth-brand">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Text Only</span>
                    </a>
                    <h1 class="auth-title">Set New Password</h1>
                    <p class="auth-subtitle">Create a strong, new password for your account</p>
                </header>

                <div id="reset-alert-area" aria-live="polite"></div>

                <form id="reset-form" class="auth-form" novalidate>
                    <div class="form-group">
                        <label for="reset-password" class="form-label">New Password</label>
                        <input 
                            type="password" 
                            id="reset-password" 
                            name="password" 
                            class="form-input" 
                            placeholder="Minimum 8 characters" 
                            autocomplete="new-password" 
                            required 
                            autofocus
                        />
                    </div>

                    <div class="form-group">
                        <label for="reset-confirm" class="form-label">Confirm New Password</label>
                        <input 
                            type="password" 
                            id="reset-confirm" 
                            name="passwordConfirm" 
                            class="form-input" 
                            placeholder="Re-type new password" 
                            autocomplete="new-password" 
                            required 
                        />
                    </div>

                    <button type="submit" id="reset-submit-btn" class="btn-primary">
                        <span id="reset-btn-text">Update Password</span>
                    </button>
                </form>

                <footer class="auth-footer">
                    <a href="#/auth/login" class="auth-link">Return to Sign In</a>
                </footer>
            </div>
        `;

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const form = root.querySelector('#reset-form');
        const alertArea = root.querySelector('#reset-alert-area');
        const submitBtn = root.querySelector('#reset-submit-btn');
        const btnText = root.querySelector('#reset-btn-text');
        const pwdInput = root.querySelector('#reset-password');
        const confirmInput = root.querySelector('#reset-confirm');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const pwd = pwdInput.value;
            const confirm = confirmInput.value;

            if (!pwd || pwd.length < 8) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>Password must be at least 8 characters long.</span>
                    </div>
                `;
                return;
            }

            if (pwd !== confirm) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>Passwords do not match.</span>
                    </div>
                `;
                return;
            }

            submitBtn.disabled = true;
            btnText.innerHTML = '<span class="spinner" aria-hidden="true"></span> Updating...';

            const res = await authService.resetPassword(pwd, confirm);

            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error}</span>
                    </div>
                `;
                submitBtn.disabled = false;
                btnText.textContent = 'Update Password';
                return;
            }

            alertArea.innerHTML = `
                <div class="alert-box alert-success" role="status">
                    <span>Password updated successfully! Redirecting to login...</span>
                </div>
            `;
            setTimeout(() => router.navigate('#/auth/login'), 1500);
        });
    }
};
