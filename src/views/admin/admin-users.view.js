// ==============================================================================
// ImdConnect — Admin User Management View (#/admin/users)
// Search, view profile, inspect registration/activity dates, manage status,
// suspend, unsuspend, ban, unban, and delete users.
// Security: Passwords are NEVER displayed or retrievable.
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminUsersView = {
    async render() {
        const users = await adminService.getUsers({ limit: 50 });

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; max-width: 1040px;">
                <div id="users-alert-area" aria-live="polite"></div>

                <!-- Search & Filters Bar -->
                <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 240px; position: relative;">
                        <input 
                            type="text" 
                            id="admin-search-users" 
                            class="form-input" 
                            placeholder="Search by username or display name..." 
                        />
                    </div>
                    <select id="admin-filter-status" class="form-input" style="width: auto; min-width: 140px;">
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="banned">Banned</option>
                    </select>
                    <select id="admin-filter-role" class="form-input" style="width: auto; min-width: 130px;">
                        <option value="">All Roles</option>
                        <option value="user">User</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>

                <!-- Users Table / Card List -->
                <div class="auth-card" style="padding: 0; overflow: hidden; width: 100%;">
                    <div id="admin-users-table-container" style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem;">
                            <thead>
                                <tr style="background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.775rem; text-transform: uppercase;">
                                    <th style="padding: 0.75rem 1rem;">User Profile</th>
                                    <th style="padding: 0.75rem 1rem;">Registration</th>
                                    <th style="padding: 0.75rem 1rem;">Last Activity</th>
                                    <th style="padding: 0.75rem 1rem;">Status</th>
                                    <th style="padding: 0.75rem 1rem; text-align: right;">Moderation Actions</th>
                                </tr>
                            </thead>
                            <tbody id="admin-users-tbody">
                                ${users.length === 0 ? `
                                    <tr><td colspan="5" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No users found</td></tr>
                                ` : users.map(u => this.renderUserRowHtml(u)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- View Profile Modal -->
            <div id="user-profile-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; padding: 1rem;">
                <div class="auth-card" style="max-width: 520px; width: 100%; padding: 1.5rem; position: relative;">
                    <button type="button" id="btn-close-profile-modal" class="btn-icon" style="position: absolute; right: 1rem; top: 1rem;" aria-label="Close">✕</button>
                    <div id="user-profile-modal-body">
                        <!-- Loaded dynamically -->
                    </div>
                </div>
            </div>
        `;

        const container = createAdminShell({
            activeSection: 'users',
            title: 'User Management',
            description: 'Inspect profiles, registration dates, activity records, and enforce moderation.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    renderUserRowHtml(u) {
        const isBanned = u.status === 'banned';
        const isSuspended = u.is_suspended || u.status === 'suspended';
        const regDate = u.created_at ? new Date(u.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown';
        const lastSeen = u.last_seen_at ? new Date(u.last_seen_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';

        return `
            <tr style="border-bottom: 1px solid var(--border-color);" data-user-id="${u.id}">
                <td style="padding: 0.75rem 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <div class="avatar-wrapper" style="width: 36px; height: 36px; min-width: 36px; font-size: 0.85rem;">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" alt="${this.escapeHtml(u.display_name)}" />` : `<span>${this.escapeHtml((u.display_name || 'U').charAt(0).toUpperCase())}</span>`}
                        </div>
                        <div>
                            <div style="font-weight: 600; color: var(--text-primary); cursor: pointer;" class="btn-view-profile" data-id="${u.id}" title="Click to view full profile">
                                ${this.escapeHtml(u.display_name || 'User')}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">@${this.escapeHtml(u.username)}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                    ${regDate}
                </td>
                <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                    ${lastSeen}
                </td>
                <td style="padding: 0.75rem 1rem;">
                    <span style="font-size: 0.725rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-full); font-weight: 700; background: ${isBanned ? 'rgba(239, 68, 68, 0.15)' : (isSuspended ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)')}; color: ${isBanned ? 'var(--color-danger)' : (isSuspended ? 'var(--color-warning)' : 'var(--color-success)')};">
                        ${isBanned ? 'Banned' : (isSuspended ? 'Suspended' : 'Active')}
                    </span>
                </td>
                <td style="padding: 0.75rem 1rem; text-align: right;">
                    <div style="display: flex; gap: 0.35rem; justify-content: flex-end; flex-wrap: wrap;">
                        <button type="button" class="btn-secondary btn-view-profile" data-id="${u.id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto;" title="View Profile">
                            Profile
                        </button>
                        ${isSuspended && !isBanned ? `
                            <button type="button" class="btn-secondary btn-unsuspend-user" data-id="${u.id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-success);" title="Restore Account">
                                Unsuspend
                            </button>
                        ` : (!isBanned ? `
                            <button type="button" class="btn-secondary btn-suspend-user" data-id="${u.id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-warning);" title="Temporarily Suspend">
                                Suspend
                            </button>
                        ` : '')}
                        ${isBanned ? `
                            <button type="button" class="btn-secondary btn-unban-user" data-id="${u.id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-success);" title="Remove Ban">
                                Unban
                            </button>
                        ` : `
                            <button type="button" class="btn-secondary btn-ban-user" data-id="${u.id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-danger);" title="Permanent Ban">
                                Ban
                            </button>
                        `}
                        <button type="button" class="btn-secondary btn-delete-user" data-id="${u.id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-danger); border-color: rgba(239, 68, 68, 0.4);" title="Permanently Delete">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#users-alert-area');
        const searchInput = root.querySelector('#admin-search-users');
        const statusFilter = root.querySelector('#admin-filter-status');
        const roleFilter = root.querySelector('#admin-filter-role');
        const modal = root.querySelector('#user-profile-modal');
        const modalBody = root.querySelector('#user-profile-modal-body');

        // Modal close
        root.querySelector('#btn-close-profile-modal')?.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });

        const refetch = async () => {
            const query = searchInput.value.trim();
            const status = statusFilter.value;
            const role = roleFilter.value;
            const users = await adminService.getUsers({ search: query, status, role });
            const tbody = root.querySelector('#admin-users-tbody');
            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No users matching filters</td></tr>`;
                return;
            }
            tbody.innerHTML = users.map(u => this.renderUserRowHtml(u)).join('');
            this.bindRowActions(root, alertArea, modal, modalBody, refetch);
        };

        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(refetch, 300);
        });

        statusFilter.addEventListener('change', refetch);
        roleFilter.addEventListener('change', refetch);

        this.bindRowActions(root, alertArea, modal, modalBody, refetch);
    },

    bindRowActions(root, alertArea, modal, modalBody, refetch) {
        // View Profile
        root.querySelectorAll('.btn-view-profile').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                modalBody.innerHTML = '<div style="text-align: center; padding: 2rem;"><span class="spinner"></span> Loading profile...</div>';
                modal.style.display = 'flex';

                const p = await adminService.getUserProfile(id);
                if (!p) {
                    modalBody.innerHTML = '<div class="alert-box alert-error">Failed to load user profile.</div>';
                    return;
                }

                modalBody.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div class="avatar-wrapper" style="width: 56px; height: 56px; min-width: 56px; font-size: 1.4rem;">
                                ${p.avatar_url ? `<img src="${p.avatar_url}" alt="${this.escapeHtml(p.display_name)}" />` : `<span>${this.escapeHtml((p.display_name || 'U').charAt(0).toUpperCase())}</span>`}
                            </div>
                            <div>
                                <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0;">${this.escapeHtml(p.display_name || 'User')}</h3>
                                <div style="font-size: 0.85rem; color: var(--accent); font-weight: 600;">@${this.escapeHtml(p.username)}</div>
                                <span style="font-size: 0.725rem; padding: 0.15rem 0.5rem; border-radius: var(--radius-full); font-weight: 700; background: ${p.is_suspended || p.status === 'banned' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${p.is_suspended || p.status === 'banned' ? 'var(--color-danger)' : 'var(--color-success)'}; margin-top: 0.25rem; display: inline-block;">
                                    ${p.status === 'banned' ? 'Banned' : (p.is_suspended ? 'Suspended' : 'Active')}
                                </span>
                            </div>
                        </div>

                        <div style="background: var(--bg-surface-elevated); padding: 0.85rem; border-radius: var(--radius-md); font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                            ${this.escapeHtml(p.bio || 'No bio provided.')}
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.825rem;">
                            <div style="background: var(--bg-surface-elevated); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                <span style="color: var(--text-muted); font-size: 0.725rem;">REGISTRATION DATE</span>
                                <div style="font-weight: 600; margin-top: 0.2rem;">${p.created_at ? new Date(p.created_at).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown'}</div>
                            </div>
                            <div style="background: var(--bg-surface-elevated); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                <span style="color: var(--text-muted); font-size: 0.725rem;">LAST ACTIVITY</span>
                                <div style="font-weight: 600; margin-top: 0.2rem;">${p.last_seen_at ? new Date(p.last_seen_at).toLocaleString() : 'Never'}</div>
                            </div>
                            <div style="background: var(--bg-surface-elevated); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                <span style="color: var(--text-muted); font-size: 0.725rem;">ACCEPTED FRIENDS</span>
                                <div style="font-weight: 600; margin-top: 0.2rem;">${p.friendsCount ?? 0} Contacts</div>
                            </div>
                            <div style="background: var(--bg-surface-elevated); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                <span style="color: var(--text-muted); font-size: 0.725rem;">GROUPS JOINED</span>
                                <div style="font-weight: 600; margin-top: 0.2rem;">${p.groupsCount ?? 0} Rooms</div>
                            </div>
                        </div>

                        <div style="background: rgba(37, 99, 235, 0.08); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid rgba(37, 99, 235, 0.2); font-size: 0.775rem; color: var(--text-secondary); line-height: 1.5;">
                            🔒 <strong>Security Policy:</strong> Plaintext passwords are NEVER stored in the database or visible to administrators. All authentication is cryptographically managed via Supabase Auth.
                        </div>
                    </div>
                `;
            };
        });

        // Suspend
        root.querySelectorAll('.btn-suspend-user').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const reason = prompt('Reason for temporary suspension:');
                if (reason) {
                    const res = await adminService.moderateUser({ userId: id, action: 'suspend', reason });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">User account suspended.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Unsuspend
        root.querySelectorAll('.btn-unsuspend-user').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                if (confirm('Reactivate and unsuspend this user account?')) {
                    const res = await adminService.moderateUser({ userId: id, action: 'unsuspend', reason: 'Reinstated by admin' });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">User account reinstated.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Ban
        root.querySelectorAll('.btn-ban-user').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const reason = prompt('Reason for permanent ban:');
                if (reason) {
                    const res = await adminService.moderateUser({ userId: id, action: 'ban', reason });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">User permanently banned.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Unban
        root.querySelectorAll('.btn-unban-user').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                if (confirm('Remove permanent ban for this user?')) {
                    const res = await adminService.moderateUser({ userId: id, action: 'unban', reason: 'Ban removed by admin' });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">User unbanned successfully.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Delete
        root.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const conf = prompt('WARNING: Permanently delete this user profile? Type "DELETE" to confirm:');
                if (conf === 'DELETE') {
                    const res = await adminService.moderateUser({ userId: id, action: 'delete', reason: 'Account deleted by administrator' });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">User permanently deleted.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });
    },

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/`/g, '&#96;');
    }
};
