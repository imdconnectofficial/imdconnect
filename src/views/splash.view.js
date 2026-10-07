// ==============================================================================
// ImdConnect — Splash Screen View (Matches Visual Reference)
// ==============================================================================
import { router } from '../core/router.js';

export const SplashView = {
    render() {
        const container = document.createElement('main');
        container.className = 'splash-container';

        container.innerHTML = `
            <div style="max-width: 420px; width: 100%; display: flex; flex-direction: column; align-items: center;">
                <!-- Brand Logo Card -->
                <div class="splash-logo-card" aria-hidden="true">
                    💬
                </div>

                <h1 class="splash-title">ImdConnect</h1>
                <p class="splash-tagline">Connect Privately. Chat Freely.</p>

                <!-- Value Proposition Badges -->
                <div style="display: flex; flex-direction: column; gap: 0.85rem; width: 100%; margin-bottom: 2.5rem; text-align: left; background: rgba(30, 41, 59, 0.5); padding: 1.25rem 1.5rem; border-radius: var(--radius-lg); border: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="display: flex; align-items: center; gap: 0.85rem; font-size: 0.95rem; color: #f8fafc;">
                        <span style="font-size: 1.25rem;">🔒</span>
                        <span>Private Text Messaging</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.85rem; font-size: 0.95rem; color: #f8fafc;">
                        <span style="font-size: 1.25rem;">👥</span>
                        <span>Username-Based Friends & Groups</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.85rem; font-size: 0.95rem; color: #f8fafc;">
                        <span style="font-size: 1.25rem;">🛡️</span>
                        <span>Zero Tracking & Zero Phone Numbers</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.85rem; font-size: 0.95rem; color: #f8fafc;">
                        <span style="font-size: 1.25rem;">⚡</span>
                        <span>Fast, Lightweight & End-to-End Ready</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.85rem; font-size: 0.95rem; color: #f8fafc;">
                        <span style="font-size: 1.25rem;">📱</span>
                        <span>Mobile-First Responsive Interface</span>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="splash-actions">
                    <button type="button" id="btn-get-started" class="btn-primary" style="font-size: 1.05rem;">
                        Get Started
                    </button>
                    <button type="button" id="btn-splash-login" class="btn-secondary" style="background: rgba(255, 255, 255, 0.08); color: #ffffff; border-color: rgba(255, 255, 255, 0.15); font-size: 1rem;">
                        Login
                    </button>
                </div>

                <div style="margin-top: 1.5rem; text-align: center;">
                    <button type="button" id="btn-config-backend" style="background: none; border: none; font-size: 0.775rem; color: #94a3b8; cursor: pointer; text-decoration: underline;" aria-label="Configure Supabase Backend">
                        ⚙️ Configure Supabase Backend
                    </button>
                </div>
            </div>

            <!-- Backend Config Modal -->
            <div id="splash-backend-modal" class="modal-overlay" style="display: none;">
                <div class="modal-dialog">
                    <div class="modal-dialog-header">
                        <h3 class="modal-dialog-title">Supabase Backend Settings</h3>
                        <button type="button" id="btn-close-backend-modal" class="btn-icon" aria-label="Close modal">✕</button>
                    </div>
                    <div class="modal-dialog-body">
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
                            Set your Supabase project URL and public Anon key for local testing.
                        </p>
                        <div class="form-group" style="margin-bottom: 0.75rem;">
                            <label class="form-label">Supabase URL</label>
                            <input type="url" id="cfg-supabase-url" class="form-input" placeholder="https://your-project.supabase.co" />
                        </div>
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label class="form-label">Supabase Anon Key</label>
                            <input type="text" id="cfg-supabase-key" class="form-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
                        </div>
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button type="button" id="btn-save-backend-cfg" class="btn-primary" style="min-height: 38px; font-size: 0.875rem;">
                                Save & Connect
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        root.querySelector('#btn-get-started').addEventListener('click', () => {
            router.navigate('#/auth/register');
        });

        root.querySelector('#btn-splash-login').addEventListener('click', () => {
            router.navigate('#/auth/login');
        });

        const modal = root.querySelector('#splash-backend-modal');
        const urlInput = root.querySelector('#cfg-supabase-url');
        const keyInput = root.querySelector('#cfg-supabase-key');

        root.querySelector('#btn-config-backend')?.addEventListener('click', () => {
            urlInput.value = localStorage.getItem('imd_supabase_url') || '';
            keyInput.value = localStorage.getItem('imd_supabase_anon_key') || '';
            modal.style.display = 'flex';
        });

        root.querySelector('#btn-close-backend-modal')?.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        root.querySelector('#btn-save-backend-cfg')?.addEventListener('click', () => {
            const u = urlInput.value.trim();
            const k = keyInput.value.trim();
            if (u) localStorage.setItem('imd_supabase_url', u);
            if (k) localStorage.setItem('imd_supabase_anon_key', k);
            alert('Supabase backend settings saved. Reloading application...');
            window.location.reload();
        });
    }
};
