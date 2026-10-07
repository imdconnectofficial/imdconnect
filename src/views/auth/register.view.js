// ==============================================================================
// ImdConnect — Registration View
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { router } from '../../core/router.js';

export const RegisterView = {
    render() {
        const container = document.createElement('main');
        container.className = 'auth-container';

        container.innerHTML = `
            <div class="auth-card" role="region" aria-label="Sign Up Card">
                <header class="auth-header">
                    <a href="#/" class="auth-brand">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Text Only</span>
                    </a>
                    <h1 class="auth-title">Create Account</h1>
                    <p class="auth-subtitle">No phone number required. Connect purely by username.</p>
                </header>

                <div id="reg-alert-area" aria-live="polite"></div>

                <form id="reg-form" class="auth-form" novalidate>
                    <div class="form-group">
                        <label for="reg-name" class="form-label">Full Name</label>
                        <input 
                            type="text" 
                            id="reg-name" 
                            name="name" 
                            class="form-input" 
                            placeholder="Your visible display name" 
                            autocomplete="name" 
                            required 
                            autofocus
                        />
                    </div>

                    <div class="form-group">
                        <div class="form-row-meta">
                            <label for="reg-username" class="form-label">Unique Username</label>
                            <span id="username-status" class="form-hint"></span>
                        </div>
                        <input 
                            type="text" 
                            id="reg-username" 
                            name="username" 
                            class="form-input" 
                            placeholder="e.g. cyber_alex" 
                            autocomplete="off" 
                            spellcheck="false"
                            required 
                        />
                        <span class="form-hint">3-30 characters: lowercase letters, numbers, and underscores only.</span>
                    </div>

                    <div class="form-group">
                        <label for="reg-dob" class="form-label">Date of Birth</label>
                        <input 
                            type="date" 
                            id="reg-dob" 
                            name="birthDate" 
                            class="form-input" 
                            required 
                        />
                        <span class="form-hint">Must be at least 13 years old. Kept strictly private.</span>
                    </div>

                    <div class="form-group">
                        <label for="reg-email" class="form-label">Private Email</label>
                        <input 
                            type="email" 
                            id="reg-email" 
                            name="email" 
                            class="form-input" 
                            placeholder="Used solely for verification & recovery" 
                            autocomplete="email" 
                            required 
                        />
                        <span class="form-hint">Never displayed publicly or shared with other users.</span>
                    </div>

                    <div class="form-group">
                        <label for="reg-password" class="form-label">Password</label>
                        <div class="input-wrapper">
                            <input 
                                type="password" 
                                id="reg-password" 
                                name="password" 
                                class="form-input" 
                                placeholder="Minimum 8 characters" 
                                autocomplete="new-password" 
                                required 
                            />
                            <button 
                                type="button" 
                                id="toggle-reg-pwd-btn" 
                                class="input-icon-btn" 
                                aria-label="Toggle password visibility"
                                tabindex="-1"
                            >👁️</button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="reg-confirm" class="form-label">Confirm Password</label>
                        <input 
                            type="password" 
                            id="reg-confirm" 
                            name="passwordConfirm" 
                            class="form-input" 
                            placeholder="Re-type your password" 
                            autocomplete="new-password" 
                            required 
                        />
                    </div>

                    <button type="submit" id="reg-submit-btn" class="btn-primary">
                        <span id="reg-btn-text">Create Free Account</span>
                    </button>
                </form>

                <footer class="auth-footer">
                    <span>Already have an account?</span>
                    <a href="#/auth/login" class="auth-link">Sign in</a>
                </footer>
            </div>
        `;

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const form = root.querySelector('#reg-form');
        const alertArea = root.querySelector('#reg-alert-area');
        const submitBtn = root.querySelector('#reg-submit-btn');
        const btnText = root.querySelector('#reg-btn-text');
        const usernameInput = root.querySelector('#reg-username');
        const usernameStatus = root.querySelector('#username-status');
        const pwdInput = root.querySelector('#reg-password');
        const togglePwdBtn = root.querySelector('#toggle-reg-pwd-btn');

        // Toggle Password Visibility
        togglePwdBtn.addEventListener('click', () => {
            const isPassword = pwdInput.type === 'password';
            pwdInput.type = isPassword ? 'text' : 'password';
            togglePwdBtn.textContent = isPassword ? '🔒' : '👁️';
        });

        // Debounced Live Username Availability Checker
        let debounceTimer = null;
        usernameInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const val = usernameInput.value.trim().toLowerCase().replace(/^@/, '');
            
            if (!val) {
                usernameStatus.textContent = '';
                return;
            }

            usernameStatus.textContent = 'Checking...';
            usernameStatus.style.color = 'var(--text-muted)';

            debounceTimer = setTimeout(async () => {
                const res = await authService.checkUsernameAvailability(val);
                if (res.available) {
                    usernameStatus.textContent = '✓ Available';
                    usernameStatus.style.color = 'var(--status-success)';
                } else {
                    usernameStatus.textContent = `✗ ${res.error || 'Taken'}`;
                    usernameStatus.style.color = 'var(--status-error)';
                }
            }, 350);
        });

        // Form Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const name = root.querySelector('#reg-name').value;
            const username = usernameInput.value;
            const birthDate = root.querySelector('#reg-dob').value;
            const email = root.querySelector('#reg-email').value;
            const password = pwdInput.value;
            const passwordConfirm = root.querySelector('#reg-confirm').value;

            // UI 4-State: Loading
            submitBtn.disabled = true;
            btnText.innerHTML = '<span class="spinner" aria-hidden="true"></span> Creating Account...';

            const res = await authService.signUp({
                name,
                username,
                birthDate,
                email,
                password,
                passwordConfirm
            });

            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error}</span>
                    </div>
                `;
                submitBtn.disabled = false;
                btnText.textContent = 'Create Free Account';
                return;
            }

            // Success Handling
            if (res.needsVerification) {
                router.navigate(`#/auth/verify-email?email=${encodeURIComponent(email)}`);
            } else {
                alertArea.innerHTML = `
                    <div class="alert-box alert-success" role="status">
                        <span>Account created successfully! Redirecting...</span>
                    </div>
                `;
                setTimeout(() => router.navigate('#/app'), 1000);
            }
        });
    }
};
