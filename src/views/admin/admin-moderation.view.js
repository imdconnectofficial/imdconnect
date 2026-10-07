// ==============================================================================
// ImdConnect — Admin Moderation Log View (#/admin/moderation)
// Audit trail of moderation enforcement, suspensions, bans, and policy actions
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminModerationView = {
    async render() {
        const records = await adminService.getModerationRecords({ limit: 50 });

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; max-width: 960px;">
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.35rem;">Audit Trail & Moderation History</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Tamper-evident log of all disciplinary actions taken by system administrators and moderators.
                    </p>

                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem;">
                            <thead>
                                <tr style="background: var(--bg-surface-elevated); border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.775rem; text-transform: uppercase;">
                                    <th style="padding: 0.75rem 1rem;">Target User</th>
                                    <th style="padding: 0.75rem 1rem;">Action</th>
                                    <th style="padding: 0.75rem 1rem;">Reason</th>
                                    <th style="padding: 0.75rem 1rem;">Moderator</th>
                                    <th style="padding: 0.75rem 1rem;">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${records.length === 0 ? `
                                    <tr><td colspan="5" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No moderation records logged</td></tr>
                                ` : records.map(m => `
                                    <tr style="border-bottom: 1px solid var(--border-color);">
                                        <td style="padding: 0.75rem 1rem;">
                                            <span style="font-weight: 600; color: var(--text-primary);">@${m.targetUsername}</span>
                                        </td>
                                        <td style="padding: 0.75rem 1rem;">
                                            <span style="font-size: 0.75rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-full); font-weight: 700; background: ${m.action.includes('ban') || m.action.includes('suspend') ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${m.action.includes('ban') || m.action.includes('suspend') ? 'var(--color-danger)' : 'var(--color-warning)'}; text-transform: capitalize;">
                                                ${m.action.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: var(--text-secondary); font-size: 0.825rem; max-width: 280px;">
                                            ${m.reason}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                                            @${m.moderatorUsername}
                                        </td>
                                        <td style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem;">
                                            ${new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        return createAdminShell({
            activeSection: 'moderation',
            title: 'Moderation Log',
            description: 'Permanent compliance and administrative action records.',
            contentHtml
        });
    }
};
