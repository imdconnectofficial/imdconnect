// ==============================================================================
// ImdConnect — Admin Reports Queue View (#/admin/reports)
// Review user complaints across statuses (Pending, Under review, Resolved, Rejected)
// and report categories (Spam, Harassment, Fake account, Abuse, Threat, Scam, Other).
// Security: Controlled moderation workflow for reported content ONLY.
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminReportsView = {
    async render() {
        const reports = await adminService.getReports({ status: 'pending' });
        const pendingCount = reports.filter(r => r.status === 'pending' || r.status === 'under_review').length;

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; max-width: 1040px;">
                <div id="reports-alert-area" aria-live="polite"></div>

                <!-- Status Filter Tabs & Category Filter Bar -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                    <!-- 4 Status Tabs Requested: Pending, Under review, Resolved, Rejected -->
                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                        <button type="button" class="filter-pill active btn-filter-rep" data-status="pending">Pending</button>
                        <button type="button" class="filter-pill btn-filter-rep" data-status="under_review">Under Review</button>
                        <button type="button" class="filter-pill btn-filter-rep" data-status="resolved">Resolved</button>
                        <button type="button" class="filter-pill btn-filter-rep" data-status="rejected">Rejected</button>
                        <button type="button" class="filter-pill btn-filter-rep" data-status="">All Reports</button>
                    </div>

                    <!-- Category Filter Dropdown with All 7 Types -->
                    <select id="admin-filter-category" class="form-input" style="width: auto; min-width: 170px;">
                        <option value="">All Report Types</option>
                        <option value="spam">Spam</option>
                        <option value="harassment">Harassment</option>
                        <option value="fake_account">Fake Account</option>
                        <option value="abuse">Abuse</option>
                        <option value="threat">Threat</option>
                        <option value="scam">Scam</option>
                        <option value="other">Other</option>
                    </select>
                </div>

                <!-- Reports Cards List -->
                <div id="admin-reports-feed" style="display: flex; flex-direction: column; gap: 1rem;">
                    ${reports.length === 0 ? `
                        <div class="auth-card" style="padding: 2.5rem; text-align: center; color: var(--text-muted); width: 100%;">
                            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">✓</div>
                            <div style="font-weight: 600; font-size: 1.05rem; color: var(--text-primary);">Zero pending reports</div>
                            <p style="font-size: 0.85rem; margin-top: 0.25rem;">All safety and harassment tickets have been addressed.</p>
                        </div>
                    ` : reports.map(r => this.renderReportCardHtml(r)).join('')}
                </div>
            </div>

            <!-- Controlled Moderation Content Inspection Modal -->
            <div id="report-inspect-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; padding: 1rem;">
                <div class="auth-card" style="max-width: 500px; width: 100%; padding: 1.5rem; position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.25rem;">🛡️</span>
                            <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">Controlled Moderation Inspection</h3>
                        </div>
                        <button type="button" id="btn-close-inspect-modal" class="btn-icon" aria-label="Close">✕</button>
                    </div>

                    <div id="report-inspect-modal-body">
                        <!-- Loaded dynamically -->
                    </div>

                    <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.75rem; color: var(--text-muted); margin-top: 1rem; line-height: 1.5;">
                        ⚖️ <strong>Privacy Protection:</strong> Access to this specific reported message is strictly audit-logged. Generic private chat browsing is disabled platform-wide.
                    </div>
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

    renderReportCardHtml(r) {
        const isPending = r.status === 'pending';
        const isUnderReview = r.status === 'under_review';
        const isResolved = r.status === 'resolved';
        const isRejected = r.status === 'rejected';

        const categoryLabels = {
            spam: 'Spam',
            harassment: 'Harassment',
            fake_account: 'Fake Account',
            abuse: 'Abuse',
            threat: 'Threat',
            scam: 'Scam',
            other: 'Other'
        };
        const catLabel = categoryLabels[r.category] || r.category || 'General';

        let badgeBg = 'rgba(239, 68, 68, 0.15)';
        let badgeColor = 'var(--color-danger)';
        if (isUnderReview) {
            badgeBg = 'rgba(245, 158, 11, 0.15)';
            badgeColor = 'var(--color-warning)';
        } else if (isResolved) {
            badgeBg = 'rgba(16, 185, 129, 0.15)';
            badgeColor = 'var(--color-success)';
        } else if (isRejected) {
            badgeBg = 'var(--bg-surface-elevated)';
            badgeColor = 'var(--text-muted)';
        }

        return `
            <div class="auth-card" style="padding: 1.25rem; width: 100%; border-left: 4px solid ${isPending ? 'var(--color-danger)' : (isUnderReview ? 'var(--color-warning)' : (isResolved ? 'var(--color-success)' : 'var(--text-muted)'))};" data-report-id="${r.id}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <span style="font-size: 0.725rem; padding: 0.2rem 0.55rem; border-radius: var(--radius-full); font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; text-transform: uppercase;">
                            ${catLabel}
                        </span>
                        <span style="font-size: 0.775rem; color: var(--text-muted);">
                            Submitted ${new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: ${badgeColor};">
                        ● ${r.status.replace('_', ' ')}
                    </span>
                </div>

                <div style="background: var(--bg-surface-elevated); padding: 0.85rem 1rem; border-radius: var(--radius-md); margin-bottom: 0.85rem; font-size: 0.875rem; border: 1px solid var(--border-color);">
                    <div style="display: flex; gap: 1.5rem; margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--text-muted); flex-wrap: wrap;">
                        <div>Filed by: <strong style="color: var(--text-primary);">@${this.escapeHtml(r.reporter_username || 'user')}</strong></div>
                        <div>Reported User: <strong style="color: var(--color-danger);">@${this.escapeHtml(r.reported_username || 'target')}</strong></div>
                    </div>
                    <div style="color: var(--text-primary); line-height: 1.5; font-size: 0.875rem;">
                        <strong>User Claim:</strong> "${this.escapeHtml(r.reason)}"
                    </div>

                    ${r.has_message_content ? `
                        <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
                            <span style="font-size: 0.775rem; color: var(--text-secondary);">💬 Specific chat message attached</span>
                            <button type="button" class="btn-secondary btn-inspect-content" data-id="${r.id}" style="min-height: 28px; padding: 0.2rem 0.6rem; font-size: 0.75rem; width: auto; color: var(--accent); border-color: var(--accent);">
                                🔍 Inspect Reported Message
                            </button>
                        </div>
                    ` : ''}
                </div>

                ${isPending || isUnderReview ? `
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap;">
                        ${isPending ? `
                            <button type="button" class="btn-secondary btn-action-review" data-id="${r.id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.775rem; width: auto; color: var(--color-warning);">
                                Under Review
                            </button>
                        ` : ''}
                        <button type="button" class="btn-secondary btn-action-reject" data-id="${r.id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.775rem; width: auto; color: var(--text-muted);">
                            Reject
                        </button>
                        <button type="button" class="btn-primary btn-action-warn" data-id="${r.id}" data-user="${r.reported_user_id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.775rem; width: auto; background: var(--color-warning); border: none;">
                            Warn
                        </button>
                        <button type="button" class="btn-primary btn-action-suspend" data-id="${r.id}" data-user="${r.reported_user_id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.775rem; width: auto; background: var(--color-danger); border: none;">
                            Suspend
                        </button>
                        <button type="button" class="btn-primary btn-action-resolve" data-id="${r.id}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.775rem; width: auto; background: var(--color-success); border: none;">
                            Resolve
                        </button>
                    </div>
                ` : `
                    <div style="font-size: 0.8rem; color: var(--text-muted); background: var(--bg-surface-elevated); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);">
                        <strong>Resolution:</strong> ${this.escapeHtml(r.resolution_notes || 'Ticket closed by moderator.')}
                    </div>
                `}
            </div>
        `;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#reports-alert-area');
        const filterBtns = root.querySelectorAll('.btn-filter-rep');
        const categoryFilter = root.querySelector('#admin-filter-category');
        const inspectModal = root.querySelector('#report-inspect-modal');
        const inspectModalBody = root.querySelector('#report-inspect-modal-body');

        root.querySelector('#btn-close-inspect-modal')?.addEventListener('click', () => {
            if (inspectModal) inspectModal.style.display = 'none';
        });

        const refetch = async () => {
            const activeBtn = root.querySelector('.btn-filter-rep.active');
            const status = activeBtn ? activeBtn.dataset.status : 'pending';
            const category = categoryFilter.value;

            const reports = await adminService.getReports({ status, category });
            const feed = root.querySelector('#admin-reports-feed');

            if (reports.length === 0) {
                feed.innerHTML = `<div class="auth-card" style="padding: 2.5rem; text-align: center; color: var(--text-muted); width: 100%;">No reports found under "${status || 'all'}" with category "${category || 'all'}"</div>`;
                return;
            }

            feed.innerHTML = reports.map(r => this.renderReportCardHtml(r)).join('');
            this.bindCardActions(root, alertArea, inspectModal, inspectModalBody, refetch);
        };

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                refetch();
            });
        });

        categoryFilter.addEventListener('change', refetch);

        this.bindCardActions(root, alertArea, inspectModal, inspectModalBody, refetch);
    },

    bindCardActions(root, alertArea, inspectModal, inspectModalBody, refetch) {
        // Controlled Moderation: Inspect Reported Message Content
        root.querySelectorAll('.btn-inspect-content').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                inspectModalBody.innerHTML = '<div style="text-align: center; padding: 1.5rem;"><span class="spinner"></span> Accessing reported snippet...</div>';
                inspectModal.style.display = 'flex';

                const contentData = await adminService.getReportedContent(id);
                if (!contentData || !contentData.has_content) {
                    inspectModalBody.innerHTML = `
                        <div class="alert-box alert-warning">
                            ${contentData?.message || 'Reported message content is no longer available (expired or deleted).'}
                        </div>
                    `;
                    return;
                }

                inspectModalBody.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <div style="font-size: 0.8rem; color: var(--text-muted);">
                            Sender: <strong style="color: var(--color-danger);">@${this.escapeHtml(contentData.sender_username || 'user')}</strong> | 
                            Sent: ${contentData.sent_at ? new Date(contentData.sent_at).toLocaleString() : 'Unknown'}
                        </div>
                        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border-left: 3px solid var(--accent); font-size: 0.95rem; color: var(--text-primary); line-height: 1.6;">
                            "${this.escapeHtml(contentData.content || '')}"
                        </div>
                    </div>
                `;
            };
        });

        // Move to Under Review
        root.querySelectorAll('.btn-action-review').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const res = await adminService.updateReportStatus({
                    reportId: id,
                    status: 'under_review',
                    actionType: 'report_under_review',
                    notes: 'Under investigation by moderator.'
                });
                if (res.success) {
                    alertArea.innerHTML = `<div class="alert-box alert-success">Report moved to Under Review.</div>`;
                    refetch();
                } else {
                    alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                }
            };
        });

        // Reject Report
        root.querySelectorAll('.btn-action-reject').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const reason = prompt('Reason for rejecting report (e.g. false claim, no policy violation):');
                if (reason) {
                    const res = await adminService.updateReportStatus({
                        reportId: id,
                        status: 'rejected',
                        actionType: 'report_rejected',
                        notes: reason
                    });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">Report rejected.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Issue Warning
        root.querySelectorAll('.btn-action-warn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const userId = btn.dataset.user;
                const notes = prompt('Warning notice to issue to user:');
                if (notes) {
                    if (userId) {
                        await adminService.moderateUser({ userId, action: 'warning', reason: notes });
                    }
                    const res = await adminService.updateReportStatus({
                        reportId: id,
                        status: 'resolved',
                        actionType: 'warning_issued',
                        notes: `Warning issued: ${notes}`
                    });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">Warning issued and report resolved.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Suspend User
        root.querySelectorAll('.btn-action-suspend').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const userId = btn.dataset.user;
                const notes = prompt('Reason for user suspension:');
                if (notes) {
                    if (userId) {
                        await adminService.moderateUser({ userId, action: 'suspend', reason: notes });
                    }
                    const res = await adminService.updateReportStatus({
                        reportId: id,
                        status: 'resolved',
                        actionType: 'user_suspended',
                        notes: `User suspended: ${notes}`
                    });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">User suspended and report resolved.</div>`;
                        refetch();
                    } else {
                        alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    }
                }
            };
        });

        // Resolve Report
        root.querySelectorAll('.btn-action-resolve').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const notes = prompt('Resolution summary notes:');
                if (notes) {
                    const res = await adminService.updateReportStatus({
                        reportId: id,
                        status: 'resolved',
                        actionType: 'content_removed',
                        notes: notes
                    });
                    if (res.success) {
                        alertArea.innerHTML = `<div class="alert-box alert-success">Report resolved successfully.</div>`;
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
