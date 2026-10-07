// ==============================================================================
// ImdConnect — Admin Groups Moderation View (#/admin/groups)
// Search groups, inspect ownership, view members roster, moderate group metadata,
// and suspend/unsuspend groups according to policy.
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminGroupsView = {
    async render() {
        const groups = await adminService.getGroups({ limit: 50 });

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; max-width: 1040px;">
                <div id="groups-alert-area" aria-live="polite"></div>

                <!-- Search Bar -->
                <div style="display: flex; gap: 0.75rem;">
                    <div style="flex: 1; min-width: 240px;">
                        <input 
                            type="text" 
                            id="admin-search-groups" 
                            class="form-input" 
                            placeholder="Search groups by name or description..." 
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
                                    <th style="padding: 0.75rem 1rem;">Status</th>
                                    <th style="padding: 0.75rem 1rem;">Created</th>
                                    <th style="padding: 0.75rem 1rem; text-align: right;">Moderation Actions</th>
                                </tr>
                            </thead>
                            <tbody id="admin-groups-tbody">
                                ${groups.length === 0 ? `
                                    <tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No groups created yet</td></tr>
                                ` : groups.map(g => this.renderGroupRowHtml(g)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Members Roster Modal -->
            <div id="group-members-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; padding: 1rem;">
                <div class="auth-card" style="max-width: 500px; width: 100%; padding: 1.5rem; position: relative; max-height: 80vh; display: flex; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 id="group-modal-title" style="font-size: 1.1rem; font-weight: 700; margin: 0;">Group Members</h3>
                        <button type="button" id="btn-close-members-modal" class="btn-icon" aria-label="Close">✕</button>
                    </div>
                    <div id="group-members-modal-body" style="overflow-y: auto; flex: 1;">
                        <!-- Loaded dynamically -->
                    </div>
                </div>
            </div>

            <!-- Moderate Group Modal -->
            <div id="group-moderate-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; padding: 1rem;">
                <div class="auth-card" style="max-width: 480px; width: 100%; padding: 1.5rem; position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Moderate Group</h3>
                        <button type="button" id="btn-close-moderate-modal" class="btn-icon" aria-label="Close">✕</button>
                    </div>
                    <form id="form-moderate-group" style="display: flex; flex-direction: column; gap: 1rem;">
                        <input type="hidden" id="mod-group-id" />
                        <div class="form-group">
                            <label class="form-label" for="mod-group-name">Group Name</label>
                            <input type="text" id="mod-group-name" class="form-input" required minlength="2" maxlength="100" />
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="mod-group-desc">Description</label>
                            <textarea id="mod-group-desc" class="form-input" rows="3" maxlength="300" style="resize: none;"></textarea>
                        </div>
                        <button type="submit" class="btn-primary" style="margin-top: 0.5rem; min-height: 40px;">
                            Save Changes
                        </button>
                    </form>
                </div>
            </div>
        `;

        const container = createAdminShell({
            activeSection: 'groups',
            title: 'Group Moderation',
            description: 'Monitor group rooms, inspect member rosters, and enforce room compliance.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    renderGroupRowHtml(g) {
        const isSuspended = g.is_suspended === true;

        return `
            <tr style="border-bottom: 1px solid var(--border-color);" data-group-id="${g.conversation_id}">
                <td style="padding: 0.75rem 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.65rem;">
                        <div class="avatar-wrapper" style="width: 36px; height: 36px; min-width: 36px; font-size: 0.85rem;">
                            ${g.avatar_url ? `<img src="${g.avatar_url}" alt="${this.escapeHtml(g.name)}" />` : `<span>${this.escapeHtml(g.name.charAt(0).toUpperCase())}</span>`}
                        </div>
                        <span style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(g.name)}</span>
                    </div>
                </td>
                <td style="padding: 0.75rem 1rem; color: var(--text-secondary); font-size: 0.825rem;">
                    ${this.escapeHtml(g.ownerName)}
                </td>
                <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${this.escapeHtml(g.description || '—')}
                </td>
                <td style="padding: 0.75rem 1rem;">
                    <span style="font-size: 0.725rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-full); font-weight: 700; background: ${isSuspended ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${isSuspended ? 'var(--color-danger)' : 'var(--color-success)'};">
                        ${isSuspended ? 'Suspended' : 'Active'}
                    </span>
                </td>
                <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                    ${new Date(g.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style="padding: 0.75rem 1rem; text-align: right;">
                    <div style="display: flex; gap: 0.35rem; justify-content: flex-end; flex-wrap: wrap;">
                        <button type="button" class="btn-secondary btn-view-members" data-id="${g.conversation_id}" data-name="${this.escapeHtml(g.name)}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto;" title="View Members">
                            Members
                        </button>
                        <button type="button" class="btn-secondary btn-moderate-group" data-id="${g.conversation_id}" data-name="${this.escapeHtml(g.name)}" data-desc="${this.escapeHtml(g.description || '')}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto;" title="Edit / Moderate Details">
                            Moderate
                        </button>
                        ${isSuspended ? `
                            <button type="button" class="btn-secondary btn-unsuspend-group" data-id="${g.conversation_id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-success);" title="Reactivate Group">
                                Unsuspend
                            </button>
                        ` : `
                            <button type="button" class="btn-secondary btn-suspend-group" data-id="${g.conversation_id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-warning);" title="Suspend Group Policy">
                                Suspend
                            </button>
                        `}
                        <button type="button" class="btn-secondary btn-disband-group" data-id="${g.conversation_id}" style="min-height: 28px; padding: 0.2rem 0.5rem; font-size: 0.75rem; width: auto; color: var(--color-danger); border-color: rgba(239, 68, 68, 0.4);" title="Permanently Disband">
                            Disband
                        </button>
                    </div>
                </td>
            </tr>
        `;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#groups-alert-area');
        const searchInput = root.querySelector('#admin-search-groups');
        const membersModal = root.querySelector('#group-members-modal');
        const membersModalBody = root.querySelector('#group-members-modal-body');
        const membersModalTitle = root.querySelector('#group-modal-title');
        const moderateModal = root.querySelector('#group-moderate-modal');
        const formModerate = root.querySelector('#form-moderate-group');

        // Modal Close triggers
        root.querySelector('#btn-close-members-modal')?.addEventListener('click', () => {
            if (membersModal) membersModal.style.display = 'none';
        });
        root.querySelector('#btn-close-moderate-modal')?.addEventListener('click', () => {
            if (moderateModal) moderateModal.style.display = 'none';
        });

        const refetch = async () => {
            const query = searchInput.value.trim();
            const groups = await adminService.getGroups({ search: query });
            const tbody = root.querySelector('#admin-groups-tbody');
            if (groups.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No groups found</td></tr>`;
                return;
            }
            tbody.innerHTML = groups.map(g => this.renderGroupRowHtml(g)).join('');
            this.bindRowActions(root, alertArea, membersModal, membersModalBody, membersModalTitle, moderateModal, refetch);
        };

        let timer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(refetch, 300);
        });

        // Submit Moderate Form
        formModerate.addEventListener('submit', async (e) => {
            e.preventDefault();
            const gid = root.querySelector('#mod-group-id').value;
            const newName = root.querySelector('#mod-group-name').value.trim();
            const newDesc = root.querySelector('#mod-group-desc').value.trim();

            const res = await adminService.moderateGroup({
                groupId: gid,
                action: 'update',
                newName,
                newDescription: newDesc
            });

            if (res.success) {
                moderateModal.style.display = 'none';
                alertArea.innerHTML = `<div class="alert-box alert-success">Group details updated successfully!</div>`;
                refetch();
            } else {
                alert('Failed to update group: ' + res.error);
            }
        });

        this.bindRowActions(root, alertArea, membersModal, membersModalBody, membersModalTitle, moderateModal, refetch);
    },

    bindRowActions(root, alertArea, membersModal, membersModalBody, membersModalTitle, moderateModal, refetch) {
        // View Members
        root.querySelectorAll('.btn-view-members').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                membersModalTitle.textContent = `${name} — Members`;
                membersModalBody.innerHTML = '<div style="text-align: center; padding: 2rem;"><span class="spinner"></span> Loading members...</div>';
                membersModal.style.display = 'flex';

                const members = await adminService.getGroupMembers(id);
                if (members.length === 0) {
                    membersModalBody.innerHTML = '<div style="text-align: center; padding: 1.5rem; color: var(--text-muted);">No active members found.</div>';
                    return;
                }

                membersModalBody.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${members.map(m => `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); background: var(--bg-surface-elevated); border: 1px solid var(--border-color);">
                                <div style="display: flex; align-items: center; gap: 0.65rem;">
                                    <div class="avatar-wrapper" style="width: 32px; height: 32px; min-width: 32px; font-size: 0.8rem;">
                                        ${m.avatar_url ? `<img src="${m.avatar_url}" alt="${this.escapeHtml(m.display_name)}" />` : `<span>${this.escapeHtml(m.display_name.charAt(0).toUpperCase())}</span>`}
                                    </div>
                                    <div>
                                        <div style="font-weight: 600; font-size: 0.85rem;">${this.escapeHtml(m.display_name)}</div>
                                        <div style="font-size: 0.725rem; color: var(--text-muted);">@${this.escapeHtml(m.username)}</div>
                                    </div>
                                </div>
                                <span style="font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: var(--radius-full); font-weight: 700; text-transform: uppercase; background: ${m.role === 'owner' ? 'rgba(37, 99, 235, 0.15)' : (m.role === 'admin' ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-surface)')}; color: ${m.role === 'owner' ? 'var(--accent)' : (m.role === 'admin' ? 'var(--color-secondary)' : 'var(--text-muted)')};">
                                    ${m.role}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                `;
            };
        });

        // Moderate Details
        root.querySelectorAll('.btn-moderate-group').forEach(btn => {
            btn.onclick = () => {
                root.querySelector('#mod-group-id').value = btn.dataset.id;
                root.querySelector('#mod-group-name').value = btn.dataset.name;
                root.querySelector('#mod-group-desc').value = btn.dataset.desc;
                moderateModal.style.display = 'flex';
            };
        });

        // Suspend Group
        root.querySelectorAll('.btn-suspend-group').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const reason = prompt('Reason for group suspension (violating terms, spam, etc.):');
                if (reason) {
                    const res = await adminService.moderateGroup({ groupId: id, action: 'suspend', reason });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">Group suspended according to policy.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Unsuspend Group
        root.querySelectorAll('.btn-unsuspend-group').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                if (confirm('Reactivate and unsuspend this group?')) {
                    const res = await adminService.moderateGroup({ groupId: id, action: 'unsuspend' });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">Group reinstated successfully.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Disband Group
        root.querySelectorAll('.btn-disband-group').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                if (confirm('Permanently disband and delete this group? All room records will be removed.')) {
                    const res = await adminService.moderateGroup({ groupId: id, action: 'disband', reason: 'Admin moderation violation' });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">Group permanently disbanded.</div>`;
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
