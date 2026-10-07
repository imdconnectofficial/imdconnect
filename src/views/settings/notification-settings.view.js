// ==============================================================================
// ImdConnect — Notification Settings View (#/settings/notifications)
// Manage Direct Message Alerts, Group Notifications, Sounds, and Previews
// ==============================================================================
import { settingsService } from '../../services/settings.service.js';
import { createSettingsShell } from './settings-shell.js';

export const NotificationSettingsView = {
    async render() {
        const notif = await settingsService.getNotificationSettings() || {};

        const contentHtml = `
            <div style="max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="notif-alert-area" aria-live="polite"></div>

                <!-- Chat Notifications -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1.25rem;">Message Alerts</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">Direct Messages</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Receive notifications for 1-on-1 private text chats</div>
                            </div>
                            <label class="switch" aria-label="Toggle DM notifications">
                                <input type="checkbox" id="toggle-dm-notif" ${notif.direct_messages_notify !== false ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">Group Chats</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Receive notifications for group messages and mentions</div>
                            </div>
                            <label class="switch" aria-label="Toggle group notifications">
                                <input type="checkbox" id="toggle-group-notif" ${notif.group_messages_notify !== false ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">Friend Requests</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Notify when a user sends or accepts a contact invitation</div>
                            </div>
                            <label class="switch" aria-label="Toggle friend request notifications">
                                <input type="checkbox" id="toggle-friends-notif" ${notif.friend_requests_notify !== false ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Audio & Previews -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1.25rem;">Audio & Privacy Previews</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">In-App Audio Chimes</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Play audio chime when receiving messages during an active session</div>
                            </div>
                            <label class="switch" aria-label="Toggle in-app sounds">
                                <input type="checkbox" id="toggle-sounds" ${notif.in_app_sounds !== false ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="font-weight: 600;">Message Snippet Preview</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Display message snippet in system notification popups</div>
                            </div>
                            <label class="switch" aria-label="Toggle message preview">
                                <input type="checkbox" id="toggle-preview" ${notif.preview_message_text === true ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const container = createSettingsShell({
            activeSection: 'notifications',
            title: 'Notification Settings',
            description: 'Configure how and when you receive message alerts.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#notif-alert-area');

        const saveChanges = async () => {
            alertArea.innerHTML = `<div class="alert-box alert-info">Saving notification settings...</div>`;

            const updates = {
                direct_messages_notify: root.querySelector('#toggle-dm-notif').checked,
                group_messages_notify: root.querySelector('#toggle-group-notif').checked,
                friend_requests_notify: root.querySelector('#toggle-friends-notif').checked,
                in_app_sounds: root.querySelector('#toggle-sounds').checked,
                preview_message_text: root.querySelector('#toggle-preview').checked
            };

            const res = await settingsService.updateNotificationSettings(updates);
            if (res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-success">Notification settings updated!</div>`;
                setTimeout(() => { alertArea.innerHTML = ''; }, 3000);
            } else {
                alertArea.innerHTML = `<div class="alert-box alert-error">Failed: ${res.error}</div>`;
            }
        };

        root.querySelectorAll('input[type="checkbox"]').forEach(el => {
            el.addEventListener('change', saveChanges);
        });
    }
};
