// ==============================================================================
// ImdConnect — Admin Reports Queue View (#/admin/reports)
// Review user complaints, evaluate harassment claims, and take moderation action
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminReportsView = {
    async render() {
        const reports = await adminService.getReports({ status: 'pending' });
        const pendingCount = reports.filter(r => r.status === 'pending').length;

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; max-width: 960px;">
                <div id="reports-alert-area" aria-live="polite"></div>

                <!-- Status Filter Tabs -->
                <div style="display: flex; gap: 0.5rem;">
                    <button type="button" class="filter-pill active btn-filter-rep" data-status="pending">Pending</button>
                    <button type="button" class="filter-pill btn-filter-rep" data-status="resolved">Resolved</button>
                    <button type="button" class="filter-pill btn-filter-rep" data-status="dismissed">Dismissed</button>
                    <button type="button" class="filter-pill btn-filter-rep" data-status="">All</button>
                </div>

                <!-- Reports Cards List -->
                <div id="admin-reports-feed" style="display: flex; flex-direction: column; gap: 1rem;">
                    ${reports.length === 0 ? `
                        <div class="auth-card" style="padding: 2.5rem; text-align: center; color: var(--text-muted); width: 100%;">
                            <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
                            <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary);">Zero pending reports</div>
                            <p style="font-size: 0.85rem; margin-top: 0.25rem;">All harassment tickets have been successfully reviewed and resolved.</p>
                        </div>
                    ` : reports.map(r => `
                        <div class="auth-card" style="padding: 1.25rem; width: 100%; border-left: 4px solid ${r.status === 'pending' ? 'var(--color-danger)' : 'var(--color-success)'};" data-report-id="${r.id}">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                                <div>
                                    <span style="font-size: 0.75rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-full); font-weight: 700; background: rgba(239, 68, 68, 0.15); color: var(--color-danger); text-transform: uppercase;">
                                        ${r.category || 'General'}
                                    </span>
                                    <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">
                                        Submitted ${new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <span style="font-size: 0.775rem; font-weight: 600; text-transform: capitalize; color: ${r.status === 'pending' ? 'var(--color-danger)' : 'var(--color-success)'};">
                                    ● ${r.status}
                                </span>
                            </div>

                            <div style="background: var(--bg-surface-elevated); padding: 0.85rem; border-radius: var(--radius-md); margin-bottom: 0.75rem; font-size: 0.875rem;">
                                <div style="display: flex; gap: 1.5rem; margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">
                                    <div>Reporter: <strong style="color: var(--text-primary);">@${r.reporterUsername}</strong></div>
                                    <div>Reported User: <strong style="color: var(--color-danger);">@${r.reportedUsername}</strong></div>
                                </div>
                                <div style="color: var(--text-primary); line-height: 1.5;">
                                    "${r.reason}"
                                </div>
                            </div>

                            ${r.status === 'pending' ? `
                                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                    <button type="button" class="btn-secondary btn-action-dismiss" data-id="${r.id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.8rem; width: auto;">
                                        Dismiss
                                    </button>
                                    <button type="button" class="btn-primary btn-action-warn" data-id="${r.id}" data-user="${r.reported_user_id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.8rem; width: auto; background: var(--color-warning);">
                                        Issue Warning
                                    </button>
                                    <button type="button" class="btn-primary btn-action-suspend" data-id="${r.id}" data-user="${r.reported_user_id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.8rem; width: auto; background: var(--color-danger);">
                                        Suspend User
                                    </button>
                                </div>
                            ` : `
                                <div style="font-size: 0.8rem; color: var(--text-muted);">
                                    Resolved: ${r.resolution_notes || 'Action completed by moderator.'}
                                </div>
                            `}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const container = createAdminShell({
            activeSection: 'reports',
            title: 'Reports Queue',
            description: 'Evaluate user safety complaints and take decisive moderation actions.',
            contentHtml,
            pendingReportsCount: pendingCount
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#reports-alert-area');
        const filterBtns = root.querySelectorAll('.btn-filter-rep');

        const bindActions = () => {
            // Dismiss
            root.querySelectorAll('.btn-action-dismiss').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const res = await adminService.resolveReport(id, { actionType: 'report_dismissed', notes: 'Report dismissed after investigation.' });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">Report dismissed.</div>`;
                        btn.closest('.auth-card').remove();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                };
            });

            // Warning
            root.querySelectorAll('.btn-action-warn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const userId = btn.dataset.user;
                    const notes = prompt('Notes for warning:');
                    if (notes) {
                        await adminService.moderateUser({ userId, action: 'warning', reason: notes });
                        const res = await adminService.resolveReport(id, { actionType: 'warning_issued', notes });
                        if (res.success) {
                            alertArea.innerHTML = `<div class="alert-box alert-success">Warning issued and report resolved.</div>`;
                            btn.closest('.auth-card').remove();
                        }
                    }
                };
            });

            // Suspend
            root.querySelectorAll('.btn-action-suspend').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    const userId = btn.dataset.user;
                    const notes = prompt('Reason for suspension:');
                    if (notes) {
                        await adminService.moderateUser({ userId, action: 'temporary_suspension', reason: notes });
                        const res = await adminService.resolveReport(id, { actionType: 'user_suspended', notes });
                        if (res.success) {
                            alertArea.innerHTML = `<div class="alert-box alert-success">User suspended and report resolved.</div>`;
                            btn.closest('.auth-card').remove();
                        }
                    }
                };
            });
        };

        filterBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const status = btn.dataset.status;
                const reports = await adminService.getReports({ status });
                const feed = root.querySelector('#admin-reports-feed');

                if (reports.length === 0) {
                    feed.innerHTML = `<div class="auth-card" style="padding: 2.5rem; text-align: center; color: var(--text-muted); width: 100%;">No reports with status "${status || 'all'}"</div>`;
                    return;
                }

                feed.innerHTML = reports.map(r => `
                    <div class="auth-card" style="padding: 1.25rem; width: 100%; border-left: 4px solid ${r.status === 'pending' ? 'var(--color-danger)' : 'var(--color-success)'};" data-report-id="${r.id}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                            <div>
                                <span style="font-size: 0.75rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-full); font-weight: 700; background: rgba(239, 68, 68, 0.15); color: var(--color-danger); text-transform: uppercase;">
                                    ${r.category || 'General'}
                                </span>
                                <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">
                                    Submitted ${new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <span style="font-size: 0.775rem; font-weight: 600; text-transform: capitalize; color: ${r.status === 'pending' ? 'var(--color-danger)' : 'var(--color-success)'};">
                                ● ${r.status}
                            </span>
                        </div>
                        <div style="background: var(--bg-surface-elevated); padding: 0.85rem; border-radius: var(--radius-md); margin-bottom: 0.75rem; font-size: 0.875rem;">
                            <div style="display: flex; gap: 1.5rem; margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">
                                <div>Reporter: <strong style="color: var(--text-primary);">@${r.reporterUsername}</strong></div>
                                <div>Reported User: <strong style="color: var(--color-danger);">@${r.reportedUsername}</strong></div>
                            </div>
                            <div style="color: var(--text-primary); line-height: 1.5;">
                                "${r.reason}"
                            </div>
                        </div>
                    </div>
                `).join('');

                bindActions();
            });
        });

        bindActions();
    }
};
