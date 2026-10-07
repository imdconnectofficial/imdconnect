// ==============================================================================
// ImdConnect — Master Application View
// Implements Desktop 3-Pane Layout and Mobile Multi-View Navigation
// Closely Matches the Official ImdConnect Visual Reference
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { chatService } from '../../services/chat.service.js';
import { friendService } from '../../services/friend.service.js';
import { realtimeService } from '../../services/realtime.service.js';
import { storageService } from '../../services/storage.service.js';
import { profileService } from '../../services/profile.service.js';
import { CONFIG } from '../../config.js';
import { supabase } from '../../core/supabase.js';
import { router } from '../../core/router.js';

export const AppView = {
    state: {
        activeTab: 'chats', // 'chats' | 'friends' | 'groups' | 'notifications' | 'profile' | 'settings'
        activeFriendsSubTab: 'all', // 'all' | 'incoming' | 'outgoing' | 'search' | 'blocked'
        activeConversation: null,
        conversations: [],
        messages: [],
        friends: [],
        pendingIncoming: [],
        pendingOutgoing: [],
        blockedUsers: [],
        friendsSearchQuery: '',
        friendsSearchResults: [],
        groups: [],
        currentUser: null,
        currentProfile: null,
        stats: { friendsCount: 0, groupsCount: 0, joinedDate: '2026' },
        typingMap: new Map(),
        isLoadingConversations: true,
        isLoadingMessages: false
    },

    unsubscribeRealtime: null,

    async render() {
        const container = document.createElement('div');
        container.className = 'app-container';
        container.id = 'app-main-shell';

        // Load authenticated user profile
        this.state.currentUser = await authService.getUser();
        if (this.state.currentUser) {
            const profileRes = await profileService.getProfile({ userId: this.state.currentUser.id });
            this.state.currentProfile = profileRes.profile || null;
            this.state.stats = {
                friendsCount: this.state.currentProfile?.friends_count || 0,
                groupsCount: this.state.currentProfile?.groups_count || 0,
                joinedDate: this.state.currentProfile?.joinedDateFormatted || '2026'
            };
        }

        // Determine active tab from URL hash
        const currentHash = window.location.hash || '';
        if (currentHash.startsWith('#/friends')) this.state.activeTab = 'friends';
        else if (currentHash.startsWith('#/groups')) this.state.activeTab = 'groups';
        else if (currentHash.startsWith('#/notifications')) this.state.activeTab = 'notifications';
        else if (currentHash.startsWith('#/profile')) this.state.activeTab = 'profile';
        else if (currentHash.startsWith('#/settings')) this.state.activeTab = 'settings';
        else this.state.activeTab = 'chats';

        const isAdmin = this.state.currentProfile && 
            (this.state.currentProfile.role === 'admin' || this.state.currentProfile.role === 'moderator');

        // Render Master 3-Pane Desktop & Mobile Base Structure
        container.innerHTML = `
            <!-- Left Sidebar Navigation & Chat List -->
            <aside class="sidebar-panel" id="sidebar-panel">
                <header class="sidebar-header">
                    <a href="#/chats" class="brand-logo" id="brand-logo-btn">
                        <div class="brand-icon-box" aria-hidden="true">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                            </svg>
                        </div>
                        <span>ImdConnect</span>
                    </a>
                    <div style="display: flex; gap: 0.25rem;">
                        <button type="button" id="btn-theme-toggle" class="btn-icon" title="Toggle Theme" aria-label="Toggle Theme">🌓</button>
                        <button type="button" id="btn-new-chat" class="btn-icon" title="Start New Chat" aria-label="New Chat">✏️</button>
                    </div>
                </header>

                <div class="search-box-wrapper" id="sidebar-search-box-container">
                    <div class="search-input-inner">
                        <span class="search-icon-svg" aria-hidden="true">🔍</span>
                        <input 
                            type="text" 
                            id="sidebar-search-input" 
                            class="search-input" 
                            placeholder="Search users, chats or groups..." 
                            aria-label="Search users, chats or groups"
                        />
                    </div>
                </div>

                <!-- Desktop Navigation Pills -->
                <nav class="sidebar-nav-pills" aria-label="Sidebar Sections">
                    <button type="button" class="nav-pill-btn ${this.state.activeTab === 'chats' ? 'active' : ''}" data-tab="chats">
                        <span>💬</span>
                        <span>Chats</span>
                        <span class="nav-pill-badge" id="badge-chats" style="display: none;">0</span>
                    </button>
                    <button type="button" class="nav-pill-btn ${this.state.activeTab === 'friends' ? 'active' : ''}" data-tab="friends">
                        <span>👥</span>
                        <span>Friends</span>
                        <span class="nav-pill-badge badge-danger" id="badge-friends" style="display: none;">0</span>
                    </button>
                    <button type="button" class="nav-pill-btn ${this.state.activeTab === 'groups' ? 'active' : ''}" data-tab="groups">
                        <span>👥</span>
                        <span>Groups</span>
                    </button>
                    <button type="button" class="nav-pill-btn ${this.state.activeTab === 'notifications' ? 'active' : ''}" data-tab="notifications">
                        <span>🔔</span>
                        <span>Notifications</span>
                        <span class="nav-pill-badge badge-danger" id="badge-notifications" style="display: none;">0</span>
                    </button>
                    <button type="button" class="nav-pill-btn ${this.state.activeTab === 'profile' ? 'active' : ''}" data-tab="profile">
                        <span>👤</span>
                        <span>Profile</span>
                    </button>
                    <button type="button" class="nav-pill-btn ${this.state.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">
                        <span>⚙️</span>
                        <span>Settings</span>
                    </button>
                    ${isAdmin ? `
                        <a href="#/admin" class="nav-pill-btn" style="color: var(--accent); font-weight: 600; text-decoration: none;">
                            <span>🛡️</span>
                            <span>Admin Portal</span>
                        </a>
                    ` : ''}
                </nav>

                <div class="sidebar-section-header" id="sidebar-section-title">Recent Chats</div>

                <!-- Scrollable Item List (Chats / Friends / Groups / Profile / Settings) -->
                <div class="chat-list-scroll" id="sidebar-list-content" role="region" aria-label="Content List">
                    <!-- Loading Skeleton by default (Rule 19) -->
                    <div class="empty-state-box">
                        <span class="spinner" style="border-top-color: var(--accent); margin-bottom: 0.75rem;"></span>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Loading conversations...</span>
                    </div>
                </div>
            </aside>

            <!-- Center Conversation Thread Panel -->
            <section class="chat-panel" id="chat-panel" aria-label="Chat Conversation">
                <!-- Chat Top Header Bar -->
                <header class="chat-header-bar" id="chat-header-bar">
                    <div class="chat-peer-info" id="chat-peer-header-click">
                        <button type="button" class="btn-icon" id="btn-mobile-chat-back" style="display: none; margin-right: -0.25rem;" aria-label="Back to conversations">←</button>
                        <div class="avatar-wrapper" id="chat-header-avatar">
                            <span>💬</span>
                        </div>
                        <div>
                            <div class="chat-peer-name" id="chat-header-name">Select a conversation</div>
                            <div class="chat-peer-status" id="chat-header-status">Connect Privately. Chat Freely.</div>
                        </div>
                    </div>

                    <div class="chat-header-actions" id="chat-header-actions" style="display: none;">
                        <button type="button" id="header-privacy-badge" class="privacy-mode-badge" style="display: none;" title="Privacy Chat Active (Click for info)">
                            <span>🛡️ Privacy Chat</span>
                            <span class="privacy-mode-badge-info-icon">ℹ️</span>
                        </button>
                        <button type="button" class="btn-icon" id="btn-chat-search" title="Search messages" aria-label="Search messages">🔍</button>
                        <button type="button" class="btn-icon" title="Audio disabled in text platform" style="opacity: 0.4; cursor: not-allowed;" aria-label="Call disabled">📞</button>
                        <button type="button" class="btn-icon" id="btn-chat-info-toggle" title="Conversation Details" aria-label="Details">ℹ️</button>
                    </div>
                </header>

                <!-- Scrollable Messages Feed Area (Rule 19: Loading / Empty / Content) -->
                <div class="messages-feed" id="messages-feed" role="log" aria-live="polite">
                    <div class="empty-state-box" id="empty-thread-placeholder">
                        <div class="empty-state-icon">💬</div>
                        <h3 class="empty-state-title">No conversation selected</h3>
                        <p class="empty-state-desc">Choose a conversation from the left or start a new private text chat.</p>
                        <button type="button" id="btn-start-chat-prompt" class="btn-primary" style="max-width: 180px; min-height: 38px; font-size: 0.875rem;">
                            New Message
                        </button>
                    </div>
                </div>

                <!-- Ephemeral Notice Banner -->
                <div class="ephemeral-notice-pill" id="chat-ephemeral-banner" style="display: none;">
                    <span>🕒</span>
                    <span id="ephemeral-banner-text">Messages disappear after being read</span>
                </div>

                <!-- Strictly Text-Only Message Input Bar (Rule 2) -->
                <footer class="chat-input-container" id="chat-input-container" style="display: none;">
                    <div class="input-pill-wrapper">
                        <button type="button" id="btn-emoji-trigger" class="emoji-trigger-btn" title="Add Emoji" aria-label="Emoji picker">😊</button>
                        <input 
                            type="text" 
                            id="message-text-input" 
                            class="chat-text-input" 
                            placeholder="Type a message..." 
                            autocomplete="off" 
                            aria-label="Type message"
                        />
                    </div>
                    <button type="button" id="btn-send-message" class="chat-send-btn" title="Send text message" aria-label="Send message">
                        <span>➤</span>
                    </button>
                </footer>
            </section>

            <!-- Right Profile / Conversation Info Panel -->
            <aside class="info-panel" id="info-panel" aria-label="Details and Settings">
                <div class="info-header-cover" id="info-cover-box">
                    <img id="info-cover-img" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%231e293b'/%3E%3C/svg%3E" alt="Cover" />
                </div>

                <div class="info-profile-avatar-container">
                    <div class="info-large-avatar" id="info-avatar-box">
                        <img id="info-avatar-img" src="" style="display: none;" alt="Avatar" />
                        <span id="info-avatar-initials">?</span>
                    </div>
                    <h2 class="info-profile-name" id="info-name-text">Contact Details</h2>
                    <span class="info-profile-handle" id="info-handle-text">@username</span>

                    <div class="info-quick-actions">
                        <button type="button" class="info-action-circle" id="info-quick-msg" title="Message" aria-label="Message">💬</button>
                        <button type="button" class="info-action-circle" title="Audio disabled in text platform" style="opacity: 0.4; cursor: not-allowed;" aria-label="Call disabled">📞</button>
                        <button type="button" class="info-action-circle" id="info-quick-more" title="More Options" aria-label="More Options">⋯</button>
                    </div>
                </div>

                <!-- About Section -->
                <div class="info-section">
                    <div class="info-section-title">About</div>
                    <p class="info-about-text" id="info-about-text">Life is better with good conversations.</p>

                    <div class="info-stats-grid">
                        <div class="info-stat-card">
                            <div class="info-stat-value" id="info-stat-handle">@user</div>
                            <div class="info-stat-label">Username</div>
                        </div>
                        <div class="info-stat-card">
                            <div class="info-stat-value" id="info-stat-friends">0</div>
                            <div class="info-stat-label">Friends</div>
                        </div>
                        <div class="info-stat-card">
                            <div class="info-stat-value" id="info-stat-joined">2026</div>
                            <div class="info-stat-label">Joined</div>
                        </div>
                    </div>
                </div>

                <!-- Group Members Management Section (Dynamic for Groups) -->
                <div class="info-section" id="info-group-members-container" style="display: none;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.65rem;">
                        <div class="info-section-title" id="info-group-members-title" style="margin: 0;">Members</div>
                        <button type="button" class="btn-primary" id="btn-info-add-member" style="display: none; padding: 0.25rem 0.65rem; font-size: 0.75rem; border-radius: var(--radius-sm);">
                            + Add Member
                        </button>
                    </div>
                    <div id="info-group-members-list" class="group-members-list"></div>
                </div>

                <!-- Chat Settings & Privacy Mode -->
                <div class="info-section">
                    <div class="info-list-row" id="row-edit-group-info" style="display: none; cursor: pointer;">
                        <div>
                            <div>Edit Group Details</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Name, description & avatar</div>
                        </div>
                        <span style="color: var(--accent); font-weight: 500;">Edit ›</span>
                    </div>

                    <div class="info-list-row" id="row-chat-settings">
                        <span>Chat Settings</span>
                        <span style="color: var(--text-muted);">›</span>
                    </div>

                    <div class="info-list-row" id="row-privacy-mode" style="cursor: pointer;">
                        <div>
                            <div>Privacy Chat Mode</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);" id="privacy-mode-subtext">Restricts copy, selection & attempts detection</div>
                        </div>
                        <label class="switch" aria-label="Privacy mode toggle" style="pointer-events: auto;">
                            <input type="checkbox" id="toggle-privacy-mode" />
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="info-list-row" id="row-disappearing-timer">
                        <div>
                            <div>Disappearing Messages</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);" id="current-disappearing-label">Off</div>
                        </div>
                        <span style="color: var(--accent); font-weight: 500;">Configure ›</span>
                    </div>

                    <div class="info-list-row" id="row-conversation-mute" style="cursor: pointer;">
                        <div>
                            <div id="mute-label-text">Mute Notifications</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);" id="mute-sub-text">Silence alerts for this chat</div>
                        </div>
                        <span id="mute-status-icon" style="font-size: 1.1rem;">🔔</span>
                    </div>

                    <div class="info-list-row" id="row-leave-group" style="display: none; cursor: pointer; color: var(--danger);">
                        <div>
                            <div style="color: var(--danger); font-weight: 500;">Leave Group</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Exit this group chat</div>
                        </div>
                        <span style="font-size: 1.1rem;">🚪</span>
                    </div>

                    <div class="info-list-row" id="row-delete-group" style="display: none; cursor: pointer; color: var(--danger);">
                        <div>
                            <div style="color: var(--danger); font-weight: 600;">Delete Group</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Owner only: permanently delete</div>
                        </div>
                        <span style="font-size: 1.1rem;">🗑️</span>
                    </div>
                </div>
            </aside>

            <!-- Mobile Bottom Navigation Bar (Matches Reference) -->
            <nav class="bottom-nav" id="bottom-nav" aria-label="Mobile Navigation">
                <a href="#/app" class="bottom-nav-item active" data-tab="chats">
                    <span class="bottom-nav-icon">💬</span>
                    <span>Chats</span>
                </a>
                <a href="#/app" class="bottom-nav-item" data-tab="friends">
                    <span class="bottom-nav-icon">👥</span>
                    <span>Friends</span>
                    <span class="bottom-nav-badge" id="bottom-badge-friends" style="display: none;"></span>
                </a>
                <a href="#/app" class="bottom-nav-item" data-tab="groups">
                    <span class="bottom-nav-icon">👥</span>
                    <span>Groups</span>
                </a>
                <a href="#/app" class="bottom-nav-item" data-tab="notifications">
                    <span class="bottom-nav-icon">🔔</span>
                    <span>Alerts</span>
                    <span class="bottom-nav-badge" id="bottom-badge-notif" style="display: none;"></span>
                </a>
                <a href="#/app" class="bottom-nav-item" data-tab="profile">
                    <span class="bottom-nav-icon">👤</span>
                    <span>Profile</span>
                </a>
            </nav>

            <!-- Privacy Toast Container -->
            <div id="privacy-toast-container" class="privacy-toast-container" aria-live="polite"></div>

            <!-- Modal Container -->
            <div id="modal-container" style="display: none;"></div>
        `;

        this.bindEvents(container);
        this.loadConversations(container);
        this.refreshSocialState(container);
        this.setupRealtimeListeners(container);

        return container;
    },

    bindEvents(root) {
        // Tab Navigation Buttons (Desktop Sidebar & Mobile Bottom Nav)
        const navPills = root.querySelectorAll('.nav-pill-btn');
        const bottomNavItems = root.querySelectorAll('.bottom-nav-item');

        navPills.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(root, btn.dataset.tab));
        });

        bottomNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchTab(root, item.dataset.tab);
            });
        });

        // Brand Logo click resets to chats tab
        root.querySelector('#brand-logo-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.switchTab(root, 'chats');
        });

        // Theme Toggle Button
        root.querySelector('#btn-theme-toggle').addEventListener('click', () => {
            this.cycleTheme();
        });

        // Mobile Chat Back Button
        root.querySelector('#btn-mobile-chat-back').addEventListener('click', () => {
            root.classList.remove('in-chat');
            this.state.activeConversation = null;
        });

        // New Chat Buttons
        const openNewChat = () => this.showNewChatModal(root);
        root.querySelector('#btn-new-chat').addEventListener('click', openNewChat);
        root.querySelector('#btn-start-chat-prompt')?.addEventListener('click', openNewChat);

        // Send Message Handler
        const textInput = root.querySelector('#message-text-input');
        const sendBtn = root.querySelector('#btn-send-message');

        const handleSend = async () => {
            if (!this.state.activeConversation) return;
            const text = textInput.value.trim();
            if (!text) return;

            textInput.value = '';
            sendBtn.disabled = true;

            const res = await chatService.sendMessage({
                conversationId: this.state.activeConversation.id,
                text
            });

            sendBtn.disabled = false;
            if (res.success) {
                // Instantly render outgoing message
                this.appendMessageToFeed(root, {
                    id: res.message?.id || ('temp-' + Date.now()),
                    conversationId: this.state.activeConversation.id,
                    senderId: this.state.currentUser?.id,
                    isOutgoing: true,
                    text,
                    sentAt: new Date().toISOString(),
                    deliveredAt: null,
                    readAt: null,
                    status: 'sent',
                    timeFormatted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    expiresAt: res.message?.expires_at,
                    messageType: 'text'
                });

                // Clear typing indicator
                realtimeService.broadcastTyping(this.state.activeConversation.id, {
                    userId: this.state.currentUser?.id,
                    username: this.state.currentProfile?.username || 'user',
                    isTyping: false
                });

                this.loadConversations(root);
            } else {
                alert(res.error || 'Failed to send text message.');
            }
        };

        sendBtn.addEventListener('click', handleSend);

        let typingDebounce = null;
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        textInput.addEventListener('input', () => {
            if (!this.state.activeConversation || !this.state.currentUser) return;
            realtimeService.broadcastTyping(this.state.activeConversation.id, {
                userId: this.state.currentUser.id,
                username: this.state.currentProfile?.username || 'user',
                isTyping: true
            });
            clearTimeout(typingDebounce);
            typingDebounce = setTimeout(() => {
                if (this.state.activeConversation && this.state.currentUser) {
                    realtimeService.broadcastTyping(this.state.activeConversation.id, {
                        userId: this.state.currentUser.id,
                        username: this.state.currentProfile?.username || 'user',
                        isTyping: false
                    });
                }
            }, 2500);
        });

        // Emoji Picker Simple Shortcut Trigger
        root.querySelector('#btn-emoji-trigger')?.addEventListener('click', () => {
            const emojis = ['👍', '👋', '❤️', '😊', '🔒', '🚀', '🔥', '🎉'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            textInput.value += randomEmoji;
            textInput.focus();
        });

        // Disappearing Timer Configuration Modal
        root.querySelector('#row-disappearing-timer')?.addEventListener('click', () => {
            this.showDisappearingTimerModal(root);
        });

        // Conversation Mute Toggle Handler
        root.querySelector('#row-conversation-mute')?.addEventListener('click', async () => {
            if (!this.state.activeConversation) return;
            const res = await chatService.toggleConversationMute(this.state.activeConversation.id);
            if (res.success) {
                this.state.activeConversation.isMuted = res.isMuted;
                this.updateInfoPanel(root, this.state.activeConversation);
                this.loadConversations(root);
            }
        });

        // Search Input Filter
        const searchInput = root.querySelector('#sidebar-search-input');
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim().toLowerCase();
            this.filterSidebarItems(root, query);
        });

        // -------------------------------------------------------------
        // Privacy Chat Mode Toggle & Info Modal
        // -------------------------------------------------------------
        const privacyToggle = root.querySelector('#toggle-privacy-mode');
        const privacyRow = root.querySelector('#row-privacy-mode');
        if (privacyToggle && privacyRow) {
            const handlePrivacyToggle = async (e) => {
                if (!this.state.activeConversation) return;
                if (e.target !== privacyToggle) {
                    privacyToggle.checked = !privacyToggle.checked;
                }
                const conv = this.state.activeConversation;
                const res = await chatService.togglePrivacyMode(conv.id);
                if (res.success) {
                    conv.isPrivacyMode = res.isPrivacyMode;
                    privacyToggle.checked = !!conv.isPrivacyMode;
                    this.applyPrivacyChatMode(root, conv);
                    // Broadcast to peer in this active conversation
                    realtimeService.broadcastPrivacyMode(conv.id, {
                        conversationId: conv.id,
                        isPrivacyMode: conv.isPrivacyMode,
                        toggledBy: this.state.currentProfile?.username || 'User'
                    });
                    const noticeText = conv.isPrivacyMode 
                        ? '🛡️ Privacy Chat Mode enabled (Copy/selection restricted)' 
                        : '🛡️ Privacy Chat Mode disabled';
                    this.appendSystemNotice(root, noticeText, conv.isPrivacyMode ? '' : 'notice-warning');
                    this.showPrivacyToast(noticeText);
                } else {
                    privacyToggle.checked = !privacyToggle.checked;
                    this.showPrivacyToast('Failed to update Privacy Mode');
                }
            };

            privacyToggle.addEventListener('change', handlePrivacyToggle);
            privacyRow.addEventListener('click', (e) => {
                if (e.target === privacyToggle || e.target.closest('.switch')) return;
                handlePrivacyToggle(e);
            });
        }

        root.querySelector('#header-privacy-badge')?.addEventListener('click', () => {
            this.showPrivacyModeInfoModal(root);
        });

        // -------------------------------------------------------------
        // Privacy Chat Mode: Copy, Cut, Selection, Drag Restrictions
        // -------------------------------------------------------------
        const chatPanel = root.querySelector('#chat-panel');
        if (chatPanel) {
            const handleRestrictedAction = (e, actionName) => {
                if (!this.state.activeConversation?.isPrivacyMode) return;
                // Allow normal editing within the message input textarea/input
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                    return;
                }
                // Only restrict chat content (bubbles, feed)
                if (e.target && (e.target.closest('.message-bubble') || e.target.closest('.messages-feed'))) {
                    e.preventDefault();
                    if (e.clipboardData) {
                        e.clipboardData.clearData();
                    }
                    this.showPrivacyToast(`🔒 ${actionName} restricted in Privacy Chat Mode`);
                }
            };

            chatPanel.addEventListener('copy', (e) => handleRestrictedAction(e, 'Copying'));
            chatPanel.addEventListener('cut', (e) => handleRestrictedAction(e, 'Cutting'));
            chatPanel.addEventListener('dragstart', (e) => handleRestrictedAction(e, 'Dragging/Forwarding'));
            chatPanel.addEventListener('contextmenu', (e) => {
                if (!this.state.activeConversation?.isPrivacyMode) return;
                if (e.target && e.target.closest('.message-bubble')) {
                    e.preventDefault();
                    this.showPrivacyToast('🔒 Context menu restricted in Privacy Chat Mode');
                }
            });
        }

        // -------------------------------------------------------------
        // Privacy Chat Mode: Best-Effort Screenshot Attempt Detection
        // -------------------------------------------------------------
        this._lastScreenshotAlert = 0;
        this._keydownHandler = (e) => {
            if (!this.state.activeConversation?.isPrivacyMode) return;

            // Detect standard screenshot shortcut patterns:
            // PrintScreen, Ctrl+Shift+S / Meta+Shift+S (Snipping Tool), Meta+Shift+3/4/5 (macOS)
            const isPrintScreen = e.key === 'PrintScreen';
            const isWindowsSnipping = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S');
            const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key);

            if (isPrintScreen || isWindowsSnipping || isMacScreenshot) {
                const now = Date.now();
                // 3 second throttle to prevent spam
                if (now - this._lastScreenshotAlert > 3000) {
                    this._lastScreenshotAlert = now;
                    const alertMsg = '⚠️ Screenshot shortcut attempt detected (Best-effort detection)';
                    this.showPrivacyToast(alertMsg);
                    this.appendSystemNotice(root, alertMsg, 'notice-alert');

                    // Broadcast alert to peer in active conversation
                    realtimeService.broadcastPrivacyAlert(this.state.activeConversation.id, {
                        conversationId: this.state.activeConversation.id,
                        actorUsername: this.state.currentProfile?.username || 'User',
                        type: 'screenshot_shortcut'
                    });
                }
            }
        };
        window.addEventListener('keydown', this._keydownHandler);

        // Listen for browser back/forward or deep hash changes
        this._hashHandler = () => {
            const hash = window.location.hash || '';
            const match = ['chats', 'friends', 'groups', 'notifications', 'profile', 'settings'].find(t => hash.startsWith(`#/${t}`));
            if (match && match !== this.state.activeTab) {
                this.switchTab(root, match, false);
            }
        };
        window.addEventListener('hashchange', this._hashHandler);
    },

    /**
     * Switch Active Navigation Tab
     */
    switchTab(root, tab, updateHash = true) {
        this.state.activeTab = tab;

        if (updateHash && window.location.hash !== `#/${tab}`) {
            window.location.hash = `#/${tab}`;
        }

        // Update Desktop Sidebar Pills
        root.querySelectorAll('.nav-pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update Mobile Bottom Nav
        root.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tab);
        });

        // Search Box visibility: Show on chats, friends, groups
        const searchBox = root.querySelector('#sidebar-search-box-container');
        if (searchBox) {
            searchBox.style.display = (tab === 'chats' || tab === 'friends' || tab === 'groups') ? 'block' : 'none';
        }

        // Render tab content
        this.renderActiveTabContent(root);
    },

    /**
     * Cycle Theme between Light, Dark, and System Default
     */
    cycleTheme() {
        const current = localStorage.getItem('imd_theme') || 'system';
        let next = 'light';
        if (current === 'light') next = 'dark';
        else if (current === 'dark') next = 'system';
        else next = 'light';

        if (next === 'system') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('imd_theme', 'system');
        } else {
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('imd_theme', next);
        }

        // Re-render settings tab if currently visible
        const shell = document.getElementById('app-main-shell');
        if (shell && this.state.activeTab === 'settings') {
            this.renderActiveTabContent(shell);
        }
    },

    /**
     * Load conversations list from Supabase
     */
    async loadConversations(root) {
        this.state.isLoadingConversations = true;

        const convs = await chatService.getConversations();
        this.state.conversations = convs;
        this.state.isLoadingConversations = false;

        if (this.state.activeTab === 'chats') {
            this.renderConversationsList(root);
        }

        // If conversations exist, auto-select first one on desktop
        if (convs.length > 0 && window.innerWidth > 900 && !this.state.activeConversation) {
            this.selectConversation(root, convs[0]);
        }
    },

    /**
     * Render Conversations list (Rule 19 4-State UI)
     */
    renderConversationsList(root) {
        const listContainer = root.querySelector('#sidebar-list-content');
        root.querySelector('#sidebar-section-title').textContent = 'Recent Chats';

        if (this.state.conversations.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">💬</div>
                    <h3 class="empty-state-title">No conversations yet</h3>
                    <p class="empty-state-desc">Search for a username above to start your first secure text chat.</p>
                </div>
            `;
            return;
        }

        let unreadTotal = 0;

        listContainer.innerHTML = '';
        this.state.conversations.forEach((conv) => {
            if (conv.hasUnread) unreadTotal++;

            const item = document.createElement('div');
            item.className = 'chat-item';
            if (this.state.activeConversation?.id === conv.id) item.classList.add('active');
            if (conv.hasUnread) item.classList.add('has-unread');

            const isTyping = this.state.typingMap.get(conv.id);

            item.innerHTML = `
                <div class="avatar-wrapper">
                    ${conv.avatarUrl ? `<img src="${conv.avatarUrl}" alt="${conv.title}" />` : `<span>${conv.title.charAt(0).toUpperCase()}</span>`}
                    ${conv.isOnline ? `<div class="online-indicator"></div>` : ''}
                </div>
                <div class="chat-item-content">
                    <div class="chat-item-top">
                        <div style="display: flex; align-items: center; gap: 0.35rem; min-width: 0;">
                            <span class="chat-item-name">${conv.type === 'group' ? '👥 ' : ''}${conv.title}</span>
                            ${conv.isMuted ? `<span class="muted-badge-icon" title="Muted">🔕</span>` : ''}
                        </div>
                        <span class="chat-item-time">${conv.lastMessageTime}</span>
                    </div>
                    <div class="chat-item-bottom">
                        <span class="chat-item-lastmsg ${isTyping ? 'typing-text' : ''}" style="${conv.hasUnread ? 'font-weight: 600; color: var(--text-primary);' : ''}">
                            ${isTyping ? 'Typing...' : conv.lastMessage}
                        </span>
                        ${conv.hasUnread ? `<span class="badge-danger" style="font-size: 0.65rem; border-radius: 9999px; padding: 0.1rem 0.4rem; font-weight: 700;">●</span>` : ''}
                    </div>
                </div>
            `;

            item.addEventListener('click', () => {
                this.selectConversation(root, conv);
            });

            listContainer.appendChild(item);
        });

        // Update chats badge
        const badgeChats = root.querySelector('#badge-chats');
        if (badgeChats) {
            if (unreadTotal > 0) {
                badgeChats.textContent = String(unreadTotal);
                badgeChats.style.display = 'inline-block';
            } else {
                badgeChats.style.display = 'none';
            }
        }
    },

    /**
     * Select active conversation and load messages
     */
    async selectConversation(root, conv) {
        // Clean up previous conversation realtime subscription & timers
        if (this.activeConvUnsubscribe) {
            this.activeConvUnsubscribe();
            this.activeConvUnsubscribe = null;
        }
        if (this.disappearingTimerInterval) {
            clearInterval(this.disappearingTimerInterval);
            this.disappearingTimerInterval = null;
        }

        this.state.activeConversation = conv;
        root.classList.add('in-chat'); // Mobile fullscreen trigger

        // Update active highlight in sidebar
        root.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));

        // Update Chat Header Bar
        root.querySelector('#btn-mobile-chat-back').style.display = window.innerWidth <= 900 ? 'flex' : 'none';
        root.querySelector('#chat-header-actions').style.display = 'flex';
        root.querySelector('#chat-input-container').style.display = 'flex';
        root.querySelector('#chat-header-name').textContent = conv.title;
        
        const statusEl = root.querySelector('#chat-header-status');
        if (conv.type === 'group') {
            statusEl.textContent = '👥 Group Conversation';
        } else if (conv.isOnline) {
            statusEl.innerHTML = `<span style="color: var(--color-success); font-weight: 500;">● Online</span>`;
        } else {
            statusEl.textContent = conv.peerUsername ? `@${conv.peerUsername}` : 'Private Chat';
        }

        const avatarBox = root.querySelector('#chat-header-avatar');
        avatarBox.innerHTML = conv.avatarUrl ? 
            `<img src="${conv.avatarUrl}" alt="${conv.title}" />` : 
            `<span>${conv.title.charAt(0).toUpperCase()}</span>`;

        // Update Ephemeral Banner
        const banner = root.querySelector('#chat-ephemeral-banner');
        if (conv.disappearingTimer > 0) {
            banner.style.display = 'flex';
            const label = this.formatDisappearingDuration(conv.disappearingTimer);
            root.querySelector('#ephemeral-banner-text').textContent = 
                `Messages disappear ${label} after being read`;
        } else {
            banner.style.display = 'none';
        }

        // Apply Privacy Chat Mode UI styling & badge
        this.applyPrivacyChatMode(root, conv);

        // Update Right Info Panel
        this.updateInfoPanel(root, conv);

        // Mark incoming messages as delivered & read
        chatService.markMessagesDelivered(conv.id);
        chatService.markMessagesAsRead(conv.id);
        conv.hasUnread = false;

        // Load Messages
        await this.loadMessages(root, conv.id);

        // Start disappearing messages dynamic evaporation interval
        this.startDisappearingWatcher(root);

        // Subscribe to real-time events for this active conversation (WSS exclusively)
        this.activeConvUnsubscribe = realtimeService.subscribeToConversation(conv.id, {
            onMessage: (newMsg) => {
                if (this.state.activeConversation?.id !== conv.id) return;
                const isOutgoing = newMsg.sender_id === this.state.currentUser?.id;
                
                this.appendMessageToFeed(root, {
                    id: newMsg.id,
                    conversationId: newMsg.conversation_id,
                    senderId: newMsg.sender_id,
                    isOutgoing,
                    text: newMsg.ciphertext,
                    sentAt: newMsg.sent_at || newMsg.created_at,
                    deliveredAt: newMsg.delivered_at,
                    readAt: newMsg.read_at,
                    status: newMsg.read_at ? 'read' : (newMsg.delivered_at ? 'delivered' : 'sent'),
                    timeFormatted: new Date(newMsg.sent_at || newMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    expiresAt: newMsg.expires_at,
                    messageType: newMsg.message_type
                });

                if (!isOutgoing) {
                    // Mark delivered & read in database
                    chatService.markMessagesDelivered(conv.id);
                    chatService.markMessagesAsRead(conv.id);

                    // Broadcast instant read receipt to sender over Realtime
                    realtimeService.broadcastReceipt(conv.id, {
                        conversationId: conv.id,
                        messageId: newMsg.id,
                        readerId: this.state.currentUser?.id,
                        status: 'read',
                        readAt: new Date().toISOString()
                    });
                }

                // Peer finished sending, remove typing indicator
                this.showPeerTypingIndicator(root, '', false);

                // Update sidebar preview
                this.loadConversations(root);
            },
            onUpdate: (payload) => {
                if (this.state.activeConversation?.id !== conv.id) return;
                this.handleMessageUpdate(root, payload);
            },
            onDelete: (oldMsg) => {
                if (this.state.activeConversation?.id !== conv.id) return;
                if (oldMsg?.id) {
                    this.removeMessageFromFeed(root, oldMsg.id);
                }
            },
            onTyping: (payload) => {
                if (this.state.activeConversation?.id !== conv.id) return;
                if (payload && payload.userId !== this.state.currentUser?.id) {
                    this.showPeerTypingIndicator(root, payload.username || conv.title, !!payload.isTyping);
                }
            },
            onPrivacyAlert: (payload) => {
                if (this.state.activeConversation?.id !== conv.id) return;
                const actor = payload?.actorUsername ? `@${payload.actorUsername}` : 'Peer';
                const alertText = `⚠️ Screenshot attempt detected by ${actor} (Best-effort detection)`;
                this.appendSystemNotice(root, alertText, 'notice-alert');
                this.showPrivacyToast(alertText);
            },
            onPrivacyMode: (payload) => {
                if (this.state.activeConversation?.id !== conv.id) return;
                conv.isPrivacyMode = !!payload.isPrivacyMode;
                this.applyPrivacyChatMode(root, conv);
                const changer = payload?.toggledBy ? `@${payload.toggledBy}` : 'Peer';
                const noticeText = conv.isPrivacyMode
                    ? `🛡️ Privacy Chat Mode enabled by ${changer}`
                    : `🛡️ Privacy Chat Mode disabled by ${changer}`;
                this.appendSystemNotice(root, noticeText, conv.isPrivacyMode ? '' : 'notice-warning');
                this.showPrivacyToast(noticeText);
            },
            onPresence: (state) => {
                if (this.state.activeConversation?.id !== conv.id) return;
                this.handlePeerPresence(root, conv, state);
            }
        });
    },

    /**
     * Load messages into center feed
     */
    async loadMessages(root, conversationId) {
        const feed = root.querySelector('#messages-feed');
        feed.innerHTML = `
            <div class="empty-state-box">
                <span class="spinner" style="border-top-color: var(--accent);"></span>
            </div>
        `;

        const msgs = await chatService.getMessages(conversationId);
        this.state.messages = msgs;

        if (msgs.length === 0) {
            feed.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">🔒</div>
                    <h3 class="empty-state-title">End-to-End Private Chat</h3>
                    <p class="empty-state-desc">Messages are strictly text-only and protected by Row Level Security.</p>
                </div>
            `;
            return;
        }

        feed.innerHTML = '';
        msgs.forEach(m => {
            const row = document.createElement('div');
            row.className = `message-row ${m.isOutgoing ? 'outgoing' : 'incoming'}`;
            row.setAttribute('data-msg-id', m.id);
            if (m.expiresAt) {
                row.setAttribute('data-expires-at', m.expiresAt);
            }

            const isGroup = this.state.activeConversation?.type === 'group';
            row.innerHTML = `
                <div class="message-bubble">
                    ${!m.isOutgoing && isGroup ? `
                        <div class="group-sender-header">
                            <span>@${this.escapeHtml(m.senderUsername || 'user')}</span>
                        </div>
                    ` : ''}
                    ${this.escapeHtml(m.text)}
                </div>
                <div class="message-meta">
                    ${m.expiresAt ? `<span class="expires-indicator" title="Disappearing message">⏳</span>` : ''}
                    <span>${m.timeFormatted}</span>
                    ${m.isOutgoing ? this.getReadTicksHtml(m.status) : ''}
                </div>
            `;

            feed.appendChild(row);
        });

        // Scroll to bottom
        feed.scrollTop = feed.scrollHeight;
    },

    /**
     * Compute read receipt ticks HTML
     */
    getReadTicksHtml(status) {
        if (status === 'read') {
            return `<span class="read-ticks ticks-read" title="Read">✓✓</span>`;
        }
        if (status === 'delivered') {
            return `<span class="read-ticks ticks-delivered" title="Delivered">✓✓</span>`;
        }
        return `<span class="read-ticks ticks-sent" title="Sent">✓</span>`;
    },

    /**
     * Append message to active feed
     */
    appendMessageToFeed(root, m) {
        const feed = root.querySelector('#messages-feed');
        if (!feed) return;

        // Remove placeholder empty state if present
        const emptyState = feed.querySelector('.empty-state-box');
        if (emptyState) emptyState.remove();

        // Avoid duplicate message DOM elements
        if (feed.querySelector(`[data-msg-id="${m.id}"]`)) return;

        const row = document.createElement('div');
        row.className = `message-row ${m.isOutgoing ? 'outgoing' : 'incoming'}`;
        row.setAttribute('data-msg-id', m.id);
        if (m.expiresAt) {
            row.setAttribute('data-expires-at', m.expiresAt);
        }

        const isGroup = this.state.activeConversation?.type === 'group';
        row.innerHTML = `
            <div class="message-bubble">
                ${!m.isOutgoing && isGroup ? `
                    <div class="group-sender-header">
                        <span>@${this.escapeHtml(m.senderUsername || 'user')}</span>
                    </div>
                ` : ''}
                ${this.escapeHtml(m.text)}
            </div>
            <div class="message-meta">
                ${m.expiresAt ? `<span class="expires-indicator" title="Disappearing message">⏳</span>` : ''}
                <span>${m.timeFormatted}</span>
                ${m.isOutgoing ? this.getReadTicksHtml(m.status) : ''}
            </div>
        `;

        // If typing indicator is active at bottom, insert before it
        const typingEl = feed.querySelector('#feed-typing-indicator');
        if (typingEl) {
            feed.insertBefore(row, typingEl);
        } else {
            feed.appendChild(row);
        }

        feed.scrollTop = feed.scrollHeight;
    },

    /**
     * Handle realtime message status updates (Delivered / Read)
     */
    handleMessageUpdate(root, payload) {
        const feed = root.querySelector('#messages-feed');
        if (!feed) return;

        const targetId = payload.id || payload.messageId;
        if (targetId) {
            const row = feed.querySelector(`[data-msg-id="${targetId}"]`);
            if (row) {
                const ticksEl = row.querySelector('.read-ticks');
                if (ticksEl) {
                    if (payload.read_at || payload.status === 'read') {
                        ticksEl.className = 'read-ticks ticks-read';
                        ticksEl.title = 'Read';
                        ticksEl.textContent = '✓✓';
                    } else if (payload.delivered_at || payload.status === 'delivered') {
                        ticksEl.className = 'read-ticks ticks-delivered';
                        ticksEl.title = 'Delivered';
                        ticksEl.textContent = '✓✓';
                    }
                }
            }
        }

        // If reader confirmed reading the conversation, upgrade outgoing ticks to read
        if (payload.readerId && payload.status === 'read') {
            feed.querySelectorAll('.message-row.outgoing .read-ticks').forEach(ticks => {
                ticks.className = 'read-ticks ticks-read';
                ticks.title = 'Read';
                ticks.textContent = '✓✓';
            });
        }
    },

    /**
     * Remove expired or deleted message from feed
     */
    removeMessageFromFeed(root, messageId) {
        const feed = root.querySelector('#messages-feed');
        if (!feed) return;

        const row = feed.querySelector(`[data-msg-id="${messageId}"]`);
        if (row) {
            row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            row.style.opacity = '0';
            row.style.transform = 'scale(0.95)';
            setTimeout(() => row.remove(), 300);
        }
    },

    /**
     * Show or hide peer typing indicator in header and feed
     */
    showPeerTypingIndicator(root, username, isTyping) {
        const feed = root.querySelector('#messages-feed');
        const headerStatus = root.querySelector('#chat-header-status');
        const conv = this.state.activeConversation;

        if (headerStatus && conv) {
            if (isTyping) {
                headerStatus.innerHTML = `<span style="color: var(--accent); font-weight: 500;">typing...</span>`;
            } else {
                if (conv.isOnline) {
                    headerStatus.innerHTML = `<span style="color: var(--color-success); font-weight: 500;">● Online</span>`;
                } else {
                    headerStatus.textContent = conv.peerUsername ? `@${conv.peerUsername}` : 'Private Chat';
                }
            }
        }

        if (feed) {
            let typingEl = feed.querySelector('#feed-typing-indicator');
            if (isTyping) {
                if (!typingEl) {
                    typingEl = document.createElement('div');
                    typingEl.id = 'feed-typing-indicator';
                    typingEl.className = 'typing-bubble-row';
                    typingEl.innerHTML = `
                        <div class="typing-dots-pill">
                            <span class="typing-dot"></span>
                            <span class="typing-dot"></span>
                            <span class="typing-dot"></span>
                        </div>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${this.escapeHtml(username || 'Peer')} is typing</span>
                    `;
                    feed.appendChild(typingEl);
                    feed.scrollTop = feed.scrollHeight;
                }
            } else if (typingEl) {
                typingEl.remove();
            }
        }
    },

    /**
     * Handle peer presence changes (Online / Offline)
     */
    handlePeerPresence(root, conv, presenceState) {
        const user = this.state.currentUser;
        if (!presenceState || !conv) return;

        let isPeerOnline = false;
        Object.values(presenceState).forEach(presences => {
            if (Array.isArray(presences)) {
                presences.forEach(p => {
                    if (p.user_id && p.user_id !== user?.id) {
                        isPeerOnline = true;
                    }
                });
            }
        });

        conv.isOnline = isPeerOnline;

        const statusEl = root.querySelector('#chat-header-status');
        if (statusEl) {
            if (isPeerOnline) {
                statusEl.innerHTML = `<span style="color: var(--color-success); font-weight: 500;">● Online</span>`;
            } else {
                statusEl.textContent = conv.peerUsername ? `@${conv.peerUsername}` : 'Private Chat';
            }
        }

        const sidebarItem = root.querySelector('.chat-item.active .online-indicator');
        if (sidebarItem) {
            sidebarItem.style.display = isPeerOnline ? 'block' : 'none';
        }
    },

    /**
     * Disappearing message live countdown & client evaporation
     */
    startDisappearingWatcher(root) {
        if (this.disappearingTimerInterval) {
            clearInterval(this.disappearingTimerInterval);
        }

        this.disappearingTimerInterval = setInterval(() => {
            const feed = root.querySelector('#messages-feed');
            if (!feed) return;

            const now = Date.now();
            const expiringRows = feed.querySelectorAll('.message-row[data-expires-at]');
            let hasExpired = false;

            expiringRows.forEach(row => {
                const expiresAt = row.getAttribute('data-expires-at');
                if (expiresAt && new Date(expiresAt).getTime() <= now) {
                    hasExpired = true;
                    row.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                    row.style.opacity = '0';
                    row.style.transform = 'scale(0.9)';
                    setTimeout(() => row.remove(), 400);
                }
            });

            if (hasExpired) {
                chatService.purgeExpiredMessages();
            }
        }, 1000);
    },

    /**
     * Update Right Info Panel
     */
    async updateInfoPanel(root, conv) {
        root.querySelector('#info-name-text').textContent = conv.title;
        root.querySelector('#info-handle-text').textContent = conv.peerUsername ? `@${conv.peerUsername}` : '@group';
        root.querySelector('#info-stat-handle').textContent = conv.peerUsername ? `@${conv.peerUsername}` : 'Group';

        const timerLabel = root.querySelector('#current-disappearing-label');
        if (timerLabel) {
            timerLabel.textContent = this.formatDisappearingDuration(conv.disappearingTimer);
        }

        const avatarBox = root.querySelector('#info-avatar-box');
        if (conv.avatarUrl) {
            avatarBox.innerHTML = `<img src="${conv.avatarUrl}" alt="${conv.title}" />`;
        } else {
            avatarBox.innerHTML = `<span>${conv.title.charAt(0).toUpperCase()}</span>`;
        }

        // Mute state
        const muteLabel = root.querySelector('#mute-label-text');
        const muteSub = root.querySelector('#mute-sub-text');
        const muteIcon = root.querySelector('#mute-status-icon');
        if (muteLabel) muteLabel.textContent = conv.isMuted ? 'Unmute Notifications' : 'Mute Notifications';
        if (muteSub) muteSub.textContent = conv.isMuted ? 'Notifications are currently muted' : 'Silence alerts for this chat';
        if (muteIcon) muteIcon.textContent = conv.isMuted ? '🔕' : '🔔';

        // Privacy Chat Mode state
        const privacyToggle = root.querySelector('#toggle-privacy-mode');
        if (privacyToggle) {
            privacyToggle.checked = !!conv.isPrivacyMode;
        }

        const isGroup = conv.type === 'group';
        const groupMembersContainer = root.querySelector('#info-group-members-container');
        const rowEditGroup = root.querySelector('#row-edit-group-info');
        const rowLeaveGroup = root.querySelector('#row-leave-group');
        const rowDeleteGroup = root.querySelector('#row-delete-group');
        const aboutText = root.querySelector('#info-about-text');
        const friendsCountEl = root.querySelector('#info-stat-friends');
        const joinedDateEl = root.querySelector('#info-stat-joined');
        const statFriendsLabel = root.querySelector('#info-stat-friends')?.parentElement?.querySelector('.info-stat-label');
        const statHandleLabel = root.querySelector('#info-stat-handle')?.parentElement?.querySelector('.info-stat-label');

        if (isGroup) {
            root.querySelector('#info-name-text').textContent = conv.title;
            root.querySelector('#info-handle-text').textContent = '@group';
            root.querySelector('#info-stat-handle').textContent = 'Group';
            if (statHandleLabel) statHandleLabel.textContent = 'Type';
            if (statFriendsLabel) statFriendsLabel.textContent = 'Members';
            if (joinedDateEl) joinedDateEl.textContent = '2026';

            if (aboutText) {
                aboutText.textContent = conv.description || 'Welcome to ' + conv.title;
            }

            // Fetch full group details & members
            const grpRes = await chatService.getGroupDetails(conv.id);
            if (grpRes.success) {
                const groupData = grpRes.group || {};
                const members = grpRes.members || [];
                const callerMembership = grpRes.callerMembership || {};
                const callerRole = callerMembership.role || 'member'; // 'owner' | 'admin' | 'member'
                const canManage = callerRole === 'owner' || callerRole === 'admin';

                if (friendsCountEl) friendsCountEl.textContent = String(members.length);
                if (groupData.avatar_url) {
                    avatarBox.innerHTML = `<img src="${groupData.avatar_url}" alt="${conv.title}" />`;
                }

                // Show Group Members Container
                if (groupMembersContainer) {
                    groupMembersContainer.style.display = 'block';
                    root.querySelector('#info-group-members-title').textContent = `Members (${members.length})`;

                    const btnAdd = root.querySelector('#btn-info-add-member');
                    if (btnAdd) {
                        btnAdd.style.display = canManage ? 'inline-block' : 'none';
                        btnAdd.onclick = () => this.showAddGroupMembersModal(root, groupData);
                    }

                    const listEl = root.querySelector('#info-group-members-list');
                    listEl.innerHTML = '';

                    members.forEach(m => {
                        const isSelf = m.user_id === this.state.currentUser?.id;
                        const roleClass = m.role === 'owner' ? 'role-owner' : (m.role === 'admin' ? 'role-admin' : 'role-member');
                        const roleLabel = m.role === 'owner' ? '👑 Owner' : (m.role === 'admin' ? '🛡️ Admin' : 'Member');

                        const item = document.createElement('div');
                        item.className = 'group-member-item';
                        item.innerHTML = `
                            <div class="group-member-info">
                                <div class="group-member-avatar">
                                    ${m.avatar_url ? `<img src="${m.avatar_url}" alt="${m.username}" />` : `<span>${(m.username || 'U').charAt(0).toUpperCase()}</span>`}
                                </div>
                                <div class="group-member-text">
                                    <div class="group-member-name">${this.escapeHtml(m.display_name || m.username)} ${isSelf ? '<span style="font-weight: 400; opacity: 0.7;">(You)</span>' : ''}</div>
                                    <div class="group-member-handle">@${this.escapeHtml(m.username)}</div>
                                </div>
                            </div>
                            <div class="group-member-actions">
                                <span class="group-role-badge ${roleClass}">${roleLabel}</span>
                                <div class="actions-buttons" style="display: flex; gap: 0.25rem;"></div>
                            </div>
                        `;

                        const actionsBox = item.querySelector('.actions-buttons');

                        // If not self, display authorized moderation actions
                        if (!isSelf) {
                            if (callerRole === 'owner') {
                                if (m.role === 'admin') {
                                    const btnDemote = document.createElement('button');
                                    btnDemote.className = 'btn-member-action';
                                    btnDemote.textContent = 'Demote';
                                    btnDemote.title = 'Demote to regular member';
                                    btnDemote.onclick = async () => {
                                        if (confirm(`Demote @${m.username} to regular member?`)) {
                                            const res = await chatService.setGroupMemberRole(conv.id, m.user_id, 'member');
                                            if (res.success) this.updateInfoPanel(root, conv);
                                            else alert('Failed: ' + res.error);
                                        }
                                    };
                                    actionsBox.appendChild(btnDemote);
                                } else {
                                    const btnPromote = document.createElement('button');
                                    btnPromote.className = 'btn-member-action';
                                    btnPromote.textContent = 'Promote';
                                    btnPromote.title = 'Promote to group admin';
                                    btnPromote.onclick = async () => {
                                        if (confirm(`Promote @${m.username} to group admin?`)) {
                                            const res = await chatService.setGroupMemberRole(conv.id, m.user_id, 'admin');
                                            if (res.success) this.updateInfoPanel(root, conv);
                                            else alert('Failed: ' + res.error);
                                        }
                                    };
                                    actionsBox.appendChild(btnPromote);
                                }

                                const btnTransfer = document.createElement('button');
                                btnTransfer.className = 'btn-member-action';
                                btnTransfer.textContent = '👑 Transfer';
                                btnTransfer.title = 'Transfer ownership to this member';
                                btnTransfer.onclick = () => this.showTransferOwnershipModal(root, groupData, m);
                                actionsBox.appendChild(btnTransfer);

                                const btnRemove = document.createElement('button');
                                btnRemove.className = 'btn-member-action danger';
                                btnRemove.textContent = '✕ Remove';
                                btnRemove.onclick = async () => {
                                    if (confirm(`Remove @${m.username} from group?`)) {
                                        const res = await chatService.removeGroupMember(conv.id, m.user_id);
                                        if (res.success) this.updateInfoPanel(root, conv);
                                        else alert('Failed: ' + res.error);
                                    }
                                };
                                actionsBox.appendChild(btnRemove);
                            } else if (callerRole === 'admin' && m.role === 'member') {
                                const btnRemove = document.createElement('button');
                                btnRemove.className = 'btn-member-action danger';
                                btnRemove.textContent = '✕ Remove';
                                btnRemove.onclick = async () => {
                                    if (confirm(`Remove @${m.username} from group?`)) {
                                        const res = await chatService.removeGroupMember(conv.id, m.user_id);
                                        if (res.success) this.updateInfoPanel(root, conv);
                                        else alert('Failed: ' + res.error);
                                    }
                                };
                                actionsBox.appendChild(btnRemove);
                            }
                        }

                        listEl.appendChild(item);
                    });
                }

                // Show/hide Group Action Rows
                if (rowEditGroup) {
                    rowEditGroup.style.display = canManage ? 'flex' : 'none';
                    rowEditGroup.onclick = () => this.showEditGroupModal(root, groupData);
                }
                if (rowLeaveGroup) {
                    rowLeaveGroup.style.display = 'flex';
                    rowLeaveGroup.onclick = () => this.showLeaveGroupModal(root, groupData, members, callerRole);
                }
                if (rowDeleteGroup) {
                    rowDeleteGroup.style.display = (callerRole === 'owner') ? 'flex' : 'none';
                    rowDeleteGroup.onclick = () => this.showDeleteGroupModal(root, groupData);
                }
            }
        } else {
            // Direct chat: hide group specific sections
            if (groupMembersContainer) groupMembersContainer.style.display = 'none';
            if (rowEditGroup) rowEditGroup.style.display = 'none';
            if (rowLeaveGroup) rowLeaveGroup.style.display = 'none';
            if (rowDeleteGroup) rowDeleteGroup.style.display = 'none';
            if (statHandleLabel) statHandleLabel.textContent = 'Username';
            if (statFriendsLabel) statFriendsLabel.textContent = 'Friends';

            // Fetch peer profile details respecting privacy settings
            if (conv.peerUsername) {
                const peerRes = await profileService.getProfile({ username: conv.peerUsername });
                if (peerRes.success && peerRes.profile) {
                    const peer = peerRes.profile;
                    const coverBox = root.querySelector('#info-cover-box img');
                    if (coverBox && peer.banner_url) {
                        coverBox.src = peer.banner_url;
                    }

                    if (peer.is_restricted) {
                        if (aboutText) aboutText.textContent = peer.restricted_reason || 'This profile is private or friends only.';
                        if (friendsCountEl) friendsCountEl.textContent = '—';
                        if (joinedDateEl) joinedDateEl.textContent = peer.joinedDateFormatted || 'Private';
                    } else {
                        if (aboutText) aboutText.textContent = peer.bio || 'Life is better with good conversations.';
                        if (friendsCountEl) friendsCountEl.textContent = String(peer.friends_count ?? 0);
                        if (joinedDateEl) joinedDateEl.textContent = peer.joinedDateFormatted || '2026';
                    }
                }
            }
        }
    },

    /**
     * Render Active Tab in Sidebar (Chats / Friends / Groups / Profile / Settings / Notifications)
     */
    async renderActiveTabContent(root) {
        const list = root.querySelector('#sidebar-list-content');
        const title = root.querySelector('#sidebar-section-title');

        if (this.state.activeTab === 'chats') {
            this.renderConversationsList(root);
        } else if (this.state.activeTab === 'friends') {
            await this.renderFriendsTab(root);
        } else if (this.state.activeTab === 'groups') {
            title.textContent = 'Groups';
            list.innerHTML = `
                <div class="groups-action-bar">
                    <div class="groups-tab-pills">
                        <button type="button" class="filter-pill active" id="pill-all-groups">All</button>
                    </div>
                    <button type="button" id="btn-create-group-modal" class="btn-primary" style="min-height: 34px; padding: 0.35rem 0.85rem; font-size: 0.825rem;">
                        + Create Group
                    </button>
                </div>
                <div id="groups-list-subcontainer" style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <div class="empty-state-box"><span class="spinner" style="border-top-color: var(--accent);"></span></div>
                </div>
            `;
            root.querySelector('#btn-create-group-modal').addEventListener('click', () => {
                this.showCreateGroupModal(root);
            });
            const sub = list.querySelector('#groups-list-subcontainer');
            const grps = this.state.conversations.filter(c => c.type === 'group');
            if (grps.length === 0) {
                sub.innerHTML = `
                    <div class="empty-state-box">
                        <div class="empty-state-icon">👥</div>
                        <h3 class="empty-state-title">No groups joined</h3>
                        <p class="empty-state-desc">Create or join a group text channel above.</p>
                    </div>
                `;
            } else {
                sub.innerHTML = '';
                grps.forEach(g => {
                    const item = document.createElement('div');
                    item.className = 'chat-item';
                    item.innerHTML = `
                        <div class="avatar-wrapper">
                            ${g.avatarUrl ? `<img src="${g.avatarUrl}" alt="${g.title}" />` : `<span>${g.title.charAt(0).toUpperCase()}</span>`}
                        </div>
                        <div class="chat-item-content">
                            <div class="chat-item-top">
                                <span class="chat-item-name">${g.title}</span>
                                <span class="chat-item-time">${g.lastMessageTime}</span>
                            </div>
                            <div class="chat-item-bottom">
                                <span class="chat-item-lastmsg">Group text channel</span>
                                <span class="group-member-count-badge">Active</span>
                            </div>
                        </div>
                    `;
                    item.addEventListener('click', () => this.selectConversation(root, g));
                    sub.appendChild(item);
                });
            }
        } else if (this.state.activeTab === 'profile') {
            title.textContent = 'Profile';
            const p = this.state.currentProfile || {};
            const stats = this.state.stats;
            const displayName = p.display_name || 'User';
            const username = p.username || 'username';

            list.innerHTML = `
                <div class="profile-view-scroll">
                    <!-- Cover Banner -->
                    <div class="profile-cover-banner">
                        <img 
                            id="profile-view-banner-img" 
                            src="${p.banner_url || 'data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%231e293b\\'/%3E%3C/svg%3E'}" 
                            alt="Cover" 
                        />
                        <button type="button" class="profile-banner-upload-btn" id="btn-change-banner-upload" title="Change Cover Banner">
                            📷 Banner
                        </button>
                        <input type="file" id="profile-banner-file" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                    </div>

                    <!-- Centered Avatar & Header -->
                    <div class="profile-header-content">
                        <div class="profile-main-avatar">
                            ${p.avatar_url ? `<img id="profile-view-avatar-img" src="${p.avatar_url}" alt="${displayName}" />` : `<span id="profile-view-avatar-initial">${displayName.charAt(0).toUpperCase()}</span>`}
                            <label for="profile-avatar-file" class="profile-avatar-overlay-btn" title="Change Avatar">
                                📷
                            </label>
                            <input type="file" id="profile-avatar-file" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                        </div>

                        <h3 class="profile-name-text">${displayName}</h3>
                        <div style="font-size: 0.85rem; color: var(--accent); font-weight: 600; margin-bottom: 0.25rem;">@${username}</div>
                        <div class="profile-status-pill">
                            <span>●</span>
                            <span>Online</span>
                        </div>

                        <!-- 3 Stats Cards (Friends | Groups | Joined) -->
                        <div class="profile-stats-container">
                            <div class="profile-stat-box">
                                <span class="profile-stat-num">${stats.friendsCount}</span>
                                <span class="profile-stat-lbl">Friends</span>
                            </div>
                            <div class="profile-stat-box">
                                <span class="profile-stat-num">${stats.groupsCount}</span>
                                <span class="profile-stat-lbl">Groups</span>
                            </div>
                            <div class="profile-stat-box">
                                <span class="profile-stat-num">${stats.joinedDate}</span>
                                <span class="profile-stat-lbl">Joined</span>
                            </div>
                        </div>

                        <!-- Bio Box -->
                        <div class="profile-bio-box">
                            <div class="profile-bio-title">About</div>
                            <div style="font-size: 0.875rem; color: var(--text-primary); line-height: 1.4;">
                                ${p.bio || 'Good vibes only.'}
                            </div>
                        </div>

                        <!-- Action List Rows -->
                        <div class="profile-actions-list">
                            <div class="settings-row" id="row-prof-edit">
                                <div class="settings-row-left">
                                    <span>✏️</span>
                                    <span>Edit Profile</span>
                                </div>
                                <span style="color: var(--text-muted);">›</span>
                            </div>
                            <div class="settings-row" id="row-prof-username">
                                <div class="settings-row-left">
                                    <span>🆔</span>
                                    <span>Change Username</span>
                                </div>
                                <span class="form-hint" style="color: var(--accent); font-weight: 500;">7-Day Limit ›</span>
                            </div>
                            <div class="settings-row" id="row-prof-privacy">
                                <div class="settings-row-left">
                                    <span>🛡️</span>
                                    <span>Privacy Settings</span>
                                </div>
                                <span style="color: var(--text-muted);">›</span>
                            </div>
                            <div class="settings-row" id="row-prof-account">
                                <div class="settings-row-left">
                                    <span>⚙️</span>
                                    <span>Account Settings</span>
                                </div>
                                <span style="color: var(--text-muted);">›</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Profile Upload Bindings
            const avatarInput = list.querySelector('#profile-avatar-file');
            avatarInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const res = await storageService.uploadAvatar(file);
                if (res.success) {
                    this.state.currentProfile.avatar_url = res.url;
                    this.renderActiveTabContent(root);
                } else {
                    alert('Avatar upload failed: ' + res.error);
                }
            });

            const bannerBtn = list.querySelector('#btn-change-banner-upload');
            const bannerInput = list.querySelector('#profile-banner-file');
            bannerBtn.addEventListener('click', () => bannerInput.click());
            bannerInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const res = await storageService.uploadCover(file);
                if (res.success) {
                    this.state.currentProfile.banner_url = res.url;
                    this.renderActiveTabContent(root);
                } else {
                    alert('Banner upload failed: ' + res.error);
                }
            });

            list.querySelector('#row-prof-edit').addEventListener('click', () => {
                this.showEditProfileModal(root);
            });

            list.querySelector('#row-prof-username').addEventListener('click', () => {
                this.showChangeUsernameModal(root);
            });

            list.querySelector('#row-prof-privacy').addEventListener('click', () => {
                router.navigate('#/settings/privacy');
            });

            list.querySelector('#row-prof-account').addEventListener('click', () => {
                router.navigate('#/settings/account');
            });

        } else if (this.state.activeTab === 'settings') {
            title.textContent = 'Settings';
            const p = this.state.currentProfile || {};
            const displayName = p.display_name || 'User';
            const username = p.username || 'user';
            const currentTheme = localStorage.getItem('imd_theme') || 'system';
            const themeLabel = currentTheme === 'light' ? 'Light' : (currentTheme === 'dark' ? 'Dark' : 'System Default');
            const isAdmin = p.role === 'admin' || p.role === 'moderator';

            list.innerHTML = `
                <div class="mobile-view-wrapper">
                    <!-- User Header Summary Card -->
                    <div class="settings-user-card" id="settings-user-card-click">
                        <div class="avatar-wrapper" style="width: 52px; height: 52px; font-size: 1.25rem;">
                            ${p.avatar_url ? `<img src="${p.avatar_url}" alt="${displayName}" />` : `<span>${displayName.charAt(0).toUpperCase()}</span>`}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">${displayName}</div>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">@${username}</div>
                        </div>
                        <span style="color: var(--text-muted); font-size: 1.1rem;">›</span>
                    </div>

                    <!-- Settings List Rows -->
                    <div class="settings-group">
                        <div class="settings-row" id="row-settings-account">
                            <div class="settings-row-left">
                                <span>👤</span>
                                <span>Account Settings</span>
                            </div>
                            <span style="color: var(--text-muted);">›</span>
                        </div>
                        <div class="settings-row" id="row-settings-privacy">
                            <div class="settings-row-left">
                                <span>🛡️</span>
                                <span>Privacy Settings</span>
                            </div>
                            <span style="color: var(--text-muted);">›</span>
                        </div>
                        <div class="settings-row" id="row-settings-notif">
                            <div class="settings-row-left">
                                <span>🔔</span>
                                <span>Notification Settings</span>
                            </div>
                            <span style="color: var(--text-muted);">›</span>
                        </div>
                        <div class="settings-row" id="row-settings-theme">
                            <div class="settings-row-left">
                                <span>🌓</span>
                                <span>Theme Settings</span>
                            </div>
                            <div class="settings-row-right">
                                <span>${themeLabel}</span>
                                <span>›</span>
                            </div>
                        </div>
                        <div class="settings-row" id="row-settings-sec">
                            <div class="settings-row-left">
                                <span>🔐</span>
                                <span>Security Settings</span>
                            </div>
                            <span style="color: var(--text-muted);">›</span>
                        </div>
                        ${isAdmin ? `
                            <div class="settings-row" id="row-settings-admin" style="background: rgba(37, 99, 235, 0.05); color: var(--accent); font-weight: 600;">
                                <div class="settings-row-left">
                                    <span>🛡️</span>
                                    <span>Admin Portal</span>
                                </div>
                                <span>›</span>
                            </div>
                        ` : ''}
                        <div class="settings-row" id="row-settings-help">
                            <div class="settings-row-left">
                                <span>❓</span>
                                <span>Help & Support</span>
                            </div>
                            <span style="color: var(--text-muted);">›</span>
                        </div>
                        <div class="settings-row" id="row-settings-logout" style="color: var(--color-danger);">
                            <div class="settings-row-left">
                                <span>🚪</span>
                                <span style="font-weight: 600;">Logout</span>
                            </div>
                            <span>›</span>
                        </div>
                    </div>
                </div>
            `;

            list.querySelector('#settings-user-card-click').addEventListener('click', () => {
                router.navigate('#/settings/account');
            });

            list.querySelector('#row-settings-account').addEventListener('click', () => {
                router.navigate('#/settings/account');
            });

            list.querySelector('#row-settings-privacy').addEventListener('click', () => {
                router.navigate('#/settings/privacy');
            });

            list.querySelector('#row-settings-notif').addEventListener('click', () => {
                router.navigate('#/settings/notifications');
            });

            list.querySelector('#row-settings-theme').addEventListener('click', () => {
                router.navigate('#/settings/theme');
            });

            list.querySelector('#row-settings-sec').addEventListener('click', () => {
                router.navigate('#/settings/security');
            });

            if (isAdmin) {
                list.querySelector('#row-settings-admin')?.addEventListener('click', () => {
                    router.navigate('#/admin');
                });
            }

            list.querySelector('#row-settings-help').addEventListener('click', () => {
                alert('ImdConnect text-only platform.\nFor privacy queries: security@auth.imdconnect.local');
            });

            list.querySelector('#row-settings-logout').addEventListener('click', async () => {
                await authService.logout();
                router.navigate('#/login');
            });

        } else if (this.state.activeTab === 'notifications') {
            title.textContent = 'Notifications';
            list.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">🔔</div>
                    <h3 class="empty-state-title">All caught up!</h3>
                    <p class="empty-state-desc">No new friend requests or unread system notifications.</p>
                </div>
            `;
        }
    },

    /**
     * Start New Chat / Search User Modal
     * Enforces: Direct messages require mutual friendship.
     */
    showNewChatModal(root) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Start New Chat</h3>
                    <button type="button" id="btn-close-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    <div class="form-group" style="margin-bottom: 0.75rem;">
                        <label class="form-label">Find User by @username or Name</label>
                        <input type="text" id="modal-search-user" class="form-input" placeholder="Search @username or name..." autofocus />
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.35rem;">
                        <span>🔒</span>
                        <span>Direct messaging strictly requires an accepted mutual friendship.</span>
                    </div>
                    <div id="modal-user-results" style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
                        <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1.5rem 0;">
                            Type at least 1 character to search
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        const input = modal.querySelector('#modal-search-user');
        const results = modal.querySelector('#modal-user-results');

        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const query = input.value.trim();
                if (!query) {
                    results.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1.5rem 0;">Type at least 1 character to search</div>`;
                    return;
                }
                results.innerHTML = `<span class="spinner" style="border-top-color: var(--accent); margin: 1rem auto;"></span>`;
                const users = await friendService.searchUsers(query);
                if (users.length === 0) {
                    results.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1rem 0;">No users found matching "${this.escapeHtml(query)}"</div>`;
                    return;
                }
                results.innerHTML = '';
                users.forEach(u => {
                    const row = document.createElement('div');
                    row.className = 'friend-item-row';
                    row.style.padding = '0.5rem 0';
                    row.innerHTML = `
                        <div class="friend-item-avatar-col">
                            <div class="avatar-wrapper">
                                ${u.avatar_url ? `<img src="${u.avatar_url}" alt="${this.escapeHtml(u.display_name)}" />` : `<span>${u.display_name.charAt(0).toUpperCase()}</span>`}
                            </div>
                        </div>
                        <div class="friend-item-info">
                            <div class="friend-item-name">${this.escapeHtml(u.display_name)}</div>
                            <div class="friend-item-handle">@${this.escapeHtml(u.username)}</div>
                        </div>
                        <div class="friend-item-actions" id="user-actions-${u.id}"></div>
                    `;

                    const actionsCol = row.querySelector(`#user-actions-${u.id}`);

                    if (u.is_friend) {
                        actionsCol.innerHTML = `<button type="button" class="btn-friend-action btn-friend-primary btn-chat-action">💬 Chat</button>`;
                        actionsCol.querySelector('.btn-chat-action').addEventListener('click', async () => {
                            modal.style.display = 'none';
                            const res = await chatService.createDirectConversation(u.id);
                            if (res.success) {
                                await this.loadConversations(root);
                                const target = this.state.conversations.find(c => c.id === res.conversationId);
                                if (target) {
                                    this.switchTab(root, 'chats');
                                    this.selectConversation(root, target);
                                }
                            } else {
                                alert(res.error || 'Could not start conversation.');
                            }
                        });
                    } else if (u.request_status === 'pending_outgoing') {
                        actionsCol.innerHTML = `<span class="btn-friend-action btn-friend-muted">Request Sent</span>`;
                    } else if (u.request_status === 'pending_incoming') {
                        actionsCol.innerHTML = `<button type="button" class="btn-friend-action btn-friend-primary btn-accept-action">Accept</button>`;
                        actionsCol.querySelector('.btn-accept-action').addEventListener('click', async () => {
                            const res = await friendService.acceptFriendRequest(u.request_id);
                            if (res.success) {
                                actionsCol.innerHTML = `<button type="button" class="btn-friend-action btn-friend-primary btn-chat-action">💬 Chat</button>`;
                                await this.refreshSocialState(root);
                            }
                        });
                    } else if (u.is_blocked_by_me) {
                        actionsCol.innerHTML = `<span class="btn-friend-action btn-friend-danger">Blocked</span>`;
                    } else {
                        actionsCol.innerHTML = `<button type="button" class="btn-friend-action btn-friend-primary btn-add-friend-action">+ Add Friend</button>`;
                        actionsCol.querySelector('.btn-add-friend-action').addEventListener('click', async (e) => {
                            e.target.disabled = true;
                            e.target.textContent = 'Sending...';
                            const res = await friendService.sendFriendRequest(u.id);
                            if (res.success) {
                                if (res.status === 'accepted') {
                                    actionsCol.innerHTML = `<button type="button" class="btn-friend-action btn-friend-primary btn-chat-action">💬 Chat</button>`;
                                } else {
                                    actionsCol.innerHTML = `<span class="btn-friend-action btn-friend-muted">Request Sent</span>`;
                                }
                                await this.refreshSocialState(root);
                            } else {
                                e.target.disabled = false;
                                e.target.textContent = '+ Add Friend';
                                alert(res.error || 'Could not send friend request.');
                            }
                        });
                    }

                    results.appendChild(row);
                });
            }, 300);
        });
    },

    /**
     * Render Social & Friends Tab with Sub-Navigation
     */
    async renderFriendsTab(root) {
        const list = root.querySelector('#sidebar-list-content');
        const title = root.querySelector('#sidebar-section-title');
        title.textContent = 'Social & Friends';

        list.innerHTML = `<div class="empty-state-box"><span class="spinner" style="border-top-color: var(--accent);"></span></div>`;

        // Refresh overview data
        const overview = await friendService.getSocialOverview();
        this.state.friends = overview.friends || [];
        this.state.pendingIncoming = overview.pending_incoming || [];
        this.state.pendingOutgoing = overview.pending_outgoing || [];
        this.state.blockedUsers = overview.blocked || [];

        this.updateFriendsBadges(root);

        const subTab = this.state.activeFriendsSubTab || 'all';

        // Render sub-navigation bar
        list.innerHTML = `
            <div class="friends-nav-bar" id="friends-nav-bar">
                <button type="button" class="friends-subtab-pill ${subTab === 'all' ? 'active' : ''}" data-subtab="all">
                    <span>Friends</span>
                    <span class="friends-pill-badge">${this.state.friends.length}</span>
                </button>
                <button type="button" class="friends-subtab-pill ${subTab === 'incoming' ? 'active' : ''}" data-subtab="incoming">
                    <span>Requests</span>
                    <span class="friends-pill-badge ${this.state.pendingIncoming.length > 0 ? 'badge-alert' : ''}">${this.state.pendingIncoming.length}</span>
                </button>
                <button type="button" class="friends-subtab-pill ${subTab === 'outgoing' ? 'active' : ''}" data-subtab="outgoing">
                    <span>Sent</span>
                    <span class="friends-pill-badge">${this.state.pendingOutgoing.length}</span>
                </button>
                <button type="button" class="friends-subtab-pill ${subTab === 'search' ? 'active' : ''}" data-subtab="search">
                    <span>🔍 Find</span>
                </button>
                <button type="button" class="friends-subtab-pill ${subTab === 'blocked' ? 'active' : ''}" data-subtab="blocked">
                    <span>Blocked</span>
                    <span class="friends-pill-badge">${this.state.blockedUsers.length}</span>
                </button>
            </div>
            <div id="friends-tab-body" style="display: flex; flex-direction: column;"></div>
        `;

        // Bind subtab pills
        list.querySelectorAll('.friends-subtab-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.activeFriendsSubTab = btn.dataset.subtab;
                this.renderFriendsTab(root);
            });
        });

        const body = list.querySelector('#friends-tab-body');

        if (subTab === 'all') {
            this.renderAllFriendsSubTab(root, body);
        } else if (subTab === 'incoming') {
            this.renderIncomingRequestsSubTab(root, body);
        } else if (subTab === 'outgoing') {
            this.renderOutgoingRequestsSubTab(root, body);
        } else if (subTab === 'search') {
            this.renderSearchUsersSubTab(root, body);
        } else if (subTab === 'blocked') {
            this.renderBlockedUsersSubTab(root, body);
        }
    },

    /**
     * Render "All Friends" sub-tab
     */
    renderAllFriendsSubTab(root, container) {
        if (this.state.friends.length === 0) {
            container.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">👥</div>
                    <h3 class="empty-state-title">No friends yet</h3>
                    <p class="empty-state-desc">Connect with people by searching their @username to chat freely.</p>
                    <button type="button" id="btn-find-friends-now" class="btn-primary" style="font-size: 0.85rem; max-width: 180px;">Find Users</button>
                </div>
            `;
            container.querySelector('#btn-find-friends-now')?.addEventListener('click', () => {
                this.state.activeFriendsSubTab = 'search';
                this.renderFriendsTab(root);
            });
            return;
        }

        container.innerHTML = '';
        this.state.friends.forEach(f => {
            const row = document.createElement('div');
            row.className = 'friend-item-row';
            row.innerHTML = `
                <div class="friend-item-avatar-col">
                    <div class="avatar-wrapper">
                        ${f.avatar_url ? `<img src="${f.avatar_url}" alt="${this.escapeHtml(f.display_name)}" />` : `<span>${f.display_name.charAt(0).toUpperCase()}</span>`}
                        ${f.is_online ? `<div class="online-indicator"></div>` : ''}
                    </div>
                </div>
                <div class="friend-item-info">
                    <div class="friend-item-name">${this.escapeHtml(f.display_name)}</div>
                    <div class="friend-item-handle">@${this.escapeHtml(f.username)}</div>
                    ${f.bio ? `<div class="friend-item-bio">${this.escapeHtml(f.bio)}</div>` : ''}
                </div>
                <div class="friend-item-actions">
                    <button type="button" class="btn-friend-action btn-friend-primary btn-message-friend" title="Message">💬 Message</button>
                    <button type="button" class="btn-friend-action btn-friend-secondary btn-friend-menu" title="Options">⋯</button>
                </div>
            `;

            row.querySelector('.btn-message-friend').addEventListener('click', async (e) => {
                e.stopPropagation();
                const res = await chatService.createDirectConversation(f.id);
                if (res.success) {
                    await this.loadConversations(root);
                    const target = this.state.conversations.find(c => c.id === res.conversationId);
                    if (target) {
                        this.switchTab(root, 'chats');
                        this.selectConversation(root, target);
                    }
                } else {
                    alert(res.error || 'Could not start conversation.');
                }
            });

            row.querySelector('.btn-friend-menu').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showFriendOptionsModal(root, f);
            });

            container.appendChild(row);
        });
    },

    /**
     * Render "Incoming Requests" sub-tab
     */
    renderIncomingRequestsSubTab(root, container) {
        if (this.state.pendingIncoming.length === 0) {
            container.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">📥</div>
                    <h3 class="empty-state-title">No pending requests</h3>
                    <p class="empty-state-desc">You have no incoming friend requests right now.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.state.pendingIncoming.forEach(r => {
            const row = document.createElement('div');
            row.className = 'friend-item-row';
            row.innerHTML = `
                <div class="friend-item-avatar-col">
                    <div class="avatar-wrapper">
                        ${r.avatar_url ? `<img src="${r.avatar_url}" alt="${this.escapeHtml(r.display_name)}" />` : `<span>${r.display_name.charAt(0).toUpperCase()}</span>`}
                    </div>
                </div>
                <div class="friend-item-info">
                    <div class="friend-item-name">${this.escapeHtml(r.display_name)}</div>
                    <div class="friend-item-handle">@${this.escapeHtml(r.username)}</div>
                    <div class="friend-item-time">${this.formatTimeAgo(r.created_at)}</div>
                </div>
                <div class="friend-item-actions">
                    <button type="button" class="btn-friend-action btn-friend-primary btn-accept-req">Accept</button>
                    <button type="button" class="btn-friend-action btn-friend-danger btn-reject-req">Decline</button>
                </div>
            `;

            row.querySelector('.btn-accept-req').addEventListener('click', async (e) => {
                e.target.disabled = true;
                const res = await friendService.acceptFriendRequest(r.request_id);
                if (res.success) {
                    await this.refreshSocialState(root);
                } else {
                    e.target.disabled = false;
                    alert(res.error || 'Could not accept friend request.');
                }
            });

            row.querySelector('.btn-reject-req').addEventListener('click', async (e) => {
                e.target.disabled = true;
                const res = await friendService.rejectFriendRequest(r.request_id);
                if (res.success) {
                    await this.refreshSocialState(root);
                } else {
                    e.target.disabled = false;
                    alert(res.error || 'Could not decline friend request.');
                }
            });

            container.appendChild(row);
        });
    },

    /**
     * Render "Outgoing Requests" sub-tab
     */
    renderOutgoingRequestsSubTab(root, container) {
        if (this.state.pendingOutgoing.length === 0) {
            container.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">📤</div>
                    <h3 class="empty-state-title">No sent requests</h3>
                    <p class="empty-state-desc">You do not have any pending outgoing requests.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.state.pendingOutgoing.forEach(r => {
            const row = document.createElement('div');
            row.className = 'friend-item-row';
            row.innerHTML = `
                <div class="friend-item-avatar-col">
                    <div class="avatar-wrapper">
                        ${r.avatar_url ? `<img src="${r.avatar_url}" alt="${this.escapeHtml(r.display_name)}" />` : `<span>${r.display_name.charAt(0).toUpperCase()}</span>`}
                    </div>
                </div>
                <div class="friend-item-info">
                    <div class="friend-item-name">${this.escapeHtml(r.display_name)}</div>
                    <div class="friend-item-handle">@${this.escapeHtml(r.username)}</div>
                    <div class="friend-item-time">Awaiting response · ${this.formatTimeAgo(r.created_at)}</div>
                </div>
                <div class="friend-item-actions">
                    <button type="button" class="btn-friend-action btn-friend-secondary btn-cancel-req">Cancel</button>
                </div>
            `;

            row.querySelector('.btn-cancel-req').addEventListener('click', async (e) => {
                e.target.disabled = true;
                const res = await friendService.cancelFriendRequest(r.request_id);
                if (res.success) {
                    await this.refreshSocialState(root);
                } else {
                    e.target.disabled = false;
                    alert(res.error || 'Could not cancel friend request.');
                }
            });

            container.appendChild(row);
        });
    },

    /**
     * Render "Find Users" live social search sub-tab
     */
    renderSearchUsersSubTab(root, container) {
        container.innerHTML = `
            <div class="friends-search-header-box">
                <input 
                    type="text" 
                    id="friends-social-search-input" 
                    class="friends-search-input" 
                    placeholder="Search by @username or name..." 
                    value="${this.escapeHtml(this.state.friendsSearchQuery || '')}" 
                    autofocus 
                />
            </div>
            <div id="friends-social-results" style="display: flex; flex-direction: column;">
                <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem 1rem;">
                    Type a username (e.g. @alex) or display name to find users.
                </div>
            </div>
        `;

        const input = container.querySelector('#friends-social-search-input');
        const resultsBox = container.querySelector('#friends-social-results');

        let timer = null;
        const executeSearch = () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const query = input.value.trim();
                this.state.friendsSearchQuery = query;
                if (!query) {
                    resultsBox.innerHTML = `
                        <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem 1rem;">
                            Type a username or display name to find users.
                        </div>
                    `;
                    return;
                }

                resultsBox.innerHTML = `<span class="spinner" style="border-top-color: var(--accent); margin: 1.5rem auto;"></span>`;
                const users = await friendService.searchUsers(query);
                if (users.length === 0) {
                    resultsBox.innerHTML = `
                        <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 2rem 1rem;">
                            No users found matching "${this.escapeHtml(query)}"
                        </div>
                    `;
                    return;
                }

                resultsBox.innerHTML = '';
                users.forEach(u => {
                    const row = document.createElement('div');
                    row.className = 'friend-item-row';
                    row.innerHTML = `
                        <div class="friend-item-avatar-col">
                            <div class="avatar-wrapper">
                                ${u.avatar_url ? `<img src="${u.avatar_url}" alt="${this.escapeHtml(u.display_name)}" />` : `<span>${u.display_name.charAt(0).toUpperCase()}</span>`}
                            </div>
                        </div>
                        <div class="friend-item-info">
                            <div class="friend-item-name">${this.escapeHtml(u.display_name)}</div>
                            <div class="friend-item-handle">@${this.escapeHtml(u.username)}</div>
                            ${u.bio ? `<div class="friend-item-bio">${this.escapeHtml(u.bio)}</div>` : ''}
                        </div>
                        <div class="friend-item-actions" id="search-action-${u.id}"></div>
                    `;

                    const act = row.querySelector(`#search-action-${u.id}`);

                    if (u.is_friend) {
                        act.innerHTML = `
                            <button type="button" class="btn-friend-action btn-friend-primary btn-search-msg">💬 Message</button>
                        `;
                        act.querySelector('.btn-search-msg').addEventListener('click', async () => {
                            const res = await chatService.createDirectConversation(u.id);
                            if (res.success) {
                                await this.loadConversations(root);
                                const target = this.state.conversations.find(c => c.id === res.conversationId);
                                if (target) {
                                    this.switchTab(root, 'chats');
                                    this.selectConversation(root, target);
                                }
                            }
                        });
                    } else if (u.request_status === 'pending_outgoing') {
                        act.innerHTML = `
                            <button type="button" class="btn-friend-action btn-friend-secondary btn-search-cancel">Cancel</button>
                        `;
                        act.querySelector('.btn-search-cancel').addEventListener('click', async (e) => {
                            e.target.disabled = true;
                            const res = await friendService.cancelFriendRequest(u.request_id);
                            if (res.success) {
                                executeSearch();
                                await this.refreshSocialState(root);
                            }
                        });
                    } else if (u.request_status === 'pending_incoming') {
                        act.innerHTML = `
                            <button type="button" class="btn-friend-action btn-friend-primary btn-search-accept">Accept</button>
                        `;
                        act.querySelector('.btn-search-accept').addEventListener('click', async (e) => {
                            e.target.disabled = true;
                            const res = await friendService.acceptFriendRequest(u.request_id);
                            if (res.success) {
                                executeSearch();
                                await this.refreshSocialState(root);
                            }
                        });
                    } else if (u.is_blocked_by_me) {
                        act.innerHTML = `
                            <button type="button" class="btn-friend-action btn-friend-secondary btn-search-unblock">Unblock</button>
                        `;
                        act.querySelector('.btn-search-unblock').addEventListener('click', async (e) => {
                            e.target.disabled = true;
                            const res = await friendService.unblockUser(u.id);
                            if (res.success) {
                                executeSearch();
                                await this.refreshSocialState(root);
                            }
                        });
                    } else {
                        act.innerHTML = `
                            <button type="button" class="btn-friend-action btn-friend-primary btn-search-add">+ Add Friend</button>
                        `;
                        act.querySelector('.btn-search-add').addEventListener('click', async (e) => {
                            e.target.disabled = true;
                            e.target.textContent = 'Sending...';
                            const res = await friendService.sendFriendRequest(u.id);
                            if (res.success) {
                                executeSearch();
                                await this.refreshSocialState(root);
                            } else {
                                e.target.disabled = false;
                                e.target.textContent = '+ Add Friend';
                                alert(res.error || 'Could not send friend request.');
                            }
                        });
                    }

                    resultsBox.appendChild(row);
                });
            }, 300);
        };

        input.addEventListener('input', executeSearch);

        // If there was an existing query, trigger search
        if (this.state.friendsSearchQuery) {
            executeSearch();
        }
    },

    /**
     * Render "Blocked Users" sub-tab
     */
    renderBlockedUsersSubTab(root, container) {
        if (this.state.blockedUsers.length === 0) {
            container.innerHTML = `
                <div class="empty-state-box">
                    <div class="empty-state-icon">🛡️</div>
                    <h3 class="empty-state-title">No blocked users</h3>
                    <p class="empty-state-desc">You have not blocked anyone.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        this.state.blockedUsers.forEach(b => {
            const row = document.createElement('div');
            row.className = 'friend-item-row';
            row.innerHTML = `
                <div class="friend-item-avatar-col">
                    <div class="avatar-wrapper">
                        ${b.avatar_url ? `<img src="${b.avatar_url}" alt="${this.escapeHtml(b.display_name)}" />` : `<span>${b.display_name.charAt(0).toUpperCase()}</span>`}
                    </div>
                </div>
                <div class="friend-item-info">
                    <div class="friend-item-name">${this.escapeHtml(b.display_name)}</div>
                    <div class="friend-item-handle">@${this.escapeHtml(b.username)}</div>
                    <div class="friend-item-time">Blocked · All messaging prohibited</div>
                </div>
                <div class="friend-item-actions">
                    <button type="button" class="btn-friend-action btn-friend-secondary btn-unblock-action">Unblock</button>
                </div>
            `;

            row.querySelector('.btn-unblock-action').addEventListener('click', () => {
                this.showConfirmModal(root, {
                    title: 'Unblock User',
                    message: `Unblock @${b.username}? They will be able to send you friend requests again.`,
                    confirmText: 'Unblock',
                    confirmDanger: false,
                    onConfirm: async () => {
                        const res = await friendService.unblockUser(b.blocked_id);
                        if (res.success) {
                            await this.refreshSocialState(root);
                        } else {
                            alert(res.error || 'Could not unblock user.');
                        }
                    }
                });
            });

            container.appendChild(row);
        });
    },

    /**
     * Options modal for a friend (Message, Remove, Block)
     */
    showFriendOptionsModal(root, friend) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 360px;">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">${this.escapeHtml(friend.display_name)}</h3>
                    <button type="button" id="btn-close-friend-opts" class="btn-icon" aria-label="Close">✕</button>
                </div>
                <div class="modal-dialog-body" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <div style="font-size: 0.825rem; color: var(--text-muted); text-align: center; margin-bottom: 0.5rem;">
                        @${this.escapeHtml(friend.username)}
                    </div>
                    <button type="button" id="btn-opt-message" class="btn-primary" style="min-height: 38px;">💬 Message</button>
                    <button type="button" id="btn-opt-remove" class="btn-secondary" style="min-height: 38px; color: var(--danger); border-color: rgba(239,68,68,0.3);">✕ Remove Friend</button>
                    <button type="button" id="btn-opt-block" class="btn-secondary" style="min-height: 38px; color: var(--danger); border-color: rgba(239,68,68,0.3);">🚫 Block User</button>
                </div>
            </div>
        `;

        const close = () => { modal.style.display = 'none'; };
        modal.querySelector('#btn-close-friend-opts').addEventListener('click', close);

        modal.querySelector('#btn-opt-message').addEventListener('click', async () => {
            close();
            const res = await chatService.createDirectConversation(friend.id);
            if (res.success) {
                await this.loadConversations(root);
                const target = this.state.conversations.find(c => c.id === res.conversationId);
                if (target) {
                    this.switchTab(root, 'chats');
                    this.selectConversation(root, target);
                }
            } else {
                alert(res.error || 'Could not start conversation.');
            }
        });

        modal.querySelector('#btn-opt-remove').addEventListener('click', () => {
            close();
            this.showConfirmModal(root, {
                title: 'Remove Friend',
                message: `Are you sure you want to remove @${friend.username} from your friends? Mutual messaging will be disabled until a new friend request is accepted.`,
                confirmText: 'Remove',
                confirmDanger: true,
                onConfirm: async () => {
                    const res = await friendService.removeFriend(friend.id);
                    if (res.success) {
                        await this.refreshSocialState(root);
                    } else {
                        alert(res.error || 'Failed to remove friend.');
                    }
                }
            });
        });

        modal.querySelector('#btn-opt-block').addEventListener('click', () => {
            close();
            this.showConfirmModal(root, {
                title: 'Block User',
                message: `Are you sure you want to block @${friend.username}? All messaging permissions will be permanently severed, and they will not be able to find your profile.`,
                confirmText: 'Block User',
                confirmDanger: true,
                onConfirm: async () => {
                    const res = await friendService.blockUser(friend.id);
                    if (res.success) {
                        await this.refreshSocialState(root);
                    } else {
                        alert(res.error || 'Failed to block user.');
                    }
                }
            });
        });
    },

    /**
     * Confirmation Modal Dialog
     */
    showConfirmModal(root, { title, message, confirmText = 'Confirm', confirmDanger = false, onConfirm }) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">${this.escapeHtml(title)}</h3>
                    <button type="button" id="btn-close-confirm-modal" class="btn-icon" aria-label="Close">✕</button>
                </div>
                <div class="modal-dialog-body" style="display: flex; flex-direction: column; gap: 1rem;">
                    <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">${this.escapeHtml(message)}</p>
                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                        <button type="button" id="btn-cancel-confirm" class="btn-friend-action btn-friend-secondary">Cancel</button>
                        <button type="button" id="btn-action-confirm" class="btn-friend-action ${confirmDanger ? 'btn-friend-danger' : 'btn-friend-primary'}">${this.escapeHtml(confirmText)}</button>
                    </div>
                </div>
            </div>
        `;

        const close = () => { modal.style.display = 'none'; };
        modal.querySelector('#btn-close-confirm-modal').addEventListener('click', close);
        modal.querySelector('#btn-cancel-confirm').addEventListener('click', close);
        modal.querySelector('#btn-action-confirm').addEventListener('click', async () => {
            close();
            if (typeof onConfirm === 'function') await onConfirm();
        });
    },

    /**
     * Update navigation badges for incoming friend requests
     */
    updateFriendsBadges(root) {
        const incomingCount = this.state.pendingIncoming ? this.state.pendingIncoming.length : 0;
        const friendsCount = this.state.friends ? this.state.friends.length : 0;

        const badgeEl = root.querySelector('#badge-friends');
        if (badgeEl) {
            badgeEl.textContent = String(incomingCount);
            badgeEl.style.display = incomingCount > 0 ? 'inline-block' : 'none';
        }

        const bottomBadgeEl = root.querySelector('#bottom-badge-friends');
        if (bottomBadgeEl) {
            bottomBadgeEl.textContent = String(incomingCount);
            bottomBadgeEl.style.display = incomingCount > 0 ? 'inline-block' : 'none';
        }

        this.state.stats.friendsCount = friendsCount;
        const infoFriendsStat = root.querySelector('#info-stat-friends');
        if (infoFriendsStat && !this.state.activeConversation?.peerUsername) {
            infoFriendsStat.textContent = String(friendsCount);
        }
    },

    /**
     * Refresh social overview state from database
     */
    async refreshSocialState(root) {
        const overview = await friendService.getSocialOverview();
        this.state.friends = overview.friends || [];
        this.state.pendingIncoming = overview.pending_incoming || [];
        this.state.pendingOutgoing = overview.pending_outgoing || [];
        this.state.blockedUsers = overview.blocked || [];
        this.updateFriendsBadges(root);
        if (this.state.activeTab === 'friends') {
            this.renderFriendsTab(root);
        }
    },

    /**
     * Format time ago relative string
     */
    formatTimeAgo(isoString) {
        if (!isoString) return '';
        const diffSecs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
        if (diffSecs < 60) return 'Just now';
        const mins = Math.floor(diffSecs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return new Date(isoString).toLocaleDateString();
    },

    /**
     * Create New Group Modal with Avatar, Privacy, Disappearing Timer, and Initial Members
     */
    async showCreateGroupModal(root) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        // Load user's friends for initial member selection
        const friends = await chatService.getFriends();

        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 480px;">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Create Group</h3>
                    <button type="button" id="btn-close-grp-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    <form id="create-grp-form" style="display: flex; flex-direction: column; gap: 1rem;">
                        <!-- Group Avatar Picker -->
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                            <div style="position: relative; width: 72px; height: 72px; border-radius: var(--radius-full); background: var(--bg-surface-elevated); border: 2px dashed var(--border-color); display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden;" id="grp-avatar-preview-box">
                                <span id="grp-avatar-icon" style="font-size: 1.75rem;">👥</span>
                                <img id="grp-avatar-preview-img" style="display: none; width: 100%; height: 100%; object-fit: cover;" alt="Group avatar preview" />
                            </div>
                            <label for="grp-avatar-file" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.25rem 0.65rem; cursor: pointer;">
                                📷 Choose Group Icon
                            </label>
                            <input type="file" id="grp-avatar-file" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                            <div style="font-size: 0.7rem; color: var(--text-muted);">Optional (PNG, JPEG, WebP up to 4MB)</div>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="grp-name-input">Group Name *</label>
                            <input type="text" id="grp-name-input" class="form-input" placeholder="e.g. Project Andromeda" required maxlength="100" />
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="grp-desc-input">Description (Optional)</label>
                            <textarea id="grp-desc-input" class="form-input" placeholder="What is this group about?" rows="2" maxlength="300" style="resize: none;"></textarea>
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="grp-timer-select">Disappearing Messages</label>
                            <select id="grp-timer-select" class="form-input">
                                <option value="0">Off</option>
                                <option value="30">30 seconds</option>
                                <option value="60">1 minute</option>
                                <option value="180" selected>3 minutes (Default)</option>
                                <option value="600">10 minutes</option>
                                <option value="3600">1 hour</option>
                                <option value="86400">24 hours</option>
                            </select>
                        </div>

                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);">
                            <div>
                                <div style="font-size: 0.85rem; font-weight: 500;">Privacy Chat Mode</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">Restricts copying & text selection for group members</div>
                            </div>
                            <label class="switch" aria-label="Privacy mode toggle">
                                <input type="checkbox" id="grp-privacy-toggle" />
                                <span class="slider"></span>
                            </label>
                        </div>

                        <!-- Initial Members Selector -->
                        <div class="form-group">
                            <label class="form-label">Add Friends to Group (${friends.length} Available)</label>
                            <div id="grp-friends-selector-list" style="max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                                ${friends.length === 0 ? `
                                    <div style="font-size: 0.775rem; color: var(--text-muted); padding: 0.5rem; text-align: center;">
                                        No friends yet. You can add members after creating the group.
                                    </div>
                                ` : friends.map(f => `
                                    <label class="member-select-checkbox-item">
                                        <input type="checkbox" class="grp-friend-cb" value="${f.id}" />
                                        <div class="group-member-avatar" style="width: 28px; height: 28px; font-size: 0.75rem;">
                                            ${f.avatarUrl ? `<img src="${f.avatarUrl}" alt="${f.username}" />` : `<span>${f.username.charAt(0).toUpperCase()}</span>`}
                                        </div>
                                        <div style="font-size: 0.8rem; font-weight: 500;">
                                            ${this.escapeHtml(f.displayName || f.username)} <span style="color: var(--text-muted); font-size: 0.75rem;">@${this.escapeHtml(f.username)}</span>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>

                        <button type="submit" id="btn-submit-create-grp" class="btn-primary" style="margin-top: 0.5rem; min-height: 40px;">
                            Create Group
                        </button>
                    </form>
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-grp-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Group avatar file preview
        let avatarFileToUpload = null;
        const avatarFileInput = modal.querySelector('#grp-avatar-file');
        const previewBox = modal.querySelector('#grp-avatar-preview-box');
        const previewImg = modal.querySelector('#grp-avatar-preview-img');
        const previewIcon = modal.querySelector('#grp-avatar-icon');

        previewBox.addEventListener('click', () => avatarFileInput.click());
        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                avatarFileToUpload = file;
                const objectUrl = URL.createObjectURL(file);
                previewImg.src = objectUrl;
                previewImg.style.display = 'block';
                previewIcon.style.display = 'none';
            }
        });

        modal.querySelector('#create-grp-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = modal.querySelector('#btn-submit-create-grp');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Group...';

            const name = modal.querySelector('#grp-name-input').value.trim();
            const desc = modal.querySelector('#grp-desc-input').value.trim();
            const timer = parseInt(modal.querySelector('#grp-timer-select').value, 10);
            const isPrivacy = modal.querySelector('#grp-privacy-toggle').checked;

            const selectedMemberIds = Array.from(modal.querySelectorAll('.grp-friend-cb:checked')).map(cb => cb.value);

            const res = await chatService.createGroup({
                name,
                description: desc,
                disappearingTimer: timer,
                isPrivacyMode: isPrivacy,
                initialMemberIds: selectedMemberIds
            });

            if (res.success && res.conversationId) {
                // Upload avatar if chosen
                if (avatarFileToUpload) {
                    try {
                        submitBtn.textContent = 'Uploading group icon...';
                        await storageService.uploadGroupImage(res.conversationId, avatarFileToUpload, 'avatar');
                    } catch (uploadErr) {
                        console.warn('[AppView] Group avatar upload error:', uploadErr);
                    }
                }

                modal.style.display = 'none';
                await this.loadConversations(root);
                const target = this.state.conversations.find(c => c.id === res.conversationId);
                if (target) {
                    this.selectConversation(root, target);
                }
                this.showPrivacyToast(`Group "${name}" created successfully`);
            } else {
                alert('Failed to create group: ' + (res.error || 'Unknown error'));
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Group';
            }
        });
    },

    /**
     * Add Members Modal (Authorized Owner / Admins)
     */
    async showAddGroupMembersModal(root, groupData) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        // Fetch user's friends & existing group members
        const friends = await chatService.getFriends();
        const grpRes = await chatService.getGroupDetails(groupData.id);
        const existingMemberIds = new Set((grpRes.members || []).map(m => m.user_id));

        const eligibleFriends = friends.filter(f => !existingMemberIds.has(f.id));

        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 440px;">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Add Members to ${this.escapeHtml(groupData.name)}</h3>
                    <button type="button" id="btn-close-add-members-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    ${eligibleFriends.length === 0 ? `
                        <div class="empty-state-box" style="padding: 1.5rem 0;">
                            <div class="empty-state-icon">👥</div>
                            <h4 style="margin: 0.5rem 0 0.25rem;">No friends available to add</h4>
                            <p style="font-size: 0.8rem; color: var(--text-muted);">All of your friends are already in this group, or you have not added friends yet.</p>
                        </div>
                    ` : `
                        <p style="font-size: 0.825rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                            Select friends to add to this group conversation:
                        </p>
                        <form id="add-members-form" style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <div style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.35rem; padding: 0.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
                                ${eligibleFriends.map(f => `
                                    <label class="member-select-checkbox-item">
                                        <input type="checkbox" class="add-friend-cb" value="${f.id}" />
                                        <div class="group-member-avatar" style="width: 30px; height: 30px; font-size: 0.75rem;">
                                            ${f.avatarUrl ? `<img src="${f.avatarUrl}" alt="${f.username}" />` : `<span>${f.username.charAt(0).toUpperCase()}</span>`}
                                        </div>
                                        <div style="font-size: 0.8rem; font-weight: 500;">
                                            ${this.escapeHtml(f.displayName || f.username)} <span style="color: var(--text-muted); font-size: 0.75rem;">@${this.escapeHtml(f.username)}</span>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                            <button type="submit" id="btn-submit-add-members" class="btn-primary" style="margin-top: 0.5rem;">
                                Add Selected Members
                            </button>
                        </form>
                    `}
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-add-members-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        const form = modal.querySelector('#add-members-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const selected = Array.from(modal.querySelectorAll('.add-friend-cb:checked')).map(cb => cb.value);
                if (selected.length === 0) {
                    alert('Please select at least one friend to add.');
                    return;
                }

                const btn = modal.querySelector('#btn-submit-add-members');
                btn.disabled = true;
                btn.textContent = 'Adding...';

                const res = await chatService.addGroupMembers(groupData.id, selected);
                if (res.success) {
                    modal.style.display = 'none';
                    if (this.state.activeConversation) {
                        await this.updateInfoPanel(root, this.state.activeConversation);
                    }
                    this.showPrivacyToast(`Added ${selected.length} member(s) to group`);
                } else {
                    alert('Failed to add members: ' + res.error);
                    btn.disabled = false;
                    btn.textContent = 'Add Selected Members';
                }
            });
        }
    },

    /**
     * Edit Group Details Modal (Name, Description, Avatar, Disappearing Timer, Privacy)
     */
    showEditGroupModal(root, groupData) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 460px;">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Edit Group Details</h3>
                    <button type="button" id="btn-close-edit-grp-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    <form id="edit-grp-form" style="display: flex; flex-direction: column; gap: 1rem;">
                        <!-- Group Avatar -->
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                            <div style="position: relative; width: 72px; height: 72px; border-radius: var(--radius-full); background: var(--bg-surface-elevated); border: 2px dashed var(--border-color); display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden;" id="edit-grp-avatar-box">
                                ${groupData.avatar_url ? `
                                    <img id="edit-grp-preview-img" src="${groupData.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" alt="Group avatar" />
                                    <span id="edit-grp-preview-icon" style="display: none; font-size: 1.75rem;">👥</span>
                                ` : `
                                    <span id="edit-grp-preview-icon" style="font-size: 1.75rem;">👥</span>
                                    <img id="edit-grp-preview-img" style="display: none; width: 100%; height: 100%; object-fit: cover;" alt="Group avatar" />
                                `}
                            </div>
                            <label for="edit-grp-avatar-file" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.25rem 0.65rem; cursor: pointer;">
                                📷 Change Group Icon
                            </label>
                            <input type="file" id="edit-grp-avatar-file" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="edit-grp-name">Group Name *</label>
                            <input type="text" id="edit-grp-name" class="form-input" value="${this.escapeHtml(groupData.name || '')}" required maxlength="100" />
                        </div>

                        <div class="form-group">
                            <label class="form-label" for="edit-grp-desc">Description</label>
                            <textarea id="edit-grp-desc" class="form-input" rows="2" maxlength="300" style="resize: none;">${this.escapeHtml(groupData.description || '')}</textarea>
                        </div>

                        <button type="submit" id="btn-submit-edit-grp" class="btn-primary" style="margin-top: 0.5rem; min-height: 40px;">
                            Save Changes
                        </button>
                    </form>
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-edit-grp-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        let newAvatarFile = null;
        const avatarInput = modal.querySelector('#edit-grp-avatar-file');
        const previewImg = modal.querySelector('#edit-grp-preview-img');
        const previewIcon = modal.querySelector('#edit-grp-preview-icon');
        modal.querySelector('#edit-grp-avatar-box').addEventListener('click', () => avatarInput.click());

        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                newAvatarFile = file;
                previewImg.src = URL.createObjectURL(file);
                previewImg.style.display = 'block';
                if (previewIcon) previewIcon.style.display = 'none';
            }
        });

        modal.querySelector('#edit-grp-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = modal.querySelector('#btn-submit-edit-grp');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            const name = modal.querySelector('#edit-grp-name').value.trim();
            const desc = modal.querySelector('#edit-grp-desc').value.trim();

            const res = await chatService.updateGroupInfo(groupData.id, {
                name,
                description: desc
            });

            if (res.success) {
                if (newAvatarFile) {
                    btn.textContent = 'Uploading icon...';
                    await storageService.uploadGroupImage(groupData.id, newAvatarFile, 'avatar');
                }

                modal.style.display = 'none';
                if (this.state.activeConversation) {
                    this.state.activeConversation.title = name;
                    this.state.activeConversation.description = desc;
                    root.querySelector('#chat-header-name').textContent = name;
                    await this.updateInfoPanel(root, this.state.activeConversation);
                }
                await this.loadConversations(root);
                this.showPrivacyToast('Group details updated');
            } else {
                alert('Failed to update group: ' + res.error);
                btn.disabled = false;
                btn.textContent = 'Save Changes';
            }
        });
    },

    /**
     * Transfer Group Ownership Confirmation Modal
     */
    showTransferOwnershipModal(root, groupData, targetMember) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 440px;">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Transfer Ownership</h3>
                    <button type="button" id="btn-close-transfer-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body" style="text-align: left;">
                    <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1rem; font-size: 0.825rem; color: #f59e0b; line-height: 1.45;">
                        <strong>⚠️ Ownership Transfer Warning:</strong><br/>
                        Are you sure you want to transfer ownership of <strong>${this.escapeHtml(groupData.name)}</strong> to <strong>@${this.escapeHtml(targetMember.username)}</strong>?
                        You will be demoted to Administrator and will no longer have exclusive owner controls.
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button type="button" class="btn btn-secondary" id="btn-cancel-transfer">Cancel</button>
                        <button type="button" class="btn btn-primary" id="btn-confirm-transfer" style="background: #f59e0b; border-color: #f59e0b;">
                            Confirm Transfer
                        </button>
                    </div>
                </div>
            </div>
        `;

        const closeModal = () => { modal.style.display = 'none'; };
        modal.querySelector('#btn-close-transfer-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-transfer').addEventListener('click', closeModal);

        modal.querySelector('#btn-confirm-transfer').addEventListener('click', async () => {
            const res = await chatService.transferGroupOwnership(groupData.id, targetMember.user_id);
            if (res.success) {
                closeModal();
                if (this.state.activeConversation) {
                    await this.updateInfoPanel(root, this.state.activeConversation);
                }
                this.showPrivacyToast(`Ownership transferred to @${targetMember.username}`);
            } else {
                alert('Failed to transfer ownership: ' + res.error);
            }
        });
    },

    /**
     * Leave Group Modal (With Owner Transfer Safeguards)
     */
    showLeaveGroupModal(root, groupData, members, callerRole) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        const isOwner = callerRole === 'owner';
        const otherMembers = members.filter(m => m.user_id !== this.state.currentUser?.id);

        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 440px;">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Leave Group</h3>
                    <button type="button" id="btn-close-leave-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body" style="text-align: left;">
                    ${isOwner && otherMembers.length > 0 ? `
                        <p style="font-size: 0.85rem; color: var(--text-primary); margin-bottom: 0.75rem;">
                            As the group <strong>Owner</strong>, you must select another member to transfer ownership to before leaving:
                        </p>
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label class="form-label" for="leave-successor-select">Select New Group Owner *</label>
                            <select id="leave-successor-select" class="form-input">
                                ${otherMembers.map(m => `
                                    <option value="${m.user_id}">@${this.escapeHtml(m.username)} (${this.escapeHtml(m.display_name || m.username)}) - ${m.role}</option>
                                `).join('')}
                            </select>
                        </div>
                    ` : isOwner && otherMembers.length === 0 ? `
                        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1rem; font-size: 0.825rem; color: #f87171; line-height: 1.45;">
                            <strong>Notice:</strong> You are the only member in this group. Leaving will permanently delete the group and all its messages.
                        </div>
                    ` : `
                        <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
                            Are you sure you want to leave <strong>${this.escapeHtml(groupData.name)}</strong>? You will no longer receive messages from this group.
                        </p>
                    `}

                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button type="button" class="btn btn-secondary" id="btn-cancel-leave">Cancel</button>
                        <button type="button" class="btn btn-danger" id="btn-confirm-leave">
                            ${isOwner && otherMembers.length === 0 ? 'Delete & Leave' : 'Leave Group'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        const closeModal = () => { modal.style.display = 'none'; };
        modal.querySelector('#btn-close-leave-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-leave').addEventListener('click', closeModal);

        modal.querySelector('#btn-confirm-leave').addEventListener('click', async () => {
            let successorId = null;
            if (isOwner && otherMembers.length > 0) {
                const selectEl = modal.querySelector('#leave-successor-select');
                successorId = selectEl ? selectEl.value : null;
                if (!successorId) {
                    alert('Please choose a member to transfer ownership to.');
                    return;
                }
            }

            const res = await chatService.leaveGroup(groupData.id, successorId);
            if (res.success) {
                closeModal();
                this.state.activeConversation = null;
                root.classList.remove('in-chat');
                root.querySelector('#chat-header-actions').style.display = 'none';
                root.querySelector('#chat-input-container').style.display = 'none';
                root.querySelector('#messages-feed').innerHTML = `
                    <div class="empty-state-box">
                        <div class="empty-state-icon">💬</div>
                        <h3 class="empty-state-title">Select a conversation</h3>
                    </div>
                `;
                await this.loadConversations(root);
                this.showPrivacyToast('Left group successfully');
            } else {
                alert('Failed to leave group: ' + res.error);
            }
        });
    },

    /**
     * Delete Group Safe Modal (Restricted strictly to Owner)
     */
    showDeleteGroupModal(root, groupData) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 420px;">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title" style="color: var(--danger);">Delete Group</h3>
                    <button type="button" id="btn-close-del-grp-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body" style="text-align: left;">
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); padding: 0.85rem; margin-bottom: 1rem; font-size: 0.825rem; color: #f87171; line-height: 1.45;">
                        <strong>⚠️ Irreversible Owner Action:</strong><br/>
                        Permanently delete <strong>${this.escapeHtml(groupData.name)}</strong>? All messages, members, and settings will be permanently erased.
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button type="button" class="btn btn-secondary" id="btn-cancel-del-grp">Cancel</button>
                        <button type="button" class="btn btn-danger" id="btn-confirm-del-grp">
                            Permanently Delete
                        </button>
                    </div>
                </div>
            </div>
        `;

        const closeModal = () => { modal.style.display = 'none'; };
        modal.querySelector('#btn-close-del-grp-modal').addEventListener('click', closeModal);
        modal.querySelector('#btn-cancel-del-grp').addEventListener('click', closeModal);

        modal.querySelector('#btn-confirm-del-grp').addEventListener('click', async () => {
            const res = await chatService.deleteGroup(groupData.id);
            if (res.success) {
                closeModal();
                this.state.activeConversation = null;
                root.classList.remove('in-chat');
                root.querySelector('#chat-header-actions').style.display = 'none';
                root.querySelector('#chat-input-container').style.display = 'none';
                root.querySelector('#messages-feed').innerHTML = `
                    <div class="empty-state-box">
                        <div class="empty-state-icon">💬</div>
                        <h3 class="empty-state-title">Select a conversation</h3>
                    </div>
                `;
                await this.loadConversations(root);
                this.showPrivacyToast(`Group "${groupData.name}" deleted`);
            } else {
                alert('Failed to delete group: ' + res.error);
            }
        });
    },

    /**
     * Edit Profile Modal (Name, Bio, Avatar, Cover)
     */
    showEditProfileModal(root) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';
        const p = this.state.currentProfile || {};

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Edit Profile</h3>
                    <button type="button" id="btn-close-edit-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    <div id="modal-edit-alert" aria-live="polite"></div>

                    <!-- Quick Media Upload Actions -->
                    <div style="display: flex; gap: 0.75rem; margin-bottom: 1.25rem;">
                        <button type="button" id="btn-modal-upload-avatar" class="btn-secondary" style="flex: 1; font-size: 0.8rem; padding: 0.5rem;">
                            📷 Change Avatar
                        </button>
                        <input type="file" id="modal-avatar-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />

                        <button type="button" id="btn-modal-upload-cover" class="btn-secondary" style="flex: 1; font-size: 0.8rem; padding: 0.5rem;">
                            🖼️ Change Cover
                        </button>
                        <input type="file" id="modal-cover-file-input" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                    </div>

                    <form id="edit-profile-form" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label" for="edit-dispname-input">Display Name</label>
                            <input type="text" id="edit-dispname-input" class="form-input" value="${p.display_name || ''}" minlength="2" maxlength="100" required />
                            <span class="form-hint">Displayed to your contacts on ImdConnect.</span>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="edit-bio-input">About / Bio</label>
                            <textarea id="edit-bio-input" class="form-input" rows="3" maxlength="500" style="resize: none;">${p.bio || ''}</textarea>
                            <span class="form-hint">Max 500 characters.</span>
                        </div>
                        <button type="submit" id="btn-save-profile-modal" class="btn-primary">Save Changes</button>
                    </form>
                </div>
            </div>
        `;

        const alertBox = modal.querySelector('#modal-edit-alert');

        modal.querySelector('#btn-close-edit-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Avatar Upload from Modal
        const avatarBtn = modal.querySelector('#btn-modal-upload-avatar');
        const avatarInput = modal.querySelector('#modal-avatar-file-input');
        avatarBtn.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            alertBox.innerHTML = `<div class="alert-box alert-info">Uploading avatar...</div>`;
            const res = await profileService.updateAvatar(file);
            if (res.success) {
                this.state.currentProfile.avatar_url = res.url;
                alertBox.innerHTML = `<div class="alert-box alert-success">Avatar updated!</div>`;
                this.renderActiveTabContent(root);
            } else {
                alertBox.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            }
        });

        // Cover Upload from Modal
        const coverBtn = modal.querySelector('#btn-modal-upload-cover');
        const coverInput = modal.querySelector('#modal-cover-file-input');
        coverBtn.addEventListener('click', () => coverInput.click());
        coverInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            alertBox.innerHTML = `<div class="alert-box alert-info">Uploading cover...</div>`;
            const res = await profileService.updateCover(file);
            if (res.success) {
                this.state.currentProfile.banner_url = res.url;
                alertBox.innerHTML = `<div class="alert-box alert-success">Cover updated!</div>`;
                this.renderActiveTabContent(root);
            } else {
                alertBox.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
            }
        });

        modal.querySelector('#edit-profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            alertBox.innerHTML = '';
            const disp = modal.querySelector('#edit-dispname-input').value.trim();
            const bio = modal.querySelector('#edit-bio-input').value.trim();
            const submitBtn = modal.querySelector('#btn-save-profile-modal');

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Saving...';

            const res = await profileService.updateProfile({ displayName: disp, bio: bio });

            if (!res.success) {
                alertBox.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            } else {
                this.state.currentProfile.display_name = disp;
                this.state.currentProfile.bio = bio;
                alertBox.innerHTML = `<div class="alert-box alert-success">Profile updated successfully!</div>`;
                setTimeout(() => {
                    modal.style.display = 'none';
                    this.renderActiveTabContent(root);
                }, 800);
            }
        });
    },

    /**
     * Change Username Modal (Enforcing 7-Day Cooldown)
     */
    async showChangeUsernameModal(root) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Change Username</h3>
                    <button type="button" id="btn-close-uname-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    <div class="empty-state-box"><span class="spinner" style="border-top-color: var(--accent);"></span></div>
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-uname-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        const eligibility = await profileService.getUsernameEligibility();
        const p = this.state.currentProfile || {};
        const currentUsername = p.username || eligibility.currentUsername || 'user';

        const body = modal.querySelector('.modal-dialog-body');
        body.innerHTML = `
            <div id="modal-uname-alert" aria-live="polite"></div>

            <div style="padding: 0.75rem 1rem; border-radius: var(--radius-md); background: var(--bg-surface-elevated); border: 1px solid var(--border-color); margin-bottom: 1rem; font-size: 0.85rem;">
                <div><strong>Current Username:</strong> <span style="color: var(--accent); font-weight: 600;">@${currentUsername}</span></div>
                <div style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.25rem;">
                    Policy: You can change your username only once every 7 days.
                </div>
                ${!eligibility.canChange ? `
                    <div style="margin-top: 0.5rem; color: var(--color-warning); font-size: 0.8rem;">
                        ⏳ <strong>Next Available Change:</strong> ${eligibility.formattedNextDate} (${eligibility.daysRemaining} days remaining)
                    </div>
                ` : `
                    <div style="margin-top: 0.5rem; color: var(--color-success); font-size: 0.8rem;">
                        ✓ You are eligible to update your username today.
                    </div>
                `}
            </div>

            <form id="modal-uname-form" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="form-group">
                    <div class="form-row-meta">
                        <label for="modal-new-uname" class="form-label">New Username</label>
                        <span id="modal-uname-feedback" class="feedback-text feedback-neutral"></span>
                    </div>
                    <input 
                        type="text" 
                        id="modal-new-uname" 
                        class="form-input" 
                        placeholder="e.g. cyber_alex" 
                        spellcheck="false"
                        autocomplete="off"
                        ${!eligibility.canChange ? 'disabled' : ''} 
                        required 
                    />
                    <span class="form-hint">3-30 lowercase characters (letters, numbers, underscores).</span>
                </div>

                <button 
                    type="submit" 
                    id="btn-modal-submit-uname" 
                    class="btn-primary" 
                    ${!eligibility.canChange ? 'disabled' : ''}
                >
                    ${eligibility.canChange ? 'Update Username' : 'Cooldown Active (7 Days)'}
                </button>
            </form>
        `;

        if (eligibility.canChange) {
            const input = body.querySelector('#modal-new-uname');
            const feedback = body.querySelector('#modal-uname-feedback');
            const submitBtn = body.querySelector('#btn-modal-submit-uname');
            let debounce = null;

            input.addEventListener('input', () => {
                clearTimeout(debounce);
                const rawVal = input.value.trim().toLowerCase().replace(/^@/, '');
                input.value = rawVal;

                if (!rawVal) {
                    feedback.textContent = '';
                    input.classList.remove('is-valid', 'is-invalid');
                    submitBtn.disabled = true;
                    return;
                }

                if (!CONFIG.USERNAME_REGEX.test(rawVal)) {
                    feedback.textContent = '✗ 3-30 lowercase letters/nums/_';
                    feedback.className = 'feedback-text feedback-invalid';
                    input.classList.remove('is-valid');
                    input.classList.add('is-invalid');
                    submitBtn.disabled = true;
                    return;
                }

                feedback.textContent = 'Checking availability...';
                feedback.className = 'feedback-text feedback-neutral';

                debounce = setTimeout(async () => {
                    const check = await authService.checkUsernameAvailability(rawVal);
                    if (input.value !== rawVal) return;

                    if (check.available) {
                        feedback.textContent = '✓ Available';
                        feedback.className = 'feedback-text feedback-valid';
                        input.classList.remove('is-invalid');
                        input.classList.add('is-valid');
                        submitBtn.disabled = false;
                    } else {
                        feedback.textContent = `✗ ${check.error || 'Taken'}`;
                        feedback.className = 'feedback-text feedback-invalid';
                        input.classList.remove('is-valid');
                        input.classList.add('is-invalid');
                        submitBtn.disabled = true;
                    }
                }, 300);
            });

            body.querySelector('#modal-uname-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const alertArea = body.querySelector('#modal-uname-alert');
                alertArea.innerHTML = '';
                const newUname = input.value.trim().toLowerCase().replace(/^@/, '');
                if (!newUname) return;

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner"></span> Updating...';

                const res = await profileService.changeUsername(newUname);
                if (!res.success) {
                    alertArea.innerHTML = `<div class="alert-box alert-error">${res.error}</div>`;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Update Username';
                } else {
                    this.state.currentProfile.username = res.newUsername;
                    alertArea.innerHTML = `<div class="alert-box alert-success">Username successfully changed to @${res.newUsername}!</div>`;
                    setTimeout(() => {
                        modal.style.display = 'none';
                        this.renderActiveTabContent(root);
                    }, 1200);
                }
            });
        }
    },

    /**
     * Privacy Settings Modal
     */
    showPrivacyModal(root) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Privacy Settings</h3>
                    <button type="button" id="btn-close-priv-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body" style="display: flex; flex-direction: column; gap: 0.85rem;">
                    <div class="settings-row">
                        <div>
                            <div>Read Receipts</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Show double checks when messages read</div>
                        </div>
                        <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
                    </div>
                    <div class="settings-row">
                        <div>
                            <div>Online Presence</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Allow peers to see your active status</div>
                        </div>
                        <label class="switch"><input type="checkbox" checked><span class="slider"></span></label>
                    </div>
                    <div class="settings-row">
                        <div>
                            <div>Strict Text Only Mode</div>
                            <div style="font-size: 0.75rem; color: var(--color-success); font-weight: 500;">Enforced by Server (Permanent)</div>
                        </div>
                        <span style="color: var(--color-success);">✓</span>
                    </div>
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-priv-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    },

    /**
     * Format disappearing message duration
     */
    formatDisappearingDuration(seconds) {
        const sec = parseInt(seconds, 10);
        if (!sec || sec <= 0) return 'Off';
        if (sec === 30) return '30 seconds';
        if (sec === 60) return '1 minute';
        if (sec === 180) return '3 minutes';
        if (sec === 600) return '10 minutes';
        if (sec === 3600) return '1 hour';
        if (sec === 86400) return '24 hours';
        if (sec < 60) return `${sec} seconds`;
        if (sec < 3600) return `${Math.round(sec / 60)} minutes`;
        return `${Math.round(sec / 3600)} hours`;
    },

    /**
     * Disappearing Messages Timer Picker Modal
     */
    showDisappearingTimerModal(root) {
        if (!this.state.activeConversation) return;

        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        const currentTimer = this.state.activeConversation.disappearingTimer ?? 180;
        const options = [
            { label: 'Off', seconds: 0 },
            { label: '30 seconds', seconds: 30 },
            { label: '1 minute', seconds: 60 },
            { label: '3 minutes (Default)', seconds: 180 },
            { label: '10 minutes', seconds: 600 },
            { label: '1 hour', seconds: 3600 },
            { label: '24 hours', seconds: 86400 }
        ];

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Disappearing Messages</h3>
                    <button type="button" id="btn-close-timer-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
                        New messages sent in this chat will disappear for everyone after the chosen time once viewed.
                    </p>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;" id="timer-options-list">
                        ${options.map(opt => `
                            <button type="button" class="btn-secondary timer-opt-btn ${currentTimer === opt.seconds ? 'active' : ''}" data-seconds="${opt.seconds}" style="text-align: left; justify-content: space-between; font-size: 0.9rem;">
                                <span>${opt.label}</span>
                                ${currentTimer === opt.seconds ? '<span>✓</span>' : ''}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-timer-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.querySelectorAll('.timer-opt-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sec = parseInt(btn.dataset.seconds, 10);
                const res = await chatService.updateDisappearingTimer(this.state.activeConversation.id, sec);
                if (res.success) {
                    this.state.activeConversation.disappearingTimer = sec;
                    modal.style.display = 'none';
                    this.selectConversation(root, this.state.activeConversation);
                }
            });
        });
    },

    /**
     * Setup Realtime WSS listeners for live chat & social updates
     */
    setupRealtimeListeners(root) {
        this.unsubscribeRealtime = realtimeService.subscribeToMessages((newMsg) => {
            // If message is in active conversation, append it
            if (this.state.activeConversation && newMsg.conversation_id === this.state.activeConversation.id) {
                this.loadMessages(root, this.state.activeConversation.id);
            }
            // Update conversation list preview
            this.loadConversations(root);
        });

        // Realtime social relationship updates
        try {
            const user = this.state.currentUser;
            if (user && supabase && typeof supabase.channel === 'function') {
                this.socialChannel = supabase
                    .channel('social_realtime_updates')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => {
                        this.refreshSocialState(root);
                    })
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
                        this.refreshSocialState(root);
                    })
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_users' }, () => {
                        this.refreshSocialState(root);
                    })
                    .subscribe();
            }
        } catch (err) {
            console.warn('[AppView] Social realtime listener error:', err);
        }
    },

    filterSidebarItems(root, query) {
        const items = root.querySelectorAll('.chat-item, .friend-item-row');
        items.forEach(it => {
            const text = it.textContent.toLowerCase();
            it.style.display = text.includes(query) ? 'flex' : 'none';
        });
    },

    /**
     * Apply Privacy Chat Mode UI state & CSS classes
     */
    applyPrivacyChatMode(root, conv) {
        const chatPanel = root.querySelector('#chat-panel');
        const badge = root.querySelector('#header-privacy-badge');
        const toggle = root.querySelector('#toggle-privacy-mode');
        const isPrivacy = !!conv?.isPrivacyMode;

        if (chatPanel) {
            chatPanel.classList.toggle('privacy-chat-active', isPrivacy);
        }
        if (badge) {
            badge.style.display = isPrivacy ? 'inline-flex' : 'none';
        }
        if (toggle) {
            toggle.checked = isPrivacy;
        }
    },

    /**
     * Show Privacy Mode Information Modal with Honest Sandbox Transparency (Rule 20)
     */
    showPrivacyModeInfoModal(root) {
        const modalContainer = root.querySelector('#modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="privacy-info-modal-backdrop">
                <div class="modal-content" style="max-width: 480px; text-align: left;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
                        <h3 style="margin: 0; font-size: 1.2rem; display: flex; align-items: center; gap: 0.5rem;">
                            <span>🛡️</span> Privacy Chat Mode
                        </h3>
                        <button type="button" class="btn-icon" id="btn-close-privacy-info" aria-label="Close modal">✕</button>
                    </div>

                    <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.5;">
                        Privacy Chat Mode provides enhanced privacy controls and best-effort deterrents for confidential conversations:
                    </p>

                    <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.25rem;">
                        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                            <span style="font-size: 1.1rem;">🚫</span>
                            <div>
                                <strong style="font-size: 0.85rem; display: block; color: var(--text-primary);">Copy & Selection Restricted</strong>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Text copying, cutting, and dragging of message bubbles are disabled.</span>
                            </div>
                        </div>

                        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                            <span style="font-size: 1.1rem;">⚡</span>
                            <div>
                                <strong style="font-size: 0.85rem; display: block; color: var(--text-primary);">Best-Effort Screenshot Detection</strong>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Alerts peers when standard browser screenshot key combinations are pressed.</span>
                            </div>
                        </div>

                        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                            <span style="font-size: 1.1rem;">🔔</span>
                            <div>
                                <strong style="font-size: 0.85rem; display: block; color: var(--text-primary);">Real-time Privacy Alerts</strong>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">Both participants receive instant in-chat notifications when privacy actions occur.</span>
                            </div>
                        </div>
                    </div>

                    <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 1.25rem; font-size: 0.775rem; color: #f59e0b; line-height: 1.45;">
                        <strong>⚠️ Browser Sandbox Notice (Security Transparency):</strong><br/>
                        Operating system-level capture tools, hardware capture cards, and external cameras cannot be detected or blocked by web browsers. Never rely on client-side screenshot detection for absolute secrecy.
                    </div>

                    <div style="display: flex; justify-content: flex-end;">
                        <button type="button" class="btn btn-primary" id="btn-ack-privacy-info" style="min-width: 100px;">Got It</button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.style.display = 'flex';

        const closeModal = () => {
            modalContainer.style.display = 'none';
            modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#btn-close-privacy-info')?.addEventListener('click', closeModal);
        modalContainer.querySelector('#btn-ack-privacy-info')?.addEventListener('click', closeModal);
        modalContainer.querySelector('#privacy-info-modal-backdrop')?.addEventListener('click', (e) => {
            if (e.target.id === 'privacy-info-modal-backdrop') closeModal();
        });
    },

    /**
     * Display temporary floating privacy toast notice
     */
    showPrivacyToast(message) {
        const container = document.querySelector('#privacy-toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'privacy-toast';
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px) scale(0.96)';
            setTimeout(() => toast.remove(), 250);
        }, 3200);
    },

    /**
     * Append in-feed system security notice
     */
    appendSystemNotice(root, text, modifierClass = '') {
        const feed = root.querySelector('#messages-feed');
        if (!feed) return;

        const notice = document.createElement('div');
        notice.className = `privacy-system-notice ${modifierClass}`.trim();
        notice.textContent = text;

        const typingEl = feed.querySelector('#feed-typing-indicator');
        if (typingEl) {
            feed.insertBefore(notice, typingEl);
        } else {
            feed.appendChild(notice);
        }

        feed.scrollTop = feed.scrollHeight;
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    unmount() {
        if (this._hashHandler) {
            window.removeEventListener('hashchange', this._hashHandler);
        }
        if (this._keydownHandler) {
            window.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        if (this.activeConvUnsubscribe) {
            this.activeConvUnsubscribe();
            this.activeConvUnsubscribe = null;
        }
        if (this.disappearingTimerInterval) {
            clearInterval(this.disappearingTimerInterval);
            this.disappearingTimerInterval = null;
        }
        if (this.unsubscribeRealtime) {
            this.unsubscribeRealtime();
        }
        if (this.socialChannel && typeof this.socialChannel.unsubscribe === 'function') {
            this.socialChannel.unsubscribe();
        }
        realtimeService.cleanup();
    }
};
