// ==============================================================================
// ImdConnect — Theme Settings View (#/settings/theme)
// Interactive visual theme selector (Light, Dark, System Default)
// ==============================================================================
import { createSettingsShell } from './settings-shell.js';

export const ThemeSettingsView = {
    render() {
        const currentTheme = localStorage.getItem('imd_theme') || 'system';

        const contentHtml = `
            <div style="max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem;">Appearance Mode</h3>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
                        Choose your preferred visual presentation. Themes update instantly across all panes.
                    </p>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem;">
                        <!-- Light Theme Card -->
                        <div class="theme-choice-card ${currentTheme === 'light' ? 'active' : ''}" data-theme="light" style="border: 2px solid ${currentTheme === 'light' ? 'var(--accent)' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; background: #ffffff; color: #0f172a; transition: border-color var(--transition-fast);">
                            <div style="height: 60px; background: #f8fafc; border-radius: var(--radius-sm); border: 1px solid #e2e8f0; padding: 0.5rem; margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
                                <div style="height: 10px; width: 60%; background: #2563eb; border-radius: 4px;"></div>
                                <div style="height: 8px; width: 85%; background: #e2e8f0; border-radius: 4px;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; font-size: 0.95rem;">☀️ Light</span>
                                ${currentTheme === 'light' ? '<span style="color: var(--accent); font-weight: bold;">✓</span>' : ''}
                            </div>
                        </div>

                        <!-- Dark Theme Card -->
                        <div class="theme-choice-card ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark" style="border: 2px solid ${currentTheme === 'dark' ? 'var(--accent)' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; background: #1e293b; color: #f8fafc; transition: border-color var(--transition-fast);">
                            <div style="height: 60px; background: #0f172a; border-radius: var(--radius-sm); border: 1px solid #2e3a52; padding: 0.5rem; margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
                                <div style="height: 10px; width: 60%; background: #2563eb; border-radius: 4px;"></div>
                                <div style="height: 8px; width: 85%; background: #26334d; border-radius: 4px;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; font-size: 0.95rem;">🌙 Dark</span>
                                ${currentTheme === 'dark' ? '<span style="color: var(--accent); font-weight: bold;">✓</span>' : ''}
                            </div>
                        </div>

                        <!-- System Default Card -->
                        <div class="theme-choice-card ${currentTheme === 'system' ? 'active' : ''}" data-theme="system" style="border: 2px solid ${currentTheme === 'system' ? 'var(--accent)' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; background: var(--bg-surface); color: var(--text-primary); transition: border-color var(--transition-fast);">
                            <div style="height: 60px; background: linear-gradient(135deg, #f8fafc 50%, #0f172a 50%); border-radius: var(--radius-sm); border: 1px solid var(--border-color); padding: 0.5rem; margin-bottom: 0.75rem;">
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; font-size: 0.95rem;">🌓 System</span>
                                ${currentTheme === 'system' ? '<span style="color: var(--accent); font-weight: bold;">✓</span>' : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Brand Color Palette Showcase -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.75rem;">ImdConnect Color Tokens</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.75rem;">
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #2563eb; color: #fff; font-size: 0.8rem; font-weight: 600;">
                            <div>Primary</div>
                            <div style="font-size: 0.7rem; opacity: 0.85;">#2563EB</div>
                        </div>
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #8b5cf6; color: #fff; font-size: 0.8rem; font-weight: 600;">
                            <div>Secondary</div>
                            <div style="font-size: 0.7rem; opacity: 0.85;">#8B5CF6</div>
                        </div>
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #10b981; color: #fff; font-size: 0.8rem; font-weight: 600;">
                            <div>Success</div>
                            <div style="font-size: 0.7rem; opacity: 0.85;">#10B981</div>
                        </div>
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #ef4444; color: #fff; font-size: 0.8rem; font-weight: 600;">
                            <div>Danger</div>
                            <div style="font-size: 0.7rem; opacity: 0.85;">#EF4444</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const container = createSettingsShell({
            activeSection: 'theme',
            title: 'Theme Settings',
            description: 'Customize colors, dark mode, and interface aesthetics.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        root.querySelectorAll('.theme-choice-card').forEach(card => {
            card.addEventListener('click', () => {
                const selected = card.dataset.theme;
                if (selected === 'system') {
                    document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('imd_theme', 'system');
                } else {
                    document.documentElement.setAttribute('data-theme', selected);
                    localStorage.setItem('imd_theme', selected);
                }

                // Re-render view to reflect active state
                const newElem = ThemeSettingsView.render();
                root.replaceWith(newElem);
            });
        });
    }
};
