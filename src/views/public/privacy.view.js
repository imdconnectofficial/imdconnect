// ==============================================================================
// ImdConnect — Privacy Policy View
// Comprehensive privacy policy detailing zero tracking, RLS, and data minimization
// ==============================================================================
import { router } from '../../core/router.js';

export const PrivacyView = {
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
                            <div class="brand-icon-box" style="width: 32px; height: 32px; font-size: 1rem;">🔒</div>
                            <span>ImdConnect</span>
                        </a>
                        <button type="button" id="btn-back-home" class="btn-secondary" style="min-height: 36px; padding: 0.35rem 0.85rem; font-size: 0.825rem; width: auto;">
                            ← Back
                        </button>
                    </div>
                    <h1 class="auth-title" style="font-size: 1.75rem; margin-bottom: 0.35rem;">Privacy Policy</h1>
                    <p class="auth-subtitle" style="font-size: 0.85rem;">Last Updated: October 2026 • Privacy First Architecture</p>
                </header>

                <div class="legal-body" style="display: flex; flex-direction: column; gap: 1.5rem; color: var(--text-secondary); line-height: 1.7; font-size: 0.925rem;">
                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">1. Our Privacy Philosophy</h2>
                        <p>
                            At ImdConnect, privacy is not an optional feature or marketing afterthought—it is the bedrock of our software architecture. We believe private text communication belongs exclusively to the conversation participants. We do not sell user data, track web activities across third-party sites, or deploy intrusive behavioral analytics.
                        </p>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">2. Information We Collect (and Do NOT Collect)</h2>
                        <p><strong>What We Collect:</strong></p>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            <li><strong>Account Identifiers:</strong> Display name, unique username handle (@username), birth date (for age verification), and private email.</li>
                            <li><strong>Identity Media:</strong> Profile avatar and cover banner images uploaded voluntarily.</li>
                            <li><strong>Encrypted Text Messages:</strong> Text chat messages protected by Row-Level Security.</li>
                            <li><strong>Security Hashes:</strong> One-way cryptographic hashes of session tokens and IP addresses for brute-force prevention and session verification.</li>
                        </ul>
                        <p style="margin-top: 0.75rem;"><strong>What We NEVER Collect:</strong></p>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            <li>Zero phone numbers or SIM identifiers.</li>
                            <li>Zero location tracking or GPS coordinates.</li>
                            <li>Zero in-chat files, documents, audio clips, or photo attachments.</li>
                            <li>Zero third-party advertising cookies or trackers.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">3. Row-Level Security (RLS) Isolation</h2>
                        <p>
                            Every single database table in ImdConnect enforces PostgreSQL Row-Level Security. Database queries execute exclusively with the authenticated user's permission boundaries:
                        </p>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            <li>Only conversation members can read messages in their conversations.</li>
                            <li>Only users can access and modify their private user settings, blocked lists, and notification preferences.</li>
                            <li>Service-role secret keys are completely excluded from frontend code.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">4. Disappearing Messages & Ephemeral Shredding</h2>
                        <p>
                            When a conversation has disappearing messages enabled (30s, 5m, 1h, 24h, 7d), messages are marked with an expiration timestamp. Expired messages are hidden immediately from queries via database policy and shredded permanently from server storage via automated cleanup routines.
                        </p>
                    </section>

                    <section>
                        <h2 style="color: var(--text-primary); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.5rem;">5. Your Rights: Deactivation & Permanent Deletion</h2>
                        <p>
                            Under GDPR, CCPA, and global privacy standards, you maintain absolute control over your digital identity:
                        </p>
                        <ul style="padding-left: 1.5rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            <li><strong>Deactivation:</strong> Temporarily hide your profile and contact records until you next log in.</li>
                            <li><strong>Permanent Deletion:</strong> Instantly and irrevocably purge your account, profile, friendships, messages, avatars, and settings from our database.</li>
                        </ul>
                    </section>
                </div>

                <footer style="margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                    <a href="#/terms" class="auth-link">← View Terms of Service</a>
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
