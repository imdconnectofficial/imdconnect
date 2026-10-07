// ==============================================================================
// ImdConnect — Theme Settings View (#/settings/theme)
// Interactive visual theme selector (Light, Dark, System Default)
// Synchronizes instant DOM changes, LocalStorage, and Supabase user_settings.
// ==============================================================================
import { settingsService } from '../../services/settings.service.js';
import { createSettingsShell } from './settings-shell.js';

export const ThemeSettingsView = {
    async render() {
        const currentTheme = localStorage.getItem('imd_theme') || 'system';

        const contentHtml = `
            <div style="max-width: 650px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="theme-alert-area" aria-live="polite"></div>

                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">🌓</span>
                        <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Appearance Mode</h3>
                    </div>
                    <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
                        Choose your preferred visual presentation. Themes update instantly across all navigation panes and message feeds.
                    </p>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem;">
                        <!-- Light Theme Card -->
                        <div class="theme-choice-card ${currentTheme === 'light' ? 'active' : ''}" data-theme="light" style="border: 2px solid ${currentTheme === 'light' ? 'var(--accent)' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; background: #ffffff; color: #0f172a; transition: all var(--transition-fast); box-shadow: ${currentTheme === 'light' ? '0 0 0 2px var(--accent-light)' : 'none'};">
                            <div style="height: 64px; background: #f8fafc; border-radius: var(--radius-sm); border: 1px solid #e2e8f0; padding: 0.6rem; margin-bottom: 0.85rem; display: flex; flex-direction: column; gap: 0.4rem;">
                                <div style="height: 10px; width: 55%; background: #2563eb; border-radius: 4px;"></div>
                                <div style="height: 8px; width: 85%; background: #cbd5e1; border-radius: 4px;"></div>
                                <div style="height: 8px; width: 40%; background: #e2e8f0; border-radius: 4px;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; font-size: 0.95rem;">☀️ Light</span>
                                ${currentTheme === 'light' ? '<span style="color: var(--accent); font-weight: bold; font-size: 1rem;">✓</span>' : ''}
                            </div>
                            <span style="font-size: 0.725rem; color: #64748b; margin-top: 0.25rem; display: block;">Crisp high-contrast daylight mode</span>
                        </div>

                        <!-- Dark Theme Card -->
                        <div class="theme-choice-card ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark" style="border: 2px solid ${currentTheme === 'dark' ? 'var(--accent)' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; background: #1e293b; color: #f8fafc; transition: all var(--transition-fast); box-shadow: ${currentTheme === 'dark' ? '0 0 0 2px var(--accent-light)' : 'none'};">
                            <div style="height: 64px; background: #0f172a; border-radius: var(--radius-sm); border: 1px solid #2e3a52; padding: 0.6rem; margin-bottom: 0.85rem; display: flex; flex-direction: column; gap: 0.4rem;">
                                <div style="height: 10px; width: 55%; background: #3b82f6; border-radius: 4px;"></div>
                                <div style="height: 8px; width: 85%; background: #334155; border-radius: 4px;"></div>
                                <div style="height: 8px; width: 40%; background: #1e293b; border-radius: 4px;"></div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; font-size: 0.95rem;">🌙 Dark</span>
                                ${currentTheme === 'dark' ? '<span style="color: var(--accent); font-weight: bold; font-size: 1rem;">✓</span>' : ''}
                            </div>
                            <span style="font-size: 0.725rem; color: #94a3b8; margin-top: 0.25rem; display: block;">Sleek night-time low-light mode</span>
                        </div>

                        <!-- System Default Card -->
                        <div class="theme-choice-card ${currentTheme === 'system' ? 'active' : ''}" data-theme="system" style="border: 2px solid ${currentTheme === 'system' ? 'var(--accent)' : 'var(--border-color)'}; border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; background: var(--bg-surface); color: var(--text-primary); transition: all var(--transition-fast); box-shadow: ${currentTheme === 'system' ? '0 0 0 2px var(--accent-light)' : 'none'};">
                            <div style="height: 64px; background: linear-gradient(135deg, #f8fafc 50%, #0f172a 50%); border-radius: var(--radius-sm); border: 1px solid var(--border-color); padding: 0.6rem; margin-bottom: 0.85rem; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                                <span style="font-size: 1rem;">🌓</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-weight: 600; font-size: 0.95rem;">🌓 System</span>
                                ${currentTheme === 'system' ? '<span style="color: var(--accent); font-weight: bold; font-size: 1rem;">✓</span>' : ''}
                            </div>
                            <span style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem; display: block;">Syncs automatically with OS setting</span>
                        </div>
                    </div>
                </div>

                <!-- Brand Color Palette Showcase -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem;">ImdConnect Color Tokens</h3>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
                        Curated, harmonious WCAG AAA compliant color tokens utilized across UI components.
                    </p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.75rem;">
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #2563eb; color: #fff; font-size: 0.825rem; font-weight: 600;">
                            <div>Primary Accent</div>
                            <div style="font-size: 0.7rem; opacity: 0.85; font-family: monospace;">#2563EB</div>
                        </div>
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #8b5cf6; color: #fff; font-size: 0.825rem; font-weight: 600;">
                            <div>Secondary Violet</div>
                            <div style="font-size: 0.7rem; opacity: 0.85; font-family: monospace;">#8B5CF6</div>
                        </div>
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #10b981; color: #fff; font-size: 0.825rem; font-weight: 600;">
                            <div>Online / Success</div>
                            <div style="font-size: 0.7rem; opacity: 0.85; font-family: monospace;">#10B981</div>
                        </div>
                        <div style="padding: 0.75rem; border-radius: var(--radius-md); background: #ef4444; color: #fff; font-size: 0.825rem; font-weight: 600;">
                            <div>Danger / Blocked</div>
                            <div style="font-size: 0.7rem; opacity: 0.85; font-family: monospace;">#EF4444</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const container = createSettingsShell({
            activeSection: 'theme',
            title: 'Theme Settings',
            description: 'Choose between Light, Dark, or System Default appearance.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#theme-alert-area');

        root.querySelectorAll('.theme-choice-card').forEach(card => {
            card.addEventListener('click', async () => {
                const selected = card.dataset.theme;
                
                if (selected === 'system') {
                    document.documentElement.removeAttribute('data-theme');
                    localStorage.setItem('imd_theme', 'system');
                } else {
                    document.documentElement.setAttribute('data-theme', selected);
                    localStorage.setItem('imd_theme', selected);
                }

                alertArea.innerHTML = `<div class="alert-box alert-success">✓ Appearance mode set to ${selected.toUpperCase()}</div>`;

                // Sync preference to cloud user_settings
                try {
                    await settingsService.updateUserSettings({ theme: selected });
                } catch (e) {
                    console.warn('[ThemeSettings] Cloud sync non-fatal:', e);
                }

                // Re-render view smoothly to refresh selection checkmark
                setTimeout(async () => {
                    const newElem = await ThemeSettingsView.render();
                    root.replaceWith(newElem);
                }, 400);
            });
        });
    }
};
