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
    }
};
