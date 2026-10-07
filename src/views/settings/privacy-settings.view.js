// ==============================================================================
// ImdConnect — Privacy Settings View (#/settings/privacy)
// Complete privacy controls: Profile visibility, Avatar visibility, Last seen,
// Online status, Read receipts, Friend requests, Discovery, Privacy mode, 
// Default disappearing messages, and Blocked users management.
// ==============================================================================
import { settingsService } from '../../services/settings.service.js';
import { createSettingsShell } from './settings-shell.js';

export const PrivacySettingsView = {
    async render() {
        const privacy = await settingsService.getPrivacySettings() || {};
        const blockedUsers = await settingsService.getBlockedUsers();

        // Normalize initial settings values
        const profileVisibility = privacy.profile_visibility || 'everyone';
        const avatarVisibility = privacy.avatar_visibility || 'everyone';
        const lastSeen = privacy.last_seen || (privacy.last_seen_visible === false ? 'nobody' : 'everyone');
        const onlineStatus = privacy.online_status || (privacy.online_status_visible === false ? 'nobody' : 'everyone');
        const readReceipts = privacy.read_receipts_enabled !== false;
        const friendRequestPerms = privacy.friend_request_permissions || 'everyone';
        const whoCanFindMe = privacy.who_can_find_me || 'everyone';
        const whoCanMessage = privacy.who_can_message_me || 'everyone';
        const whoCanAddGroups = privacy.who_can_add_to_groups || 'everyone';
        const defaultPrivacyMode = privacy.privacy_chat_mode_default === true;
        const defaultDisappearing = privacy.default_disappearing_timer ?? 180;

        const contentHtml = `
            <div style="max-width: 650px; display: flex; flex-direction: column; gap: 1.5rem;">
                <div id="priv-alert-area" aria-live="polite"></div>

                <!-- 1. Profile & Identity Privacy -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">👤</span>
                        <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Profile & Identity Visibility</h3>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Control who can see your profile information, avatar, and social statistics.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <div class="form-group">
                            <label class="form-label" for="select-profile-visibility">Profile Visibility</label>
                            <select id="select-profile-visibility" class="form-input">
                                <option value="everyone" ${profileVisibility === 'everyone' ? 'selected' : ''}>Everyone (Public Profile)</option>
                                <option value="friends_only" ${profileVisibility === 'friends_only' ? 'selected' : ''}>Friends Only (Mutual Contacts)</option>
                                <option value="nobody" ${profileVisibility === 'nobody' ? 'selected' : ''}>Nobody (Completely Private)</option>
                            </select>
                            <span class="form-hint">Controls who can view your bio, friend count, and group count. (Date of birth is always strictly confidential).</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="select-avatar-visibility">Avatar Visibility</label>
                            <select id="select-avatar-visibility" class="form-input">
                                <option value="everyone" ${avatarVisibility === 'everyone' ? 'selected' : ''}>Everyone (All Users)</option>
                                <option value="friends_only" ${avatarVisibility === 'friends_only' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${avatarVisibility === 'nobody' ? 'selected' : ''}>Nobody (Initials Only)</option>
                            </select>
                            <span class="form-hint">Restricts display of your profile picture to authorized contacts only.</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="select-who-find-me">Who Can Find Me (Search Discovery)</label>
                            <select id="select-who-find-me" class="form-input">
                                <option value="everyone" ${whoCanFindMe === 'everyone' ? 'selected' : ''}>Everyone (Public Search)</option>
                                <option value="friends_only" ${whoCanFindMe === 'friends_only' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${whoCanFindMe === 'nobody' ? 'selected' : ''}>Nobody (Hidden from Search)</option>
                            </select>
                            <span class="form-hint">Controls whether your account appears in user search results for non-contacts.</span>
                        </div>
                    </div>
                </div>

                <!-- 2. Presence & Activity Visibility -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">👁️</span>
                        <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Presence & Activity Status</h3>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Manage your live activity indicators and read confirmations.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <div class="form-group">
                            <label class="form-label" for="select-online-status">Online Status Visibility</label>
                            <select id="select-online-status" class="form-input">
                                <option value="everyone" ${onlineStatus === 'everyone' ? 'selected' : ''}>Everyone</option>
                                <option value="friends_only" ${onlineStatus === 'friends_only' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${onlineStatus === 'nobody' ? 'selected' : ''}>Nobody (Hidden)</option>
                            </select>
                            <span class="form-hint">Controls who can see your green active presence dot in chat and conversation lists.</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="select-last-seen">Last Seen Timestamp</label>
                            <select id="select-last-seen" class="form-input">
                                <option value="everyone" ${lastSeen === 'everyone' ? 'selected' : ''}>Everyone</option>
                                <option value="friends_only" ${lastSeen === 'friends_only' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${lastSeen === 'nobody' ? 'selected' : ''}>Nobody</option>
                            </select>
                            <span class="form-hint">Controls whether peers can see when you were last active on the platform.</span>
                        </div>

                        <div class="settings-row" style="padding: 0.75rem 0; border-top: 1px solid var(--border-color);">
                            <div>
                                <div style="font-weight: 600; font-size: 0.95rem;">Read Receipts</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted);">Display double checkmarks (✓✓) when messages are read</div>
                            </div>
                            <label class="switch" aria-label="Toggle read receipts">
                                <input type="checkbox" id="toggle-read-receipts" ${readReceipts ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- 3. Connection & Messaging Permissions -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">🤝</span>
                        <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Connection & Communication Permissions</h3>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Decide who can send you friend requests and reach you via direct messages.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <div class="form-group">
                            <label class="form-label" for="select-friend-requests">Friend Request Permissions</label>
                            <select id="select-friend-requests" class="form-input">
                                <option value="everyone" ${friendRequestPerms === 'everyone' ? 'selected' : ''}>Everyone (Any Registered User)</option>
                                <option value="friends_of_friends" ${friendRequestPerms === 'friends_of_friends' ? 'selected' : ''}>Friends of Friends Only</option>
                                <option value="nobody" ${friendRequestPerms === 'nobody' ? 'selected' : ''}>Nobody (Lock Incoming Requests)</option>
                            </select>
                            <span class="form-hint">Prevents unsolicited connection requests from strangers.</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="select-who-message">Who Can Send Me Direct Messages</label>
                            <select id="select-who-message" class="form-input">
                                <option value="everyone" ${whoCanMessage === 'everyone' ? 'selected' : ''}>Everyone (Any User)</option>
                                <option value="friends_only" ${whoCanMessage === 'friends_only' ? 'selected' : ''}>Friends Only (Mutual Contacts)</option>
                                <option value="nobody" ${whoCanMessage === 'nobody' ? 'selected' : ''}>Nobody (Locked)</option>
                            </select>
                            <span class="form-hint">Platform default requires mutual friendship before private direct chatting.</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="select-who-groups">Who Can Add Me to Groups</label>
                            <select id="select-who-groups" class="form-input">
                                <option value="everyone" ${whoCanAddGroups === 'everyone' ? 'selected' : ''}>Everyone</option>
                                <option value="friends_only" ${whoCanAddGroups === 'friends_only' ? 'selected' : ''}>Friends Only</option>
                                <option value="nobody" ${whoCanAddGroups === 'nobody' ? 'selected' : ''}>Nobody</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- 4. Privacy Chat Mode & Disappearing Messages -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <span style="font-size: 1.25rem;">🛡️</span>
                        <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Privacy Chat & Disappearing Messages</h3>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Protect conversation confidentiality and configure server-side read expiration.
                    </p>
                    
                    <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                        <div class="settings-row" style="padding: 0.5rem 0;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="font-weight: 600; font-size: 0.95rem;">Default Screenshot / Privacy Mode</span>
                                    <button type="button" id="btn-privacy-mode-info" class="btn-icon" style="font-size: 0.8rem; width: 22px; height: 22px;" title="View privacy mode details" aria-label="Privacy mode details">ℹ️</button>
                                </div>
                                <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.2rem;">
                                    Enable Privacy Chat Mode by default on all newly created conversations.
                                </div>
                            </div>
                            <label class="switch" aria-label="Toggle default privacy chat mode">
                                <input type="checkbox" id="toggle-privacy-mode-default" ${defaultPrivacyMode ? 'checked' : ''} />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <div style="background: var(--bg-surface-elevated); padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 0.775rem; color: var(--text-secondary); line-height: 1.5;">
                            <strong>🛡️ Security Realism Notice:</strong> Privacy Chat restricts in-browser copying, text selection, dragging, and provides best-effort detection for keyboard screenshot shortcuts (PrintScreen, Snipping Tool). Note that web sandboxes cannot prevent OS-level recording, hardware capture devices, or external camera photos.
                        </div>

                        <div class="form-group" style="margin-top: 0.5rem;">
                            <label class="form-label" for="select-disappearing-timer">Default Disappearing Messages Timer</label>
                            <select id="select-disappearing-timer" class="form-input">
                                <option value="0" ${defaultDisappearing === 0 ? 'selected' : ''}>Off (Never Expire)</option>
                                <option value="30" ${defaultDisappearing === 30 ? 'selected' : ''}>30 Seconds</option>
                                <option value="60" ${defaultDisappearing === 60 ? 'selected' : ''}>1 Minute</option>
                                <option value="180" ${defaultDisappearing === 180 ? 'selected' : ''}>3 Minutes (Default)</option>
                                <option value="600" ${defaultDisappearing === 600 ? 'selected' : ''}>10 Minutes</option>
                                <option value="3600" ${defaultDisappearing === 3600 ? 'selected' : ''}>1 Hour</option>
                                <option value="86400" ${defaultDisappearing === 86400 ? 'selected' : ''}>24 Hours</option>
                            </select>
                            <span class="form-hint">Applied automatically to new chats. Timer begins only after the recipient successfully reads the text. Expired messages are permanently wiped via Supabase Cron.</span>
                        </div>
                    </div>
                </div>

                <!-- 5. Blocked Users Management -->
                <div class="auth-card" style="padding: 1.5rem; width: 100%;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.25rem;">🚫</span>
                            <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">Blocked Users</h3>
                        </div>
                        <span class="age-pill age-neutral" style="font-size: 0.725rem;">${blockedUsers.length} Blocked</span>
                    </div>
                    <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Blocked users cannot send you messages, friend requests, or view your online status.
                    </p>

                    <div id="blocked-users-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${blockedUsers.length === 0 ? `
                            <div class="empty-state-box" style="padding: 1.5rem 0;">
                                <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🛡️</div>
                                <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">No Blocked Users</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.25rem;">You have not blocked any contacts.</div>
                            </div>
                        ` : blockedUsers.map(b => `
                            <div class="chat-item" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.75rem 1rem;">
                                <div class="avatar-wrapper" style="width: 38px; height: 38px; min-width: 38px;">
                                    ${b.avatarUrl ? `<img src="${b.avatarUrl}" alt="${escapeHtml(b.displayName)}" />` : `<span>${escapeHtml(b.displayName.charAt(0).toUpperCase())}</span>`}
                                </div>
                                <div class="chat-item-content">
                                    <div class="chat-item-name">${escapeHtml(b.displayName)}</div>
                                    <div class="chat-item-lastmsg">@${escapeHtml(b.username)}</div>
                                </div>
                                <button type="button" class="btn-secondary btn-unblock" data-id="${b.blockedId}" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.775rem; width: auto;">
                                    Unblock
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Privacy Chat Mode Info Modal -->
            <div id="privacy-info-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 1000; align-items: center; justify-content: center; padding: 1rem;">
                <div class="auth-card" style="max-width: 480px; width: 100%; padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h3 style="font-size: 1.1rem; font-weight: 700; margin: 0;">🛡️ About Privacy Chat Mode</h3>
                        <button type="button" id="btn-close-privacy-info" class="btn-icon" aria-label="Close">✕</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem; line-height: 1.6; color: var(--text-secondary);">
                        <p><strong>Copy & Selection Restrictions:</strong> Message content within the chat thread cannot be selected, copied, cut, or dragged to external applications.</p>
                        <p><strong>Screenshot Detection:</strong> The client monitors system keyboard shortcuts (PrintScreen, Snipping Tool, and macOS shortcuts) and alerts participants with a security notification.</p>
                        <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-muted);">
                            <strong>Honest Security Notice:</strong> Modern operating systems allow hardware-level screen capture and external camera recording that cannot be intercepted by any browser. ImdConnect does not make false guarantees regarding OS-level captures.
                        </div>
                    </div>
                    <button type="button" id="btn-dismiss-privacy-info" class="btn-primary" style="margin-top: 1.25rem; width: 100%;">
                        Understood
                    </button>
                </div>
            </div>
        `;

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/`/g, '&#96;');
        }

        const container = createSettingsShell({
            activeSection: 'privacy',
            title: 'Privacy Settings',
            description: 'Manage profile visibility, presence, permissions, and disappearing messages.',
            contentHtml
        });

        this.bindEvents(container);
        return container;
    },

    bindEvents(root) {
        const alertArea = root.querySelector('#priv-alert-area');
        const modal = root.querySelector('#privacy-info-modal');

        // Modal triggers
        root.querySelector('#btn-privacy-mode-info')?.addEventListener('click', () => {
            if (modal) modal.style.display = 'flex';
        });
        root.querySelector('#btn-close-privacy-info')?.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
        root.querySelector('#btn-dismiss-privacy-info')?.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });

        const saveChanges = async () => {
            alertArea.innerHTML = `<div class="alert-box alert-info">Saving privacy settings...</div>`;

            const lastSeenVal = root.querySelector('#select-last-seen').value;
            const onlineVal = root.querySelector('#select-online-status').value;

            const updates = {
                profile_visibility: root.querySelector('#select-profile-visibility').value,
                avatar_visibility: root.querySelector('#select-avatar-visibility').value,
                last_seen: lastSeenVal,
                last_seen_visible: lastSeenVal !== 'nobody',
                online_status: onlineVal,
                online_status_visible: onlineVal !== 'nobody',
                read_receipts_enabled: root.querySelector('#toggle-read-receipts').checked,
                friend_request_permissions: root.querySelector('#select-friend-requests').value,
                who_can_find_me: root.querySelector('#select-who-find-me').value,
                who_can_message_me: root.querySelector('#select-who-message').value,
                who_can_add_to_groups: root.querySelector('#select-who-groups').value,
                privacy_chat_mode_default: root.querySelector('#toggle-privacy-mode-default').checked,
                default_disappearing_timer: parseInt(root.querySelector('#select-disappearing-timer').value, 10)
            };

            const res = await settingsService.updatePrivacySettings(updates);
            if (res.success) {
                alertArea.innerHTML = `<div class="alert-box alert-success">✓ Privacy settings saved successfully!</div>`;
                setTimeout(() => { 
                    if (alertArea.innerHTML.includes('saved successfully')) {
                        alertArea.innerHTML = ''; 
                    }
                }, 3000);
            } else {
                alertArea.innerHTML = `<div class="alert-box alert-error">Failed: ${res.error || 'Could not save'}</div>`;
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
                btn.disabled = true;
                btn.textContent = 'Unblocking...';

                const res = await settingsService.unblockUser(id);
                if (res.success) {
                    btn.closest('.chat-item').remove();
                    alertArea.innerHTML = `<div class="alert-box alert-success">User unblocked successfully.</div>`;
                    
                    // Check if list is empty now
                    const list = root.querySelector('#blocked-users-list');
                    if (list && list.querySelectorAll('.chat-item').length === 0) {
                        list.innerHTML = `
                            <div class="empty-state-box" style="padding: 1.5rem 0;">
                                <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🛡️</div>
                                <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">No Blocked Users</div>
                                <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.25rem;">You have not blocked any contacts.</div>
                            </div>
                        `;
                    }
                } else {
                    btn.disabled = false;
                    btn.textContent = 'Unblock';
                    alertArea.innerHTML = `<div class="alert-box alert-error">Failed to unblock: ${res.error}</div>`;
                }
            });
        });
    }
};
