// ==============================================================================
// ImdConnect — Registration View
// Complete, secure registration flow with client & database validation,
// dynamic age verification, live feedback, anti-hammering throttle, and 4-state UI.
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { router } from '../../core/router.js';
import { CONFIG } from '../../config.js';

export const RegisterView = {
    render() {
        const container = document.createElement('main');
        container.className = 'auth-container';

        // Precompute today's date formatted as YYYY-MM-DD for the date picker max attribute
        const todayIso = new Date().toISOString().split('T')[0];

        container.innerHTML = `
            <div class="auth-card" role="region" aria-label="Sign Up Card">
                <header class="auth-header">
                    <a href="#/" class="auth-brand">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Text Only</span>
                    </a>
                    <h1 class="auth-title">Create Account</h1>
                    <p class="auth-subtitle">No phone number required. Connect privately by username.</p>
                </header>

                <div id="reg-alert-area" aria-live="polite"></div>

                <form id="reg-form" class="auth-form" novalidate>
                    <!-- 1. Full Name -->
                    <div class="form-group">
                        <label for="reg-name" class="form-label">Full Name</label>
                        <input 
                            type="text" 
                            id="reg-name" 
                            name="name" 
                            class="form-input" 
                            placeholder="Your visible display name" 
                            autocomplete="name" 
                            minlength="2"
                            maxlength="100"
                            required 
                            autofocus
                        />
                        <span id="name-feedback" class="form-hint">Displayed to your friends on ImdConnect.</span>
                    </div>

                    <!-- 2. Unique Username -->
                    <div class="form-group">
                        <div class="form-row-meta">
                            <label for="reg-username" class="form-label">Unique Username</label>
                            <span id="username-status" class="feedback-text feedback-neutral"></span>
                        </div>
                        <input 
                            type="text" 
                            id="reg-username" 
                            name="username" 
                            class="form-input" 
                            placeholder="e.g. cyber_alex" 
                            autocomplete="username" 
                            spellcheck="false"
                            minlength="3"
                            maxlength="30"
                            required 
                        />
                        <span class="form-hint">3-30 characters: lowercase letters, numbers, and underscores only.</span>
                    </div>

                    <!-- 3. Date of Birth -->
                    <div class="form-group">
                        <div class="form-row-meta">
                            <label for="reg-dob" class="form-label">Date of Birth</label>
                            <span id="dob-feedback"></span>
                        </div>
                        <input 
                            type="date" 
                            id="reg-dob" 
                            name="birthDate" 
                            class="form-input" 
                            max="${todayIso}"
                            required 
                        />
                        <span class="form-hint">Must be at least 13 years old. Kept strictly private and never displayed publicly.</span>
                    </div>

                    <!-- 4. Private Email -->
                    <div class="form-group">
                        <div class="form-row-meta">
                            <label for="reg-email" class="form-label">Private Email</label>
                            <span id="email-feedback" class="feedback-text feedback-neutral"></span>
                        </div>
                        <input 
                            type="email" 
                            id="reg-email" 
                            name="email" 
                            class="form-input" 
                            placeholder="name@example.com" 
                            autocomplete="email" 
                            required 
                        />
                        <span class="form-hint">Used solely for security verification & password recovery. Never shared or visible to peers.</span>
                    </div>

                    <!-- 5. Password -->
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
                                minlength="${CONFIG.PASSWORD_MIN_LENGTH}"
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
                        <div class="password-checklist" id="pwd-checklist" aria-live="polite">
                            <div class="password-criteria-item" id="crit-length">
                                <span class="criteria-icon">○</span>
                                <span>At least 8 characters long</span>
                            </div>
                        </div>
                    </div>

                    <!-- 6. Confirm Password -->
                    <div class="form-group">
                        <div class="form-row-meta">
                            <label for="reg-confirm" class="form-label">Confirm Password</label>
                            <span id="confirm-feedback" class="feedback-text feedback-neutral"></span>
                        </div>
                        <div class="input-wrapper">
                            <input 
                                type="password" 
                                id="reg-confirm" 
                                name="passwordConfirm" 
                                class="form-input" 
                                placeholder="Re-type your password" 
                                autocomplete="new-password" 
                                required 
                            />
                            <button 
                                type="button" 
                                id="toggle-reg-confirm-btn" 
                                class="input-icon-btn" 
                                aria-label="Toggle confirm password visibility"
                                tabindex="-1"
                            >👁️</button>
                        </div>
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

        // Inputs
        const nameInput = root.querySelector('#reg-name');
        const usernameInput = root.querySelector('#reg-username');
        const usernameStatus = root.querySelector('#username-status');
        const dobInput = root.querySelector('#reg-dob');
        const dobFeedback = root.querySelector('#dob-feedback');
        const emailInput = root.querySelector('#reg-email');
        const emailFeedback = root.querySelector('#email-feedback');
        const pwdInput = root.querySelector('#reg-password');
        const togglePwdBtn = root.querySelector('#toggle-reg-pwd-btn');
        const critLength = root.querySelector('#crit-length');
        const confirmInput = root.querySelector('#reg-confirm');
        const toggleConfirmBtn = root.querySelector('#toggle-reg-confirm-btn');
        const confirmFeedback = root.querySelector('#confirm-feedback');

        // State trackers
        let cooldownInterval = null;
        let isUsernameAvailable = false;
        let isCheckingUsername = false;

        // --- Helper: Cooldown Timer (Anti-Hammering UX) ---
        const startCooldownTimer = (seconds) => {
            if (cooldownInterval) clearInterval(cooldownInterval);
            let remaining = seconds;
            submitBtn.disabled = true;
            btnText.textContent = `Please wait (${remaining}s)...`;

            cooldownInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(cooldownInterval);
                    cooldownInterval = null;
                    submitBtn.disabled = false;
                    btnText.textContent = 'Create Free Account';
                } else {
                    btnText.textContent = `Please wait (${remaining}s)...`;
                }
            }, 1000);
        };

        // --- 1. Toggle Password Visibility Buttons ---
        togglePwdBtn.addEventListener('click', () => {
            const isPassword = pwdInput.type === 'password';
            pwdInput.type = isPassword ? 'text' : 'password';
            togglePwdBtn.textContent = isPassword ? '🔒' : '👁️';
        });

        toggleConfirmBtn.addEventListener('click', () => {
            const isPassword = confirmInput.type === 'password';
            confirmInput.type = isPassword ? 'text' : 'password';
            toggleConfirmBtn.textContent = isPassword ? '🔒' : '👁️';
        });

        // --- 2. Live Username Availability Checker & Format Validation ---
        let debounceTimer = null;
        usernameInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const rawVal = usernameInput.value.trim().toLowerCase().replace(/^@/, '');
            usernameInput.value = rawVal; // Auto lowercase & strip @

            if (!rawVal) {
                usernameStatus.textContent = '';
                usernameStatus.className = 'feedback-text feedback-neutral';
                usernameInput.classList.remove('is-valid', 'is-invalid');
                isUsernameAvailable = false;
                return;
            }

            // Quick format check
            if (!CONFIG.USERNAME_REGEX.test(rawVal)) {
                usernameStatus.textContent = '✗ 3-30 letters, numbers, or _';
                usernameStatus.className = 'feedback-text feedback-invalid';
                usernameInput.classList.remove('is-valid');
                usernameInput.classList.add('is-invalid');
                isUsernameAvailable = false;
                return;
            }

            usernameStatus.textContent = 'Checking availability...';
            usernameStatus.className = 'feedback-text feedback-neutral';
            isCheckingUsername = true;

            debounceTimer = setTimeout(async () => {
                const res = await authService.checkUsernameAvailability(rawVal);
                isCheckingUsername = false;

                // Ensure input hasn't changed during request
                if (usernameInput.value !== rawVal) return;

                if (res.available) {
                    usernameStatus.textContent = '✓ Available';
                    usernameStatus.className = 'feedback-text feedback-valid';
                    usernameInput.classList.remove('is-invalid');
                    usernameInput.classList.add('is-valid');
                    isUsernameAvailable = true;
                } else {
                    usernameStatus.textContent = `✗ ${res.error || 'Taken'}`;
                    usernameStatus.className = 'feedback-text feedback-invalid';
                    usernameInput.classList.remove('is-valid');
                    usernameInput.classList.add('is-invalid');
                    isUsernameAvailable = false;
                }
            }, 300);
        });

        // --- 3. Live Date of Birth & Dynamic Age Calculation ---
        const handleDobChange = () => {
            const val = dobInput.value;
            if (!val) {
                dobFeedback.innerHTML = '';
                dobInput.classList.remove('is-valid', 'is-invalid');
                return;
            }

            const ageResult = authService.calculateAge(val);

            if (ageResult.isCompliant) {
                dobFeedback.innerHTML = `<span class="age-pill age-valid">✓ Age: ${ageResult.age} yrs (Eligible)</span>`;
                dobInput.classList.remove('is-invalid');
                dobInput.classList.add('is-valid');
            } else {
                dobFeedback.innerHTML = `<span class="age-pill age-invalid">✗ ${ageResult.error}</span>`;
                dobInput.classList.remove('is-valid');
                dobInput.classList.add('is-invalid');
            }
        };

        dobInput.addEventListener('input', handleDobChange);
        dobInput.addEventListener('change', handleDobChange);

        // --- 4. Live Email Format Validation ---
        emailInput.addEventListener('input', () => {
            const email = emailInput.value.trim().toLowerCase();
            const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

            if (!email) {
                emailFeedback.textContent = '';
                emailInput.classList.remove('is-valid', 'is-invalid');
            } else if (isValid) {
                emailFeedback.textContent = '✓ Valid format';
                emailFeedback.className = 'feedback-text feedback-valid';
                emailInput.classList.remove('is-invalid');
                emailInput.classList.add('is-valid');
            } else {
                emailFeedback.textContent = '✗ Invalid email format';
                emailFeedback.className = 'feedback-text feedback-invalid';
                emailInput.classList.remove('is-valid');
                emailInput.classList.add('is-invalid');
            }
        });

        // --- 5. Live Password Criteria & Confirmation Matching ---
        const checkPasswordMatch = () => {
            const pwd = pwdInput.value;
            const confirm = confirmInput.value;

            // Password length criteria
            if (pwd.length >= CONFIG.PASSWORD_MIN_LENGTH) {
                critLength.classList.add('met');
                critLength.querySelector('.criteria-icon').textContent = '✓';
            } else {
                critLength.classList.remove('met');
                critLength.querySelector('.criteria-icon').textContent = '○';
            }

            // Confirm password matching
            if (!confirm) {
                confirmFeedback.textContent = '';
                confirmFeedback.className = 'feedback-text feedback-neutral';
                confirmInput.classList.remove('is-valid', 'is-invalid');
                return;
            }

            if (pwd === confirm) {
                confirmFeedback.textContent = '✓ Passwords match';
                confirmFeedback.className = 'feedback-text feedback-valid';
                confirmInput.classList.remove('is-invalid');
                confirmInput.classList.add('is-valid');
            } else {
                confirmFeedback.textContent = '✗ Passwords do not match';
                confirmFeedback.className = 'feedback-text feedback-invalid';
                confirmInput.classList.remove('is-valid');
                confirmInput.classList.add('is-invalid');
            }
        };

        pwdInput.addEventListener('input', checkPasswordMatch);
        confirmInput.addEventListener('input', checkPasswordMatch);

        // --- 6. Form Submission & 4-State UI Workflow ---
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const name = nameInput.value.trim();
            const username = usernameInput.value.trim().toLowerCase().replace(/^@/, '');
            const birthDate = dobInput.value;
            const email = emailInput.value.trim().toLowerCase();
            const password = pwdInput.value;
            const passwordConfirm = confirmInput.value;

            // Client Pre-validation checks
            if (!name || name.length < 2) {
                alertArea.innerHTML = `<div class="alert-box alert-error" role="alert"><span>Please enter your full name (minimum 2 characters).</span></div>`;
                nameInput.focus();
                return;
            }

            if (!CONFIG.USERNAME_REGEX.test(username)) {
                alertArea.innerHTML = `<div class="alert-box alert-error" role="alert"><span>Username must be 3-30 lowercase characters (letters, numbers, and underscores only).</span></div>`;
                usernameInput.focus();
                return;
            }

            const ageCheck = authService.calculateAge(birthDate);
            if (!ageCheck.isCompliant) {
                alertArea.innerHTML = `<div class="alert-box alert-error" role="alert"><span>${ageCheck.error || 'You must be at least 13 years old to register.'}</span></div>`;
                dobInput.focus();
                return;
            }

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                alertArea.innerHTML = `<div class="alert-box alert-error" role="alert"><span>Please enter a valid email address.</span></div>`;
                emailInput.focus();
                return;
            }

            if (!password || password.length < CONFIG.PASSWORD_MIN_LENGTH) {
                alertArea.innerHTML = `<div class="alert-box alert-error" role="alert"><span>Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters long.</span></div>`;
                pwdInput.focus();
                return;
            }

            if (password !== passwordConfirm) {
                alertArea.innerHTML = `<div class="alert-box alert-error" role="alert"><span>Passwords do not match. Please re-enter confirmation password.</span></div>`;
                confirmInput.focus();
                return;
            }

            // State 1: Loading
            submitBtn.disabled = true;
            btnText.innerHTML = '<span class="spinner" aria-hidden="true"></span> Creating Account...';

            // Dispatch Registration via AuthService
            const res = await authService.signUp({
                name,
                username,
                birthDate,
                email,
                password,
                passwordConfirm
            });

            // State 2: Error or Rate-limited
            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error || 'Registration could not be completed.'}</span>
                    </div>
                `;

                if (res.rateLimited) {
                    startCooldownTimer(res.retryAfter || 5);
                } else {
                    submitBtn.disabled = false;
                    btnText.textContent = 'Create Free Account';
                }
                return;
            }

            // State 3: Success
            if (res.needsVerification) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-success" role="status">
                        <span>Account created! Verification email has been sent.</span>
                    </div>
                `;
                setTimeout(() => {
                    router.navigate(`#/auth/verify-email?email=${encodeURIComponent(email)}`);
                }, 1000);
            } else {
                alertArea.innerHTML = `
                    <div class="alert-box alert-success" role="status">
                        <span>Welcome to ImdConnect! Preparing your encrypted workspace...</span>
                    </div>
                `;
                setTimeout(() => {
                    router.navigate('#/chats');
                }, 1200);
            }
        });
    }
};
