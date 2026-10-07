// ==============================================================================
// ImdConnect — Admin Groups Moderation View (#/admin/groups)
// Inspect group channels, view ownership, and remove violating rooms
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminGroupsView = {
    async render() {
        const groups = await adminService.getGroups({ limit: 50 });

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; max-width: 960px;">
                <div id="groups-alert-area" aria-live="polite"></div>

                <!-- Search Bar -->
                <div style="display: flex; gap: 0.75rem;">
                    <div style="flex: 1; min-width: 240px;">
                        <input 
                            type="text" 
                            id="admin-search-groups" 
                            class="form-input" 
                            placeholder="Search groups by name..." 
                        />
                    </div>
                </div>

                <!-- Groups Table -->
                <div class="auth-card" style="padding: 0; overflow: hidden; width: 100%;">
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem;">
                            <thead>
                                <tr style="background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.775rem; text-transform: uppercase;">
                                    <th style="padding: 0.75rem 1rem;">Group Name</th>
                                    <th style="padding: 0.75rem 1rem;">Owner</th>
                                    <th style="padding: 0.75rem 1rem;">Description</th>
                                    <th style="padding: 0.75rem 1rem;">Created</th>
                                    <th style="padding: 0.75rem 1rem; text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="admin-groups-tbody">
                                ${groups.length === 0 ? `
                                    <tr><td colspan="5" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No groups created yet</td></tr>
                                ` : groups.map(g => `
                                    <tr style="border-bottom: 1px solid var(--border-color);">
                                        <td style="padding: 0.75rem 1rem;">
                                            <div style="display: flex; align-items: center; gap: 0.65rem;">
                                                <div class="avatar-wrapper" style="width: 36px; height: 36px; min-width: 36px; font-size: 0.85rem;">
                                                    ${g.avatar_url ? `<img src="${g.avatar_url}" alt="${g.name}" />` : `<span>${g.name.charAt(0).toUpperCase()}</span>`}
                                                </div>
                                                <span style="font-weight: 600; color: var(--text-primary);">${g.name}</span>
                                            </div>
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: var(--text-secondary); font-size: 0.825rem;">
                                            ${g.ownerName}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            ${g.description || '—'}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                                            ${new Date(g.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; text-align: right;">
                                            <button type="button" class="btn-secondary btn-delete-group" data-id="${g.conversation_id}" style="min-height: 30px; padding: 0.2rem 0.65rem; font-size: 0.75rem; width: auto; color: var(--color-danger); border-color: rgba(239, 68, 68, 0.3);">
                                                Disband
                                            </button>
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
            activeSection: 'groups',
            title: 'Group Moderation',
            description: 'Monitor group rooms and enforce content compliance policies.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#groups-alert-area');
        const searchInput = root.querySelector('#admin-search-groups');

        const bindDeleteButtons = () => {
            root.querySelectorAll('.btn-delete-group').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    if (confirm('Permanently disband and delete this group? All members will be removed.')) {
                        const res = await adminService.deleteGroup(id, 'Admin moderation violation');
                        if (res.success) {
                            btn.closest('tr').remove();
                            alertArea.innerHTML = `<div class="alert-box alert-success">Group removed.</div>`;
                        } else {
                            alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                        }
                    }
                };
            });
        };

        searchInput.addEventListener('input', async () => {
            clearTimeout(this._timer);
            this._timer = setTimeout(async () => {
                const query = searchInput.value.trim();
                const groups = await adminService.getGroups({ search: query });
                const tbody = root.querySelector('#admin-groups-tbody');
                if (groups.length === 0) {
                    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">No groups found</td></tr>`;
                    return;
                }
                tbody.innerHTML = groups.map(g => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 0.75rem 1rem;">
                            <div style="display: flex; align-items: center; gap: 0.65rem;">
                                <div class="avatar-wrapper" style="width: 36px; height: 36px; min-width: 36px; font-size: 0.85rem;">
                                    ${g.avatar_url ? `<img src="${g.avatar_url}" alt="${g.name}" />` : `<span>${g.name.charAt(0).toUpperCase()}</span>`}
                                </div>
                                <span style="font-weight: 600; color: var(--text-primary);">${g.name}</span>
                            </div>
                        </td>
                        <td style="padding: 0.75rem 1rem; color: var(--text-secondary); font-size: 0.825rem;">
                            ${g.ownerName}
                        </td>
                        <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${g.description || '—'}
                        </td>
                        <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                            ${new Date(g.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style="padding: 0.75rem 1rem; text-align: right;">
                            <button type="button" class="btn-secondary btn-delete-group" data-id="${g.conversation_id}" style="min-height: 30px; padding: 0.2rem 0.65rem; font-size: 0.75rem; width: auto; color: var(--color-danger); border-color: rgba(239, 68, 68, 0.3);">
                                Disband
                            </button>
                        </td>
                    </tr>
                `).join('');
                bindDeleteButtons();
            }, 300);
        });

        bindDeleteButtons();
    }
};
