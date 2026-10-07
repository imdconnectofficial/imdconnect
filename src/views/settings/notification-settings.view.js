// ==============================================================================
// ImdConnect — Notification Settings View (#/settings/notifications)
// Manage Direct Message Alerts, Friend Requests, Group Messages, Security Alerts,
// In-App Sound Chimes, and Content Previews.
// ==============================================================================
import { settingsService } from '../../services/settings.service.js';
import { createSettingsShell } from './settings-shell.js';

export const NotificationSettingsView = {
    async render() {
        const notif = await settingsService.getNotificationSettings() || {};

        const directMessages = notif.direct_messages_notify !== false;
        const friendRequests = notif.friend_requests_notify !== false;
        const groupMessages = notif.group_messages_notify !== false;
        const securityAlerts = notif.security_alerts_notify !== false;
        const inAppSounds = notif.in_app_sounds !== false;
        const previewText = notif.preview_message_text === true;

        const contentHtml = `
            <div style="max-width: 650px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="notif-alert-area" aria-live="polite"></div>

                <!-- 1. Communication & Social Notifications -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">🔔</span>
                        <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Messaging & Social Alerts</h3>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Select which platform events generate real-time alerts and unread indicators.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <!-- Message Notifications -->
                        <div class="settings-row" style="padding: 0.65rem 0;">
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem;">Message Notifications</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Receive alerts for new 1-on-1 private direct text messages</div>
                            </div>
                            <label class="switch" aria-label="Toggle direct message notifications">
                                <input type="checkbox" id="toggle-dm-notif" ${directMessages ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <!-- Friend Notifications -->
                        <div class="settings-row" style="padding: 0.65rem 0; border-top: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem;">Friend Notifications</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Notify when someone sends, accepts, or cancels a friend request</div>
                            </div>
                            <label class="switch" aria-label="Toggle friend request notifications">
                                <input type="checkbox" id="toggle-friends-notif" ${friendRequests ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <!-- Group Notifications -->
                        <div class="settings-row" style="padding: 0.65rem 0; border-top: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem;">Group Notifications</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Receive alerts for group chats, member additions, and promotions</div>
                            </div>
                            <label class="switch" aria-label="Toggle group notifications">
                                <input type="checkbox" id="toggle-group-notif" ${groupMessages ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <!-- Security Notifications -->
                        <div class="settings-row" style="padding: 0.65rem 0; border-top: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 0.4rem;">
                                    <span>Security Notifications</span>
                                    <span class="age-pill age-valid" style="font-size: 0.7rem;">Recommended</span>
                                </div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Immediate alerts for password updates, new logins, active session revocations, and screenshot notices</div>
                            </div>
                            <label class="switch" aria-label="Toggle security notifications">
                                <input type="checkbox" id="toggle-security-notif" ${securityAlerts ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- 2. Audio & Privacy Preview Preferences -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">🔊</span>
                        <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Audio Chimes & Notification Previews</h3>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Control audio alerts and message privacy on locked screens and banner popups.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <!-- In-app sound -->
                        <div class="settings-row" style="padding: 0.65rem 0;">
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem;">In-App Audio Chimes</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Play audio chime when receiving messages during an active session</div>
                            </div>
                            <label class="switch" aria-label="Toggle in-app sounds">
                                <input type="checkbox" id="toggle-sounds" ${inAppSounds ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <!-- Preview message text -->
                        <div class="settings-row" style="padding: 0.65rem 0; border-top: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem;">Message Snippet Preview</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Display text snippet in system popups (Turn off for higher privacy)</div>
                            </div>
                            <label class="switch" aria-label="Toggle message preview">
                                <input type="checkbox" id="toggle-preview" ${previewText ? 'checked' : ''} />
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
            description: 'Configure alerts for messages, friends, groups, and security events.',
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
                friend_requests_notify: root.querySelector('#toggle-friends-notif').checked,
                group_messages_notify: root.querySelector('#toggle-group-notif').checked,
                security_alerts_notify: root.querySelector('#toggle-security-notif').checked,
                in_app_sounds: root.querySelector('#toggle-sounds').checked,
                preview_message_text: root.querySelector('#toggle-preview').checked
            };

            const res = await settingsService.updateNotificationSettings(updates);
            if (res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-success">✓ Notification settings saved successfully!</div>`;
                setTimeout(() => { 
                    if (alertArea.innerHTML.includes('saved successfully')) {
                        alertArea.innerHTML = ''; 
                    }
                }, 3000);
            } else {
                alertArea.innerHTML = `<div class="alert-box alert-error">Failed: ${res.error || 'Could not save'}</div>`;
            }
        };

        root.querySelectorAll('input[type="checkbox"]').forEach(el => {
            el.addEventListener('change', saveChanges);
        });
    }
};
