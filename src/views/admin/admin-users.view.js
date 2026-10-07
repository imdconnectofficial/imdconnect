// ==============================================================================
// ImdConnect — Admin User Management View (#/admin/users)
// Search users, view roles, manage suspensions and account bans
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminUsersView = {
    async render() {
        const users = await adminService.getUsers({ limit: 50 });

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; max-width: 960px;">
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
                    <select id="admin-filter-role" class="form-input" style="width: auto; min-width: 140px;">
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
                                    <th style="padding: 0.75rem 1rem;">User</th>
                                    <th style="padding: 0.75rem 1rem;">Role</th>
                                    <th style="padding: 0.75rem 1rem;">Status</th>
                                    <th style="padding: 0.75rem 1rem;">Joined</th>
                                    <th style="padding: 0.75rem 1rem; text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="admin-users-tbody">
                                ${users.map(u => `
                                    <tr style="border-bottom: 1px solid var(--border-color);" data-user-id="${u.id}">
                                        <td style="padding: 0.75rem 1rem;">
                                            <div style="display: flex; align-items: center; gap: 0.65rem;">
                                                <div class="avatar-wrapper" style="width: 36px; height: 36px; min-width: 36px; font-size: 0.85rem;">
                                                    ${u.avatar_url ? `<img src="${u.avatar_url}" alt="${u.display_name}" />` : `<span>${(u.display_name || 'U').charAt(0).toUpperCase()}</span>`}
                                                </div>
                                                <div>
                                                    <div style="font-weight: 600; color: var(--text-primary);">${u.display_name || 'User'}</div>
                                                    <div style="font-size: 0.75rem; color: var(--text-muted);">@${u.username}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style="padding: 0.75rem 1rem;">
                                            <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-full); font-weight: 600; background: ${u.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : (u.role === 'moderator' ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-surface-elevated)')}; color: ${u.role === 'admin' ? 'var(--color-danger)' : (u.role === 'moderator' ? 'var(--color-secondary)' : 'var(--text-secondary)')};">
                                                ${u.role}
                                            </span>
                                        </td>
                                        <td style="padding: 0.75rem 1rem;">
                                            <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-full); font-weight: 600; background: ${u.status === 'banned' || u.is_suspended ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${u.status === 'banned' || u.is_suspended ? 'var(--color-danger)' : 'var(--color-success)'};">
                                                ${u.status === 'banned' ? 'Banned' : (u.is_suspended ? 'Suspended' : 'Active')}
                                            </span>
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                                            ${new Date(u.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; text-align: right;">
                                            <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                                                <button type="button" class="btn-secondary btn-role-change" data-id="${u.id}" data-role="${u.role}" style="min-height: 30px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto;">
                                                    Role
                                                </button>
                                                ${u.is_suspended || u.status === 'banned' ? `
                                                    <button type="button" class="btn-secondary btn-unsuspend-user" data-id="${u.id}" style="min-height: 30px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-success);">
                                                        Unsuspend
                                                    </button>
                                                ` : `
                                                    <button type="button" class="btn-secondary btn-suspend-user" data-id="${u.id}" style="min-height: 30px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-danger);">
                                                        Suspend
                                                    </button>
                                                `}
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        const container = createAdminShell({
            activeSection: 'users',
            title: 'User Management',
            description: 'Inspect registered profiles, adjust role privileges, and enforce suspensions.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#users-alert-area');
        const searchInput = root.querySelector('#admin-search-users');
        const roleFilter = root.querySelector('#admin-filter-role');

        const refetch = async () => {
            const query = searchInput.value.trim();
            const role = roleFilter.value;
            const users = await adminService.getUsers({ search: query, role: role });
            const tbody = root.querySelector('#admin-users-tbody');
            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No users matching filters</td></tr>`;
                return;
            }
            tbody.innerHTML = users.map(u => `
                <tr style="border-bottom: 1px solid var(--border-color);" data-user-id="${u.id}">
                    <td style="padding: 0.75rem 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.65rem;">
                            <div class="avatar-wrapper" style="width: 36px; height: 36px; min-width: 36px; font-size: 0.85rem;">
                                ${u.avatar_url ? `<img src="${u.avatar_url}" alt="${u.display_name}" />` : `<span>${(u.display_name || 'U').charAt(0).toUpperCase()}</span>`}
                            </div>
                            <div>
                                <div style="font-weight: 600; color: var(--text-primary);">${u.display_name || 'User'}</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">@${u.username}</div>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 0.75rem 1rem;">
                        <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-full); font-weight: 600; background: ${u.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : (u.role === 'moderator' ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-surface-elevated)')}; color: ${u.role === 'admin' ? 'var(--color-danger)' : (u.role === 'moderator' ? 'var(--color-secondary)' : 'var(--text-secondary)')};">
                            ${u.role}
                        </span>
                    </td>
                    <td style="padding: 0.75rem 1rem;">
                        <span style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: var(--radius-full); font-weight: 600; background: ${u.status === 'banned' || u.is_suspended ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${u.status === 'banned' || u.is_suspended ? 'var(--color-danger)' : 'var(--color-success)'};">
                            ${u.status === 'banned' ? 'Banned' : (u.is_suspended ? 'Suspended' : 'Active')}
                        </span>
                    </td>
                    <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                        ${new Date(u.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style="padding: 0.75rem 1rem; text-align: right;">
                        <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                            <button type="button" class="btn-secondary btn-role-change" data-id="${u.id}" data-role="${u.role}" style="min-height: 30px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto;">
                                Role
                            </button>
                            ${u.is_suspended || u.status === 'banned' ? `
                                <button type="button" class="btn-secondary btn-unsuspend-user" data-id="${u.id}" style="min-height: 30px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-success);">
                                    Unsuspend
                                </button>
                            ` : `
                                <button type="button" class="btn-secondary btn-suspend-user" data-id="${u.id}" style="min-height: 30px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-danger);">
                                    Suspend
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `).join('');

            bindRowEvents();
        };

        const bindRowEvents = () => {
            root.querySelectorAll('.btn-role-change').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const currentRole = btn.dataset.role;
                    const newRole = prompt('Set role ("user", "moderator", "admin"):', currentRole);
                    if (newRole && ['user', 'moderator', 'admin'].includes(newRole.toLowerCase())) {
                        const res = await adminService.updateUserRole(id, newRole.toLowerCase());
                        if (res.success) {
                            alertArea.innerHTML = `<div class="alert-box alert-success">Role updated to ${newRole}!</div>`;
                            refetch();
                        } else {
                            alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                        }
                    }
                };
            });

            root.querySelectorAll('.btn-suspend-user').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const reason = prompt('Reason for suspension:');
                    if (reason) {
                        const res = await adminService.moderateUser({ userId: id, action: 'temporary_suspension', reason });
                        if (res.success) {
                            alertArea.innerHTML = `<div class="alert-box alert-success">User suspended.</div>`;
                            refetch();
                        } else {
                            alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                        }
                    }
                };
            });

            root.querySelectorAll('.btn-unsuspend-user').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const res = await adminService.moderateUser({ userId: id, action: 'unsuspend', reason: 'Appeal approved' });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">User reinstated.</div>`;
                        refetch();
                    }
                };
            });
        };

        searchInput.addEventListener('input', () => {
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(refetch, 300);
        });

        roleFilter.addEventListener('change', refetch);
        bindRowEvents();
    }
};
