// ==============================================================================
// ImdConnect — Account Settings View (#/settings/account)
// Manage Display Name, Bio, Identity Media, 7-Day Username Cooldown, & Lifecycle
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { profileService } from '../../services/profile.service.js';
import { CONFIG } from '../../config.js';
import { router } from '../../core/router.js';
import { createSettingsShell } from './settings-shell.js';

export const AccountSettingsView = {
    async render() {
        const user = await authService.getUser();
        const profileRes = await profileService.getProfile();
        const profile = profileRes.profile || {};
        const eligibility = await profileService.getUsernameEligibility();

        const username = profile.username || user?.user_metadata?.username || 'user';
        const displayName = profile.display_name || user?.user_metadata?.display_name || username;
        const email = user?.email || 'private';
        const avatarUrl = profile.avatar_url || '';
        const bannerUrl = profile.banner_url || '';
        const bio = profile.bio || 'Good vibes only.';
        const birthDate = profile.birth_date || 'Kept Strictly Private';

        const contentHtml = `
            <div style="max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="account-alert-area" aria-live="polite"></div>

                <!-- 1. Identity Media Card -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.75rem;">Profile Identity Media</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Only profile avatars and cover banners are permitted. In-chat file attachments are strictly prohibited.
                    </p>
                    
                    <!-- Cover Banner with Overlay -->
                    <div style="position: relative; height: 120px; border-radius: var(--radius-md); overflow: hidden; background: linear-gradient(135deg, #1e293b, #0f172a); margin-bottom: 2.75rem; border: 1px solid var(--border-color);">
                        <img id="cover-preview-img" src="${bannerUrl || 'data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%231e293b\\'/%3E%3C/svg%3E'}" style="width: 100%; height: 100%; object-fit: cover;" alt="Cover" />
                        <label for="cover-file-input" style="position: absolute; right: 0.75rem; bottom: 0.75rem; background: rgba(0,0,0,0.65); color: #fff; padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer; backdrop-filter: blur(4px);">
                            📷 Change Cover
                        </label>
                        <input type="file" id="cover-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />

                        <!-- Overlapping Avatar -->
                        <div style="position: absolute; left: 1rem; bottom: -28px; width: 68px; height: 68px; border-radius: 50%; border: 3px solid var(--bg-surface); overflow: hidden; background: var(--color-primary); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1.4rem; box-shadow: var(--shadow-md);">
                            <img id="avatar-preview-img" src="${avatarUrl || ''}" style="${avatarUrl ? 'display: block;' : 'display: none;'} width: 100%; height: 100%; object-fit: cover;" alt="Avatar" />
                            <span id="avatar-initial" style="${avatarUrl ? 'display: none;' : 'display: block;'}">${displayName.charAt(0).toUpperCase()}</span>
                            <label for="avatar-file-input" style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); opacity: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity var(--transition-fast);" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                                📷
                            </label>
                            <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                        </div>
                    </div>
                </div>

                <!-- 2. Profile Details Form -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem;">Profile Details</h3>
                    <form id="form-edit-account" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label" for="acc-dispname-input">Display Name</label>
                            <input type="text" id="acc-dispname-input" class="form-input" value="${displayName}" minlength="2" maxlength="100" required />
                            <span class="form-hint">Your visible name displayed to your friends and contacts.</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="acc-bio-input">About / Bio</label>
                            <textarea id="acc-bio-input" class="form-input" rows="3" maxlength="500" style="resize: none;">${bio}</textarea>
                            <span class="form-hint">Tell your contacts a little about yourself (max 500 characters).</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Private Recovery Email</label>
                            <input type="text" class="form-input" value="${email}" disabled style="opacity: 0.7; cursor: not-allowed;" />
                            <span class="form-hint">Strictly private. Used solely for account verification & security recovery.</span>
                        </div>

                        <div class="form-group">
                            <div class="form-row-meta">
                                <label class="form-label">Date of Birth</label>
                                <span class="feedback-text feedback-neutral" style="font-size: 0.75rem;">🔒 Private</span>
                            </div>
                            <input type="text" class="form-input" value="${birthDate}" disabled style="opacity: 0.7; cursor: not-allowed;" />
                            <span class="form-hint">Kept strictly private and never displayed publicly or exposed to peers.</span>
                        </div>

                        <button type="submit" id="btn-save-profile-details" class="btn-primary" style="margin-top: 0.5rem; min-height: 42px;">Save Profile Details</button>
                    </form>
                </div>

                <!-- 3. Username Management & 7-Day Cooldown -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                        <h3 style="font-size: 1.05rem; font-weight: 700;">Username Handle</h3>
                        ${eligibility.canChange ? `
                            <span class="age-pill age-valid" style="font-size: 0.75rem;">✓ Eligible to Change</span>
                        ` : `
                            <span class="age-pill age-invalid" style="font-size: 0.75rem;">⏳ Cooldown Active</span>
                        `}
                    </div>

                    <p style="font-size: 0.825rem; color: var(--text-secondary); margin-bottom: 1rem;">
                        Users can change their unique username <strong>only once every 7 days</strong> to maintain identifier integrity.
                    </p>

                    <!-- Cooldown Status Info Box -->
                    <div style="padding: 0.75rem 1rem; border-radius: var(--radius-md); background: var(--bg-surface-elevated); border: 1px solid var(--border-color); margin-bottom: 1.25rem; font-size: 0.825rem;">
                        <div><strong>Current Username:</strong> <span id="current-username-display" style="color: var(--accent); font-weight: 600;">@${username}</span></div>
                        ${!eligibility.canChange ? `
                            <div style="margin-top: 0.35rem; color: var(--color-warning);">
                                ⏳ <strong>Next Available Change:</strong> ${eligibility.formattedNextDate} (${eligibility.daysRemaining} day${eligibility.daysRemaining > 1 ? 's' : ''} remaining)
                            </div>
                        ` : `
                            <div style="margin-top: 0.35rem; color: var(--color-success);">
                                ✓ You may change your username today. Next cooldown will apply immediately after.
                            </div>
                        `}
                    </div>

                    <form id="form-change-username" style="display: flex; flex-direction: column; gap: 0.85rem;">
                        <div class="form-group">
                            <div class="form-row-meta">
                                <label for="new-username-input" class="form-label">New Username</label>
                                <span id="uname-change-feedback" class="feedback-text feedback-neutral"></span>
                            </div>
                            <input 
                                type="text" 
                                id="new-username-input" 
                                class="form-input" 
                                placeholder="Enter new username" 
                                spellcheck="false"
                                autocomplete="off"
                                ${!eligibility.canChange ? 'disabled' : ''}
                                required 
                            />
                            <span class="form-hint">3-30 lowercase characters (letters, numbers, and underscores only).</span>
                        </div>

                        <button 
                            type="submit" 
                            id="btn-submit-username-change" 
                            class="btn-primary" 
                            style="min-height: 42px;" 
                            ${!eligibility.canChange ? 'disabled' : ''}
                        >
                            Update Username
                        </button>
                    </form>
                </div>

                <!-- 4. Account Lifecycle Management -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%; border-color: rgba(239, 68, 68, 0.25);">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--color-danger);">Account Lifecycle</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
                        Temporary deactivation hides your profile until next login. Permanent deletion immediately wipes all messages, media, and friendships.
                    </p>
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <button type="button" id="btn-acc-deactivate" class="btn-secondary" style="flex: 1; color: var(--color-warning); border-color: rgba(245, 158, 11, 0.4);">
                            Deactivate Account
                        </button>
                        <button type="button" id="btn-acc-delete" class="btn-secondary" style="flex: 1; color: var(--color-danger); border-color: rgba(239, 68, 68, 0.4);">
                            Delete Account
                        </button>
                    </div>
                </div>
            </div>
        `;

        const container = createSettingsShell({
            activeSection: 'account',
            title: 'Account Settings',
            description: 'Manage your public handle, bio, and identity media.',
            contentHtml
        });

        this.bindEvents(container, profile, user, eligibility);
        return container;
    },

    bindEvents(root, profile, user, initialEligibility) {
        const alertArea = root.querySelector('#account-alert-area');
        const formProfile = root.querySelector('#form-edit-account');
        const formUsername = root.querySelector('#form-change-username');
        const avatarInput = root.querySelector('#avatar-file-input');
        const coverInput = root.querySelector('#cover-file-input');
        const avatarImg = root.querySelector('#avatar-preview-img');
        const avatarInit = root.querySelector('#avatar-initial');
        const coverImg = root.querySelector('#cover-preview-img');
        const newUnameInput = root.querySelector('#new-username-input');
        const unameFeedback = root.querySelector('#uname-change-feedback');
        const submitUnameBtn = root.querySelector('#btn-submit-username-change');

        // 1. Avatar Upload
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            alertArea.innerHTML = `<div class="alert-box alert-info">Uploading avatar...</div>`;
            const res = await profileService.updateAvatar(file);
            if (!res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            } else {
                avatarImg.src = res.url;
                avatarImg.style.display = 'block';
                if (avatarInit) avatarInit.style.display = 'none';
                alertArea.innerHTML = `<div class="alert-box alert-success">Avatar updated successfully!</div>`;
            }
        });

        // 2. Cover Banner Upload
        coverInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            alertArea.innerHTML = `<div class="alert-box alert-info">Uploading cover banner...</div>`;
            const res = await profileService.updateCover(file);
            if (!res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            } else {
                coverImg.src = res.url;
                alertArea.innerHTML = `<div class="alert-box alert-success">Banner updated successfully!</div>`;
            }
        });

        // 3. Edit Profile Details Submit
        formProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const displayName = root.querySelector('#acc-dispname-input').value.trim();
            const bio = root.querySelector('#acc-bio-input').value.trim();

            const res = await profileService.updateProfile({ displayName, bio });
            if (!res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            } else {
                alertArea.innerHTML = `<div class="alert-box alert-success">Profile details updated successfully!</div>`;
            }
        });

        // 4. Live Debounced Username Availability Check
        let unameDebounce = null;
        if (newUnameInput && initialEligibility.canChange) {
            newUnameInput.addEventListener('input', () => {
                clearTimeout(unameDebounce);
                const rawVal = newUnameInput.value.trim().toLowerCase().replace(/^@/, '');
                newUnameInput.value = rawVal;

                if (!rawVal) {
                    unameFeedback.textContent = '';
                    unameFeedback.className = 'feedback-text feedback-neutral';
                    newUnameInput.classList.remove('is-valid', 'is-invalid');
                    submitUnameBtn.disabled = true;
                    return;
                }

                if (!CONFIG.USERNAME_REGEX.test(rawVal)) {
                    unameFeedback.textContent = '✗ 3-30 letters, numbers, or _';
                    unameFeedback.className = 'feedback-text feedback-invalid';
                    newUnameInput.classList.remove('is-valid');
                    newUnameInput.classList.add('is-invalid');
                    submitUnameBtn.disabled = true;
                    return;
                }

                unameFeedback.textContent = 'Checking availability...';
                unameFeedback.className = 'feedback-text feedback-neutral';

                unameDebounce = setTimeout(async () => {
                    const check = await authService.checkUsernameAvailability(rawVal);
                    if (newUnameInput.value !== rawVal) return;

                    if (check.available) {
                        unameFeedback.textContent = '✓ Available';
                        unameFeedback.className = 'feedback-text feedback-valid';
                        newUnameInput.classList.remove('is-invalid');
                        newUnameInput.classList.add('is-valid');
                        submitUnameBtn.disabled = false;
                    } else {
                        unameFeedback.textContent = `✗ ${check.error || 'Taken'}`;
                        unameFeedback.className = 'feedback-text feedback-invalid';
                        newUnameInput.classList.remove('is-valid');
                        newUnameInput.classList.add('is-invalid');
                        submitUnameBtn.disabled = true;
                    }
                }, 300);
            });
        }

        // 5. Change Username Submit (7-Day Cooldown Server Validation)
        formUsername.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const newUname = newUnameInput.value.trim().toLowerCase().replace(/^@/, '');
            if (!newUname) return;

            submitUnameBtn.disabled = true;
            submitUnameBtn.innerHTML = '<span class="spinner"></span> Updating Username...';

            const res = await profileService.changeUsername(newUname);

            if (!res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                submitUnameBtn.disabled = false;
                submitUnameBtn.textContent = 'Update Username';
                return;
            }

            alertArea.innerHTML = `
                <div class="alert-box alert-success">
                    Username changed successfully to @${res.newUsername}! Next change available after 7 days.
                </div>
            `;
            root.querySelector('#current-username-display').textContent = `@${res.newUsername}`;
            newUnameInput.value = '';
            newUnameInput.disabled = true;
            submitUnameBtn.disabled = true;
            submitUnameBtn.textContent = 'Cooldown Active (7 Days)';
        });

        // 6. Deactivate Account
        root.querySelector('#btn-acc-deactivate').addEventListener('click', async () => {
            if (confirm('Deactivate your account? You can sign in anytime to reactivate.')) {
                const res = await authService.deactivateAccount();
                if (res.success) {
                    alert('Account deactivated.');
                    router.navigate('#/auth/login');
                } else {
                    alert('Deactivation error: ' + res.error);
                }
            }
        });

        // 7. Delete Account
        root.querySelector('#btn-acc-delete').addEventListener('click', async () => {
            const conf = prompt('WARNING: This permanently wipes your account and all text messages. Type "DELETE" to confirm:');
            if (conf === 'DELETE') {
                const res = await authService.deleteAccount();
                if (res.success) {
                    alert('Account permanently deleted.');
                    router.navigate('#/auth/login');
                } else {
                    alert('Deletion error: ' + res.error);
                }
            }
        });
    }
};
