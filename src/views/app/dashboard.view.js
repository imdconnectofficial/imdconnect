// ==============================================================================
// ImdConnect — Authenticated Dashboard View (Account & Security Center)
// ==============================================================================
import { authService } from '../../services/auth.service.js';
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

        container.innerHTML = `
            <div class="auth-card" style="max-width: 520px;" role="region" aria-label="Account Settings Card">
                <header class="auth-header">
                    <a href="#/" class="auth-brand">
                        <span>ImdConnect</span>
                        <span class="auth-brand-badge">Online</span>
                    </a>
                    <h1 class="auth-title">Account Center</h1>
                    <p class="auth-subtitle">Signed in as <strong>@${username}</strong> (${displayName})</p>
                </header>

                <div id="dash-alert-area" aria-live="polite"></div>

                <div class="auth-form">
                    <!-- Profile Summary Box -->
                    <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); font-size: 0.875rem;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="color: var(--text-muted);">Username:</span>
                            <strong>@${username}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <span style="color: var(--text-muted);">Private Email:</span>
                            <span>${email}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: var(--text-muted);">User ID:</span>
                            <code style="font-size: 0.75rem; font-family: var(--font-mono);">${user?.id?.slice(0, 8)}...</code>
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
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.5rem;">
                        <button type="button" id="btn-deactivate" class="btn-secondary" style="color: var(--status-warning); border-color: rgba(245, 158, 11, 0.4); flex: 1;">
                            Deactivate Account
                        </button>
                        <button type="button" id="btn-delete" class="btn-secondary" style="color: var(--status-error); border-color: rgba(244, 63, 94, 0.4); flex: 1;">
                            Delete Account
                        </button>
                    </div>
                </div>

                <footer class="auth-footer">
                    <span>ImdConnect v1.0 • Privacy-Focused Architecture</span>
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

        // Delete Account (GDPR cascade)
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
