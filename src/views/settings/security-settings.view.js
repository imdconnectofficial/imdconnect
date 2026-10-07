// ==============================================================================
// ImdConnect — Security Settings View (#/settings/security)
// Password management, Session termination, and Synthetic Alias verification
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { notificationService } from '../../services/notification.service.js';
import { router } from '../../core/router.js';
import { createSettingsShell } from './settings-shell.js';

export const SecuritySettingsView = {
    async render() {
        const user = await authService.getUser();
        const email = user?.email || 'private';

        const contentHtml = `
            <div style="max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="sec-alert-area" aria-live="polite"></div>

                <!-- Change Password -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem;">Update Password</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Choose a strong password with at least 8 characters.
                    </p>

                    <form id="form-change-pwd" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label">New Password</label>
                            <input type="password" id="sec-new-pwd" class="form-input" placeholder="Enter new password (min 8 chars)" required minlength="8" />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Confirm New Password</label>
                            <input type="password" id="sec-confirm-pwd" class="form-input" placeholder="Confirm new password" required minlength="8" />
                        </div>
                        <button type="submit" class="btn-primary" style="margin-top: 0.5rem; min-height: 42px;">
                            Update Password
                        </button>
                    </form>
                </div>

                <!-- Session Management -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem;">Active Sessions & Devices</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Manage devices currently authenticated into your ImdConnect account.
                    </p>

                    <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <span style="font-size: 1.5rem;">💻</span>
                            <div>
                                <div style="font-weight: 600; font-size: 0.9rem;">Current Browser Session</div>
                                <div style="font-size: 0.75rem; color: var(--color-success); font-weight: 500;">● Active Now</div>
                            </div>
                        </div>
                        <button type="button" id="btn-sec-logout-current" class="btn-secondary" style="min-height: 34px; padding: 0.25rem 0.75rem; font-size: 0.775rem; width: auto;">
                            Log Out
                        </button>
                    </div>

                    <button type="button" id="btn-sec-logout-all" class="btn-secondary" style="color: var(--color-danger); border-color: rgba(239, 68, 68, 0.35); width: 100%;">
                        Log Out All Active Devices
                    </button>
                </div>

                <!-- Synthetic Alias Verification Card -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%; background: var(--bg-surface-elevated);">
                    <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">🛡️</span>
                        <h3 style="font-size: 1rem; font-weight: 700; margin: 0;">Synthetic Identity Shield</h3>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-secondary); line-height: 1.6; margin: 0;">
                        Your account operates under our deterministic synthetic alias pattern. Your mobile number is never stored, and your recovery email (<code>${email}</code>) is strictly segregated and inaccessible to any other user.
                    </p>
                </div>
            </div>
        `;

        const container = createSettingsShell({
            activeSection: 'security',
            title: 'Security Settings',
            description: 'Password controls, active sessions, and synthetic identity privacy.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#sec-alert-area');
        const form = root.querySelector('#form-change-pwd');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const p1 = root.querySelector('#sec-new-pwd').value;
            const p2 = root.querySelector('#sec-confirm-pwd').value;

            const res = await authService.changePassword(p1, p2);
            if (res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-success">Password updated successfully!</div>`;
                form.reset();
                notificationService.sendSecurityAlert({
                    title: 'Password Updated',
                    body: 'Your account password was successfully updated.',
                    data: { event: 'password_updated' }
                });
            } else {
                alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            }
        });

        root.querySelector('#btn-sec-logout-current').addEventListener('click', async () => {
            await authService.logout();
            router.navigate('#/auth/login');
        });

        root.querySelector('#btn-sec-logout-all').addEventListener('click', async () => {
            if (confirm('Log out of all active devices and sessions?')) {
                await notificationService.sendSecurityAlert({
                    title: 'Active Sessions Terminated',
                    body: 'All active sessions across other devices were terminated.',
                    data: { event: 'sessions_terminated' }
                });
                await authService.logoutAllSessions();
                router.navigate('#/auth/login');
            }
        });
    }
};
