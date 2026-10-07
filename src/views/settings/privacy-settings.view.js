// ==============================================================================
// ImdConnect — Privacy Settings View (#/settings/privacy)
// Manage Inbound DM Permissions, Receipts, Presence, Disappearing Timers, Blocks
// ==============================================================================
import { settingsService } from '../../services/settings.service.js';
import { createSettingsShell } from './settings-shell.js';

export const PrivacySettingsView = {
    async render() {
        const privacy = await settingsService.getPrivacySettings() || {};
        const blockedUsers = await settingsService.getBlockedUsers();

        const contentHtml = `
            <div style="max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="priv-alert-area" aria-live="polite"></div>

                <!-- Messaging & Presence Permissions -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1.25rem;">Presence & Visibility</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">Online Presence</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Allow peers to see your active status indicator</div>
                            </div>
                            <label class="switch" aria-label="Toggle online presence">
                                <input type="checkbox" id="toggle-online-status" ${privacy.online_status_visible !== false ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">Read Receipts</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Display double checkmarks (✓✓) when messages are read</div>
                            </div>
                            <label class="switch" aria-label="Toggle read receipts">
                                <input type="checkbox" id="toggle-read-receipts" ${privacy.read_receipts_enabled !== false ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">Last Seen Timestamp</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Allow peers to view when you were last active</div>
                            </div>
                            <label class="switch" aria-label="Toggle last seen">
                                <input type="checkbox" id="toggle-last-seen" ${privacy.last_seen_visible !== false ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Inbound Communication Filters -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1.25rem;">Inbound Communication Rules</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <div class="form-group">
                            <label class="form-label">Who Can Send Me Direct Messages</label>
                            <select id="select-who-message" class="form-input">
                                <option value="everyone" ${privacy.who_can_message_me === 'everyone' ? 'selected' : ''}>Everyone (Any User)</option>
                                <option value="friends_only" ${privacy.who_can_message_me === 'friends_only' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${privacy.who_can_message_me === 'nobody' ? 'selected' : ''}>Nobody (Locked)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Who Can Add Me to Groups</label>
                            <select id="select-who-groups" class="form-input">
                                <option value="everyone" ${privacy.who_can_add_to_groups === 'everyone' ? 'selected' : ''}>Everyone</option>
                                <option value="friends_only" ${privacy.who_can_add_to_groups === 'friends_only' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${privacy.who_can_add_to_groups === 'nobody' ? 'selected' : ''}>Nobody</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Default Disappearing Messages Timer</label>
                            <select id="select-disappearing-timer" class="form-input">
                                <option value="0" ${privacy.default_disappearing_timer === 0 ? 'selected' : ''}>Off (Never Expire)</option>
                                <option value="30" ${privacy.default_disappearing_timer === 30 ? 'selected' : ''}>30 Seconds</option>
                                <option value="300" ${privacy.default_disappearing_timer === 300 ? 'selected' : ''}>5 Minutes</option>
                                <option value="3600" ${privacy.default_disappearing_timer === 3600 ? 'selected' : ''}>1 Hour</option>
                                <option value="86400" ${privacy.default_disappearing_timer === 86400 ? 'selected' : ''}>24 Hours</option>
                                <option value="604800" ${privacy.default_disappearing_timer === 604800 ? 'selected' : ''}>7 Days</option>
                            </select>
                            <span class="form-hint">Applied automatically when establishing new direct text chats.</span>
                        </div>
                    </div>
                </div>

                <!-- Blocked Users -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.5rem;">Blocked Users</h3>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1rem;">
                        Blocked users cannot send you messages or view your online status.
                    </p>

                    <div id="blocked-users-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${blockedUsers.length === 0 ? `
                            <div style="text-align: center; padding: 1.5rem 0; color: var(--text-muted); font-size: 0.85rem;">
                                No blocked users
                            </div>
                        ` : blockedUsers.map(b => `
                            <div class="chat-item" style="border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                                <div class="avatar-wrapper" style="width: 38px; height: 38px; min-width: 38px;">
                                    ${b.avatarUrl ? `<img src="${b.avatarUrl}" alt="${b.displayName}" />` : `<span>${b.displayName.charAt(0).toUpperCase()}</span>`}
                                </div>
                                <div class="chat-item-content">
                                    <div class="chat-item-name">${b.displayName}</div>
                                    <div class="chat-item-lastmsg">@${b.username}</div>
                                </div>
                                <button type="button" class="btn-secondary btn-unblock" data-id="${b.blockedId}" style="min-height: 32px; padding: 0.25rem 0.65rem; font-size: 0.75rem; width: auto;">
                                    Unblock
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        const container = createSettingsShell({
            activeSection: 'privacy',
            title: 'Privacy Settings',
            description: 'Configure read receipts, online presence, and interaction barriers.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#priv-alert-area');

        const saveChanges = async () => {
            alertArea.innerHTML = `<div class="alert-box alert-info">Saving privacy settings...</div>`;

            const updates = {
                online_status_visible: root.querySelector('#toggle-online-status').checked,
                read_receipts_enabled: root.querySelector('#toggle-read-receipts').checked,
                last_seen_visible: root.querySelector('#toggle-last-seen').checked,
                who_can_message_me: root.querySelector('#select-who-message').value,
                who_can_add_to_groups: root.querySelector('#select-who-groups').value,
                default_disappearing_timer: parseInt(root.querySelector('#select-disappearing-timer').value, 10)
            };

            const res = await settingsService.updatePrivacySettings(updates);
            if (res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-success">Privacy settings updated!</div>`;
                setTimeout(() => { alertArea.innerHTML = ''; }, 3000);
            } else {
                alertArea.innerHTML = `<div class="alert-box alert-error">Failed: ${res.error}</div>`;
            }
        };

        // Inputs trigger auto-save
        root.querySelectorAll('input[type="checkbox"], select').forEach(el => {
            el.addEventListener('change', saveChanges);
        });

        // Unblock Buttons
        root.querySelectorAll('.btn-unblock').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const res = await settingsService.unblockUser(id);
                if (res.success) {
                    btn.closest('.chat-item').remove();
                    alertArea.innerHTML = `<div class="alert-box alert-success">User unblocked.</div>`;
                }
            });
        });
    }
};
