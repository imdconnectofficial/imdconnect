// ==============================================================================
// ImdConnect — Terms of Service View
// Public legal document emphasizing text-only communication & user privacy
// ==============================================================================
import { router } from '../../core/router.js';

export const TermsView = {
    render() {
        const container = document.createElement('main');
        container.className = 'auth-container';
        container.style.alignItems = 'flex-start';
        container.style.paddingTop = '2rem';
        container.style.paddingBottom = '3rem';

        container.innerHTML = `
            <div class="auth-card" style="max-width: 780px; width: 100%; text-align: left;" role="article">
                <header style="margin-bottom: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <a href="#/" class="auth-brand" style="margin-bottom: 0;">
                            <div class="brand-icon-box" style="width: 32px; height: 32px; font-size: 1rem;">💬</div>
                            <span>ImdConnect</span>
                        </a>
                        <button type="button" id="btn-back-home" class="btn-secondary" style="min-height: 36px; padding: 0.35rem 0.85rem; font-size: 0.825rem; width: auto;">
                            ← Back
                        </button>
                    </div>
                    <h1 class="auth-title" style="font-size: 1.75rem; margin-bottom: 0.35rem;">Terms of Service</h1>
                    <p class="auth-subtitle" style="font-size: 0.85rem;">Last Updated: October 2026 • Effective Immediately</p>
                </header>

                <div class="legal-body" style="display: flex; flex-direction: column; gap: 1.5rem; color: var(--text-secondary); line-height: 1.7; font-size: 0.925rem;">
                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">1. Acceptance of Terms</h2>
                        <p>
                            Welcome to ImdConnect ("Platform"). By creating an account, accessing, or using our text-only messaging platform, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, you may not use our services.
                        </p>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">2. Platform Scope: Strictly Text-Only Messaging</h2>
                        <p>
                            ImdConnect is engineered strictly as a <strong>text-only messaging platform</strong>. You understand and acknowledge that:
                        </p>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            <li>Chat conversations do not support file attachments, media uploads, voice recordings, video clips, or binary document transmissions.</li>
                            <li>Media uploads are strictly limited to user and group identity media (profile avatars and cover banners) and are restricted by strict file-type and size limitations.</li>
                            <li>Attempting to bypass the text-only constraint or embed unauthorized binary payloads is a violation of these terms.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">3. User Eligibility & Synthetic Accounts</h2>
                        <p>
                            You must be at least 13 years of age to register for ImdConnect. We do not require or collect phone numbers. Authentication is username-based with a private recovery email. You are responsible for safeguarding your password and account session tokens.
                        </p>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">4. Acceptable Conduct & Moderation</h2>
                        <p>
                            You agree not to use ImdConnect to:
                        </p>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            <li>Transmit unlawful, abusive, harassing, defamatory, or threatening text messages.</li>
                            <li>Send unsolicited automated spam or broadcast commercial messages.</li>
                            <li>Impersonate any person or entity, or falsely claim affiliation with an organization.</li>
                            <li>Engage in coordinated harassment or violation of another user's privacy.</li>
                        </ul>
                        <p style="margin-top: 0.5rem;">
                            Violations of acceptable conduct will result in moderation actions, including warnings, temporary suspension, or permanent account termination.
                        </p>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">5. Security Realism & Client Sandbox</h2>
                        <p>
                            We employ strict PostgreSQL Row-Level Security (RLS) and cryptographic protections on all data. However, as an honest platform, we make no false claims: operating system screenshots, hardware capture devices, and external cameras cannot be blocked by any web sandbox. Users are encouraged to chat only with people they trust.
                        </p>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">6. Account Termination & Permanent Data Deletion</h2>
                        <p>
                            You have the right to deactivate or permanently delete your account at any time via Account Settings. Deletion permanently cascades across your profile, username, sessions, and messages in full compliance with global privacy regulations.
                        </p>
                    </section>
                </div>

                <footer style="margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                    <a href="#/privacy" class="auth-link">View Privacy Policy →</a>
                    <span style="color: var(--text-muted);">ImdConnect • Connect Privately</span>
                </footer>
            </div>
        `;

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        root.querySelector('#btn-back-home').addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                router.navigate('#/');
            }
        });
    }
};
