// ==============================================================================
// ImdConnect — Settings Shell Layout
// Responsive desktop sidebar & mobile navigation shell for all settings views
// ==============================================================================
import { router } from '../../core/router.js';

export function createSettingsShell({ activeSection, title, description, contentHtml }) {
    const container = document.createElement('main');
    container.className = 'app-container';
    container.style.background = 'var(--bg-page)';

    container.innerHTML = `
        <div class="settings-shell-container">
            <!-- Settings Navigation Sidebar (Desktop & Mobile) -->
            <aside class="settings-sidebar">
                <header class="settings-sidebar-header">
                    <button type="button" id="btn-settings-back-chats" class="btn-icon" title="Back to Chats" aria-label="Back to chats">←</button>
                    <div>
                        <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0;">Settings</h2>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Preferences & Security</span>
                    </div>
                </header>

                <nav class="settings-nav-list" aria-label="Settings Categories">
                    <a href="#/settings/account" class="settings-nav-item ${activeSection === 'account' ? 'active' : ''}">
                        <span class="settings-nav-icon">👤</span>
                        <div>
                            <div class="settings-nav-label">Account</div>
                            <div class="settings-nav-sub">Profile, avatar, identity</div>
                        </div>
                    </a>
                    <a href="#/settings/privacy" class="settings-nav-item ${activeSection === 'privacy' ? 'active' : ''}">
                        <span class="settings-nav-icon">🛡️</span>
                        <div>
                            <div class="settings-nav-label">Privacy</div>
                            <div class="settings-nav-sub">Presence, receipts, blocks</div>
                        </div>
                    </a>
                    <a href="#/settings/notifications" class="settings-nav-item ${activeSection === 'notifications' ? 'active' : ''}">
                        <span class="settings-nav-icon">🔔</span>
                        <div>
                            <div class="settings-nav-label">Notifications</div>
                            <div class="settings-nav-sub">Alerts, sounds, previews</div>
                        </div>
                    </a>
                    <a href="#/settings/theme" class="settings-nav-item ${activeSection === 'theme' ? 'active' : ''}">
                        <span class="settings-nav-icon">🌓</span>
                        <div>
                            <div class="settings-nav-label">Theme</div>
                            <div class="settings-nav-sub">Light, dark, system</div>
                        </div>
                    </a>
                    <a href="#/settings/security" class="settings-nav-item ${activeSection === 'security' ? 'active' : ''}">
                        <span class="settings-nav-icon">🔐</span>
                        <div>
                            <div class="settings-nav-label">Security</div>
                            <div class="settings-nav-sub">Password, sessions, auth</div>
                        </div>
                    </a>
                </nav>

                <div style="margin-top: auto; padding: 1rem 1.25rem; border-top: 1px solid var(--border-color);">
                    <a href="#/chats" class="auth-link" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;">
                        <span>💬 Return to Messaging</span>
                    </a>
                </div>
            </aside>

            <!-- Main Content Area -->
            <section class="settings-content-pane">
                <header class="settings-content-header">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <button type="button" id="btn-mobile-settings-back" class="btn-icon" style="display: none;" aria-label="Back">←</button>
                        <div>
                            <h1 style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0;">${title}</h1>
                            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0.2rem 0 0 0;">${description}</p>
                        </div>
                    </div>
                </header>

                <div class="settings-content-body" id="settings-content-body">
                    ${contentHtml}
                </div>
            </section>
        </div>
    `;

    // Bind Back Buttons
    container.querySelector('#btn-settings-back-chats').addEventListener('click', () => {
        router.navigate('#/chats');
    });

    const mobileBack = container.querySelector('#btn-mobile-settings-back');
    if (mobileBack) {
        mobileBack.addEventListener('click', () => {
            router.navigate('#/settings');
        });
    }

    return container;
}
