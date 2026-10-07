// ==============================================================================
// ImdConnect — Admin Portal Shell Layout
// Dedicated admin layout with secure navigation, KPIs, and responsive drawer
// ==============================================================================
import { router } from '../../core/router.js';

export function createAdminShell({ activeSection, title, description, contentHtml, pendingReportsCount = 0 }) {
    const container = document.createElement('main');
    container.className = 'app-container';
    container.style.background = 'var(--bg-page)';

    container.innerHTML = `
        <div class="settings-shell-container">
            <!-- Admin Navigation Sidebar -->
            <aside class="settings-sidebar" style="background: var(--bg-surface);">
                <header class="settings-sidebar-header">
                    <a href="#/admin" class="brand-logo" style="gap: 0.5rem;">
                        <div class="brand-icon-box" style="background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid var(--accent); color: var(--accent);">🛡️</div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 1.05rem; font-weight: 700;">ImdConnect</span>
                            <span style="font-size: 0.7rem; color: var(--accent); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Admin Portal</span>
                        </div>
                    </a>
                </header>

                <nav class="settings-nav-list" aria-label="Admin Navigation">
                    <a href="#/admin" class="settings-nav-item ${activeSection === 'overview' ? 'active' : ''}">
                        <span class="settings-nav-icon">📊</span>
                        <div>
                            <div class="settings-nav-label">Overview</div>
                            <div class="settings-nav-sub">System metrics & KPIs</div>
                        </div>
                    </a>
                    <a href="#/admin/users" class="settings-nav-item ${activeSection === 'users' ? 'active' : ''}">
                        <span class="settings-nav-icon">👥</span>
                        <div>
                            <div class="settings-nav-label">User Management</div>
                            <div class="settings-nav-sub">Roles, bans, suspensions</div>
                        </div>
                    </a>
                    <a href="#/admin/groups" class="settings-nav-item ${activeSection === 'groups' ? 'active' : ''}">
                        <span class="settings-nav-icon">💬</span>
                        <div>
                            <div class="settings-nav-label">Groups</div>
                            <div class="settings-nav-sub">Moderation & channels</div>
                        </div>
                    </a>
                    <a href="#/admin/reports" class="settings-nav-item ${activeSection === 'reports' ? 'active' : ''}">
                        <span class="settings-nav-icon">⚠️</span>
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span class="settings-nav-label">Reports Queue</span>
                                ${pendingReportsCount > 0 ? `<span class="nav-pill-badge badge-danger">${pendingReportsCount}</span>` : ''}
                            </div>
                            <div class="settings-nav-sub">User harassment tickets</div>
                        </div>
                    </a>
                    <a href="#/admin/moderation" class="settings-nav-item ${activeSection === 'moderation' ? 'active' : ''}">
                        <span class="settings-nav-icon">📜</span>
                        <div>
                            <div class="settings-nav-label">Moderation Log</div>
                            <div class="settings-nav-sub">Audit trail of actions</div>
                        </div>
                    </a>
                </nav>

                <div style="margin-top: auto; padding: 1rem 1.25rem; border-top: 1px solid var(--border-color);">
                    <a href="#/chats" class="auth-link" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;">
                        <span>💬 Return to Application</span>
                    </a>
                </div>
            </aside>

            <!-- Main Admin Content Pane -->
            <section class="settings-content-pane">
                <header class="settings-content-header" style="justify-content: space-between;">
                    <div>
                        <h1 style="font-size: 1.35rem; font-weight: 700; color: var(--text-primary); margin: 0;">${title}</h1>
                        <p style="font-size: 0.825rem; color: var(--text-muted); margin: 0.2rem 0 0 0;">${description}</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 0.75rem; background: var(--accent-light); color: var(--accent); padding: 0.2rem 0.6rem; border-radius: var(--radius-full); font-weight: 600;">
                            RLS Secured
                        </span>
                    </div>
                </header>

                <div class="settings-content-body" style="padding: 1.5rem;">
                    ${contentHtml}
                </div>
            </section>
        </div>
    `;

    return container;
}
