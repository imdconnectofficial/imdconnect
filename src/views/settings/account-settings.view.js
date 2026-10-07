// ==============================================================================
// ImdConnect — Account Settings View (#/settings/account)
// Manage Display Name, Bio, Identity Media, Account Deactivation/Deletion
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { storageService } from '../../services/storage.service.js';
import { supabase } from '../../core/supabase.js';
import { router } from '../../core/router.js';
import { createSettingsShell } from './settings-shell.js';

export const AccountSettingsView = {
    async render() {
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
        const bio = profile?.bio || 'Good vibes only.';

        const contentHtml = `
            <div style="max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="account-alert-area" aria-live="polite"></div>

                <!-- Identity Media Cards -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem;">Profile Identity Media</h3>
                    
                    <!-- Cover Banner -->
                    <div style="position: relative; height: 110px; border-radius: var(--radius-md); overflow: hidden; background: linear-gradient(135deg, #1e293b, #0f172a); margin-bottom: 2.5rem; border: 1px solid var(--border-color);">
                        <img id="cover-preview-img" src="${bannerUrl || 'data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%231e293b\\'/%3E%3C/svg%3E'}" style="width: 100%; height: 100%; object-fit: cover;" alt="Cover" />
                        <label for="cover-file-input" style="position: absolute; right: 0.75rem; bottom: 0.75rem; background: rgba(0,0,0,0.65); color: #fff; padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer;">
                            📷 Change Banner
                        </label>
                        <input type="file" id="cover-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />

                        <!-- Overlapping Avatar -->
                        <div style="position: absolute; left: 1rem; bottom: -30px; width: 68px; height: 68px; border-radius: 50%; border: 3px solid var(--bg-surface); overflow: hidden; background: var(--color-primary); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 1.4rem;">
                            <img id="avatar-preview-img" src="${avatarUrl || ''}" style="${avatarUrl ? 'display: block;' : 'display: none;'} width: 100%; height: 100%; object-fit: cover;" alt="Avatar" />
                            <span id="avatar-initial" style="${avatarUrl ? 'display: none;' : 'display: block;'}">${displayName.charAt(0).toUpperCase()}</span>
                            <label for="avatar-file-input" style="position: absolute; inset: 0; background: rgba(0,0,0,0.45); opacity: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity var(--transition-fast);" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                                📷
                            </label>
                            <input type="file" id="avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                        </div>
                    </div>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Identity media is limited to 2MB JPEG/PNG/WebP. In-chat file attachments are strictly prohibited.</p>
                </div>

                <!-- Account Information Form -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem;">Profile Details</h3>
                    <form id="form-edit-account" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label">Username Handle</label>
                            <input type="text" class="form-input" value="@${username}" disabled style="opacity: 0.7; cursor: not-allowed;" />
                            <span class="form-hint">Username is your permanent identifier on ImdConnect.</span>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Display Name</label>
                            <input type="text" id="acc-dispname-input" class="form-input" value="${displayName}" required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Bio</label>
                            <textarea id="acc-bio-input" class="form-input" rows="3" style="resize: none;">${bio}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Private Recovery Email</label>
                            <input type="text" class="form-input" value="${email}" disabled style="opacity: 0.7; cursor: not-allowed;" />
                            <span class="form-hint">Your email is strictly private and never exposed to other users.</span>
                        </div>
                        <button type="submit" class="btn-primary" style="margin-top: 0.5rem; min-height: 42px;">Save Profile</button>
                    </form>
                </div>

                <!-- Account Lifecycle Management -->
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

        this.bindEvents(container, profile, user);
        return container;
    },

    bindEvents(root, profile, user) {
        const alertArea = root.querySelector('#account-alert-area');
        const form = root.querySelector('#form-edit-account');
        const avatarInput = root.querySelector('#avatar-file-input');
        const coverInput = root.querySelector('#cover-file-input');
        const avatarImg = root.querySelector('#avatar-preview-img');
        const avatarInit = root.querySelector('#avatar-initial');
        const coverImg = root.querySelector('#cover-preview-img');

        // Avatar Upload
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            alertArea.innerHTML = `<div class="alert-box alert-info">Uploading avatar...</div>`;
            const res = await storageService.uploadAvatar(file);
            if (!res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            } else {
                avatarImg.src = res.url;
                avatarImg.style.display = 'block';
                if (avatarInit) avatarInit.style.display = 'none';
                alertArea.innerHTML = `<div class="alert-box alert-success">Avatar updated successfully!</div>`;
            }
        });

        // Cover Upload
        coverInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            alertArea.innerHTML = `<div class="alert-box alert-info">Uploading cover banner...</div>`;
            const res = await storageService.uploadCover(file);
            if (!res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            } else {
                coverImg.src = res.url;
                alertArea.innerHTML = `<div class="alert-box alert-success">Banner updated successfully!</div>`;
            }
        });

        // Edit Profile Form Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            alertArea.innerHTML = '';

            const disp = root.querySelector('#acc-dispname-input').value.trim();
            const bio = root.querySelector('#acc-bio-input').value.trim();

            const { error } = await supabase
                .from('profiles')
                .update({ display_name: disp, bio: bio, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) {
                alertArea.innerHTML = `<div class="alert-box alert-error">${error.message}</div>`;
            } else {
                alertArea.innerHTML = `<div class="alert-box alert-success">Profile updated successfully!</div>`;
            }
        });

        // Deactivate
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

        // Delete
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
