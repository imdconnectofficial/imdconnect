// ==============================================================================
// ImdConnect — Authenticated Dashboard View (Account & Identity Media)
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { storageService } from '../../services/storage.service.js';
import { supabase } from '../../core/supabase.js';
import { router } from '../../core/router.js';

export const DashboardView = {
    async render() {
        const container = document.createElement('main');
        container.className = 'auth-container';

        const user = await authService.getUser();
        let profile = null;

        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            profile = data;
        }

        const username = profile?.username || user?.user_metadata?.username || 'user';
        const displayName = profile?.display_name || user?.user_metadata?.display_name || username;
        const email = user?.email || 'private';
        const avatarUrl = profile?.avatar_url || '';
        const bannerUrl = profile?.banner_url || '';

        container.innerHTML = `
            <div class="auth-card" style="max-width: 540px;" role="region" aria-label="Account Settings Card">
                
                <!-- User Cover / Banner Preview -->
                <div style="position: relative; height: 120px; border-radius: var(--radius-md) var(--radius-md) 0 0; background: var(--bg-surface-elevated); overflow: hidden; margin: -2rem -1.5rem 2rem -1.5rem; border-bottom: 1px solid var(--border-color);">
                    <img 
                        id="cover-preview-img" 
                        src="${bannerUrl || 'data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%231e293b\\'/%3E%3C/svg%3E'}" 
                        style="width: 100%; height: 100%; object-fit: cover;" 
                        alt="Profile cover banner"
                    />
                    <label for="cover-file-input" style="position: absolute; right: 0.75rem; bottom: 0.75rem; background: rgba(0,0,0,0.6); color: #fff; padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer; user-select: none;">
                        📷 Change Banner
                    </label>
                    <input type="file" id="cover-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                </div>

                <header class="auth-header" style="position: relative; margin-top: -3.5rem;">
                    <!-- User Avatar Circle -->
                    <div style="position: relative; width: 84px; height: 84px; margin: 0 auto 0.75rem auto; border-radius: 50%; border: 3px solid var(--bg-surface); overflow: hidden; background: var(--color-primary-600); display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-md);">
                        <img 
                            id="avatar-preview-img" 
                            src="${avatarUrl || 'data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3Ctext x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%23ffffff\\' font-size=\\'36\\' font-family=\\'sans-serif\\'%3E${username.charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E'}" 
                            style="width: 100%; height: 100%; object-fit: cover;" 
                            alt="Profile avatar"
                        />
                        <label for="avatar-file-input" style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); opacity: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.25rem; cursor: pointer; transition: opacity var(--transition-fast);" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                            📷
                        </label>
                        <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                    </div>

                    <a href="#/" class="auth-brand" style="margin-bottom: 0.25rem;">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Text Only Chat</span>
                    </a>
                    <h1 class="auth-title">@${username}</h1>
                    <p class="auth-subtitle">${displayName}</p>
                </header>

                <div id="dash-alert-area" aria-live="polite"></div>

                <div class="auth-form">
                    <!-- Profile Details Summary -->
                    <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); font-size: 0.875rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="color: var(--text-muted);">Handle:</span>
                            <strong>@${username}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="color: var(--text-muted);">Private Email:</span>
                            <span>${email}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">Chat Type:</span>
                            <span style="color: var(--status-success); font-weight: 600;">Strictly Text-Only</span>
                        </div>
                    </div>

                    <!-- Theme Switcher -->
                    <div class="form-group">
                        <label class="form-label">Theme</label>
                        <select id="theme-selector" class="form-input">
                            <option value="system">System Default</option>
                            <option value="light">Light Theme</option>
                            <option value="dark">Dark Theme</option>
                        </select>
                    </div>

                    <!-- Change Password Accordion -->
                    <details style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem;">
                        <summary style="cursor: pointer; font-weight: 600; color: var(--text-primary);">
                            Change Password
                        </summary>
                        <form id="change-pwd-form" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
                            <input 
                                type="password" 
                                id="new-pwd" 
                                class="form-input" 
                                placeholder="New Password (min 8 chars)" 
                                required 
                            />
                            <input 
                                type="password" 
                                id="confirm-new-pwd" 
                                class="form-input" 
                                placeholder="Confirm New Password" 
                                required 
                            />
                            <button type="submit" class="btn-primary" style="min-height: 40px; font-size: 0.9rem;">
                                Update Password
                            </button>
                        </form>
                    </details>

                    <!-- Session Management -->
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <button type="button" id="btn-logout" class="btn-secondary" style="flex: 1;">
                            Log Out
                        </button>
                        <button type="button" id="btn-logout-all" class="btn-secondary" style="flex: 1;">
                            Log Out All Devices
                        </button>
                    </div>

                    <!-- Account Deactivation & Deletion -->
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem;">
                        <button type="button" id="btn-deactivate" class="btn-secondary" style="color: var(--status-warning); border-color: rgba(245, 158, 11, 0.4); flex: 1;">
                            Deactivate Account
                        </button>
                        <button type="button" id="btn-delete" class="btn-secondary" style="color: var(--status-error); border-color: rgba(244, 63, 94, 0.4); flex: 1;">
                            Delete Account
                        </button>
                    </div>
                </div>

                <footer class="auth-footer">
                    <span>ImdConnect • End-to-End Encrypted Text Messaging</span>
                </footer>
            </div>
        `;

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#dash-alert-area');
        const themeSelector = root.querySelector('#theme-selector');
        const changePwdForm = root.querySelector('#change-pwd-form');
        const logoutBtn = root.querySelector('#btn-logout');
        const logoutAllBtn = root.querySelector('#btn-logout-all');
        const deactivateBtn = root.querySelector('#btn-deactivate');
        const deleteBtn = root.querySelector('#btn-delete');

        const avatarInput = root.querySelector('#avatar-file-input');
        const avatarImg = root.querySelector('#avatar-preview-img');
        const coverInput = root.querySelector('#cover-file-input');
        const coverImg = root.querySelector('#cover-preview-img');

        // Avatar Upload Handler
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            alertArea.innerHTML = `
                <div class="alert-box alert-info">
                    <span>Processing and uploading avatar...</span>
                </div>
            `;

            const res = await storageService.uploadAvatar(file);
            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error}</span>
                    </div>
                `;
            } else {
                avatarImg.src = res.url;
                alertArea.innerHTML = `
                    <div class="alert-box alert-success" role="status">
                        <span>Avatar updated successfully!</span>
                    </div>
                `;
            }
        });

        // Cover Upload Handler
        coverInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            alertArea.innerHTML = `
                <div class="alert-box alert-info">
                    <span>Processing and uploading cover banner...</span>
                </div>
            `;

            const res = await storageService.uploadCover(file);
            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error}</span>
                    </div>
                `;
            } else {
                coverImg.src = res.url;
                alertArea.innerHTML = `
                    <div class="alert-box alert-success" role="status">
                        <span>Banner updated successfully!</span>
                    </div>
                `;
            }
        });

        // Theme Initializer
        const savedTheme = localStorage.getItem('imd_theme') || 'system';
        themeSelector.value = savedTheme;
        themeSelector.addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('imd_theme', val);
            if (val === 'system') {
                document.documentElement.removeAttribute('data-theme');
            } else {
                document.documentElement.setAttribute('data-theme', val);
            }
        });

        // Change Password Form
        changePwdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const newPwd = root.querySelector('#new-pwd').value;
            const confirmNewPwd = root.querySelector('#confirm-new-pwd').value;

            const res = await authService.changePassword(newPwd, confirmNewPwd);
            if (!res.success) {
                alertArea.innerHTML = `
                    <div class="alert-box alert-error" role="alert">
                        <span>${res.error}</span>
                    </div>
                `;
            } else {
                alertArea.innerHTML = `
                    <div class="alert-box alert-success" role="status">
                        <span>Password changed successfully.</span>
                    </div>
                `;
                changePwdForm.reset();
            }
        });

        // Logout
        logoutBtn.addEventListener('click', async () => {
            await authService.logout();
            router.navigate('#/auth/login');
        });

        // Logout All Sessions
        logoutAllBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to log out of all active sessions across all devices?')) {
                await authService.logoutAllSessions();
                router.navigate('#/auth/login');
            }
        });

        // Deactivate Account
        deactivateBtn.addEventListener('click', async () => {
            if (confirm('Deactivating will hide your profile until your next sign-in. Continue?')) {
                const res = await authService.deactivateAccount();
                if (res.success) {
                    alert('Account deactivated. You can sign in anytime to reactivate.');
                    router.navigate('#/auth/login');
                } else {
                    alert('Deactivation failed: ' + res.error);
                }
            }
        });

        // Delete Account
        deleteBtn.addEventListener('click', async () => {
            const promptConfirm = prompt('WARNING: This permanently deletes your account, username, and all messages. Type "DELETE" to confirm:');
            if (promptConfirm === 'DELETE') {
                const res = await authService.deleteAccount();
                if (res.success) {
                    alert('Your account has been permanently deleted.');
                    router.navigate('#/auth/login');
                } else {
                    alert('Deletion failed: ' + res.error);
                }
            }
        });
    }
};
