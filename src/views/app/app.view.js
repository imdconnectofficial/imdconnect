// ==============================================================================
// ImdConnect — Master Application View
// Implements Desktop 3-Pane Layout and Mobile Multi-View Navigation
// Closely Matches the Official ImdConnect Visual Reference
// ==============================================================================
import { authService } from '../../services/auth.service.js';
import { chatService } from '../../services/chat.service.js';
import { realtimeService } from '../../services/realtime.service.js';
import { storageService } from '../../services/storage.service.js';
import { profileService } from '../../services/profile.service.js';
import { CONFIG } from '../../config.js';
import { supabase } from '../../core/supabase.js';
import { router } from '../../core/router.js';

export const AppView = {
    state: {
        activeTab: 'chats', // 'chats' | 'friends' | 'groups' | 'notifications' | 'profile' | 'settings'
        activeConversation: null,
        conversations: [],
        messages: [],
        friends: [],
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

                <!-- Chat Settings & Privacy Mode -->
                <div class="info-section">
                    <div class="info-list-row" id="row-chat-settings">
                        <span>Chat Settings</span>
                        <span style="color: var(--text-muted);">›</span>
                    </div>

                    <div class="info-list-row">
                        <div>
                            <div>Privacy Mode</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Hide presence in this chat</div>
                        </div>
                        <label class="switch" aria-label="Privacy mode toggle">
                            <input type="checkbox" id="toggle-privacy-mode" checked />
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

            <!-- Modal Container -->
            <div id="modal-container" style="display: none;"></div>
        `;

        this.bindEvents(container);
        this.loadConversations(container);
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
        const sendBtn = root.querySelector('#btn-send-message');
        const textInput = root.querySelector('#message-text-input');

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
                this.loadMessages(root, this.state.activeConversation.id);
            }
        };

        sendBtn.addEventListener('click', handleSend);
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            } else if (this.state.activeConversation) {
                // Broadcast ephemeral typing indicator
                realtimeService.broadcastTyping(
                    this.state.activeConversation.id, 
                    this.state.currentProfile?.username || 'user'
                );
            }
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

        // Search Input Filter
        const searchInput = root.querySelector('#sidebar-search-input');
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim().toLowerCase();
            this.filterSidebarItems(root, query);
        });

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

        listContainer.innerHTML = '';
        this.state.conversations.forEach((conv) => {
            const item = document.createElement('div');
            item.className = 'chat-item';
            if (this.state.activeConversation?.id === conv.id) item.classList.add('active');

            const isTyping = this.state.typingMap.get(conv.id);

            item.innerHTML = `
                <div class="avatar-wrapper">
                    ${conv.avatarUrl ? `<img src="${conv.avatarUrl}" alt="${conv.title}" />` : `<span>${conv.title.charAt(0).toUpperCase()}</span>`}
                    ${conv.isOnline ? `<div class="online-indicator"></div>` : ''}
                </div>
                <div class="chat-item-content">
                    <div class="chat-item-top">
                        <span class="chat-item-name">${conv.title}</span>
                        <span class="chat-item-time">${conv.lastMessageTime}</span>
                    </div>
                    <div class="chat-item-bottom">
                        <span class="chat-item-lastmsg ${isTyping ? 'typing-text' : ''}">
                            ${isTyping ? 'Typing...' : conv.lastMessage}
                        </span>
                    </div>
                </div>
            `;

            item.addEventListener('click', () => {
                this.selectConversation(root, conv);
            });

            listContainer.appendChild(item);
        });
    },

    /**
     * Select active conversation and load messages
     */
    async selectConversation(root, conv) {
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
        if (conv.isOnline) {
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
            const mins = Math.round(conv.disappearingTimer / 60);
            root.querySelector('#ephemeral-banner-text').textContent = 
                `Message will disappear after being read (${mins > 0 ? mins + ' minutes' : conv.disappearingTimer + ' seconds'})`;
        } else {
            banner.style.display = 'none';
        }

        // Update Right Info Panel
        this.updateInfoPanel(root, conv);

        // Load Messages
        await this.loadMessages(root, conv.id);
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

            row.innerHTML = `
                <div class="message-bubble">
                    ${this.escapeHtml(m.text)}
                </div>
                <div class="message-meta">
                    <span>${m.timeFormatted}</span>
                    ${m.isOutgoing ? `<span class="read-ticks">✓✓</span>` : ''}
                </div>
            `;

            feed.appendChild(row);
        });

        // Scroll to bottom
        feed.scrollTop = feed.scrollHeight;
    },

    /**
     * Update Right Info Panel
     */
    async updateInfoPanel(root, conv) {
        root.querySelector('#info-name-text').textContent = conv.title;
        root.querySelector('#info-handle-text').textContent = conv.peerUsername ? `@${conv.peerUsername}` : '@group';
        root.querySelector('#info-stat-handle').textContent = conv.peerUsername ? `@${conv.peerUsername}` : 'Group';

        const timerLabel = root.querySelector('#current-disappearing-label');
        if (conv.disappearingTimer > 0) {
            const mins = Math.round(conv.disappearingTimer / 60);
            timerLabel.textContent = mins > 0 ? `${mins} minutes` : `${conv.disappearingTimer}s`;
        } else {
            timerLabel.textContent = 'Off';
        }

        const avatarBox = root.querySelector('#info-avatar-box');
        if (conv.avatarUrl) {
            avatarBox.innerHTML = `<img src="${conv.avatarUrl}" alt="${conv.title}" />`;
        } else {
            avatarBox.innerHTML = `<span>${conv.title.charAt(0).toUpperCase()}</span>`;
        }

        // Fetch peer profile details respecting privacy settings
        if (conv.peerUsername) {
            const peerRes = await profileService.getProfile({ username: conv.peerUsername });
            if (peerRes.success && peerRes.profile) {
                const peer = peerRes.profile;
                const coverBox = root.querySelector('#info-cover-box img');
                if (coverBox && peer.banner_url) {
                    coverBox.src = peer.banner_url;
                }

                const aboutText = root.querySelector('#info-about-text');
                const friendsCountEl = root.querySelector('#info-stat-friends');
                const joinedDateEl = root.querySelector('#info-stat-joined');

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
            title.textContent = 'Friends';
            list.innerHTML = `<div class="empty-state-box"><span class="spinner" style="border-top-color: var(--accent);"></span></div>`;
            const friends = await chatService.getFriends();
            if (friends.length === 0) {
                list.innerHTML = `
                    <div class="empty-state-box">
                        <div class="empty-state-icon">👥</div>
                        <h3 class="empty-state-title">No friends added yet</h3>
                        <p class="empty-state-desc">Search for users by username to send friend requests.</p>
                        <button type="button" id="btn-find-friends-action" class="btn-primary" style="font-size: 0.85rem; max-width: 180px;">Find Users</button>
                    </div>
                `;
                list.querySelector('#btn-find-friends-action')?.addEventListener('click', () => {
                    this.showNewChatModal(root);
                });
            } else {
                list.innerHTML = '';
                friends.forEach(f => {
                    const item = document.createElement('div');
                    item.className = 'chat-item';
                    item.innerHTML = `
                        <div class="avatar-wrapper">
                            ${f.avatarUrl ? `<img src="${f.avatarUrl}" alt="${f.displayName}" />` : `<span>${f.displayName.charAt(0).toUpperCase()}</span>`}
                            ${f.isOnline ? `<div class="online-indicator"></div>` : ''}
                        </div>
                        <div class="chat-item-content">
                            <div class="chat-item-name">${f.displayName}</div>
                            <div class="chat-item-lastmsg">@${f.username}</div>
                        </div>
                        <button type="button" class="btn-primary btn-chat-now" style="min-height: 32px; padding: 0.25rem 0.75rem; font-size: 0.75rem;">Message</button>
                    `;
                    item.querySelector('.btn-chat-now').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const res = await chatService.createDirectConversation(f.id);
                        if (res.success) {
                            await this.loadConversations(root);
                            const target = this.state.conversations.find(c => c.id === res.conversationId);
                            if (target) this.selectConversation(root, target);
                        }
                    });
                    list.appendChild(item);
                });
            }
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
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label class="form-label">Find User by Username</label>
                        <input type="text" id="modal-search-user" class="form-input" placeholder="Search @username..." autofocus />
                    </div>
                    <div id="modal-user-results" style="max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
                        <div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1.5rem 0;">
                            Type at least 2 characters to search
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
                if (query.length < 2) return;
                results.innerHTML = `<span class="spinner" style="border-top-color: var(--accent); margin: 1rem auto;"></span>`;
                const users = await chatService.searchUsers(query);
                if (users.length === 0) {
                    results.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1rem 0;">No users found</div>`;
                    return;
                }
                results.innerHTML = '';
                users.forEach(u => {
                    const row = document.createElement('div');
                    row.className = 'chat-item';
                    row.innerHTML = `
                        <div class="avatar-wrapper">
                            ${u.avatar_url ? `<img src="${u.avatar_url}" alt="${u.display_name}" />` : `<span>${u.display_name.charAt(0).toUpperCase()}</span>`}
                        </div>
                        <div class="chat-item-content">
                            <div class="chat-item-name">${u.display_name}</div>
                            <div class="chat-item-lastmsg">@${u.username}</div>
                        </div>
                    `;
                    row.addEventListener('click', async () => {
                        modal.style.display = 'none';
                        const res = await chatService.createDirectConversation(u.id);
                        if (res.success) {
                            await this.loadConversations(root);
                            const target = this.state.conversations.find(c => c.id === res.conversationId);
                            if (target) this.selectConversation(root, target);
                        }
                    });
                    results.appendChild(row);
                });
            }, 300);
        });
    },

    /**
     * Create New Group Modal
     */
    showCreateGroupModal(root) {
        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 class="modal-dialog-title">Create Group</h3>
                    <button type="button" id="btn-close-grp-modal" class="btn-icon" aria-label="Close modal">✕</button>
                </div>
                <div class="modal-dialog-body">
                    <form id="create-grp-form" style="display: flex; flex-direction: column; gap: 1rem;">
                        <div class="form-group">
                            <label class="form-label">Group Name</label>
                            <input type="text" id="grp-name-input" class="form-input" placeholder="e.g. Study Group" required />
                        </div>
                        <div class="form-group">
                            <label class="form-label">Description (Optional)</label>
                            <input type="text" id="grp-desc-input" class="form-input" placeholder="What is this group about?" />
                        </div>
                        <button type="submit" class="btn-primary" style="margin-top: 0.5rem;">Create Group</button>
                    </form>
                </div>
            </div>
        `;

        modal.querySelector('#btn-close-grp-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.querySelector('#create-grp-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = modal.querySelector('#grp-name-input').value;
            const desc = modal.querySelector('#grp-desc-input').value;
            const res = await chatService.createGroup({ name, description: desc });
            if (res.success) {
                modal.style.display = 'none';
                await this.loadConversations(root);
                const target = this.state.conversations.find(c => c.id === res.conversationId);
                if (target) this.selectConversation(root, target);
            } else {
                alert('Failed to create group: ' + res.error);
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
     * Disappearing Messages Timer Picker Modal
     */
    showDisappearingTimerModal(root) {
        if (!this.state.activeConversation) return;

        const modal = root.querySelector('#modal-container');
        modal.style.display = 'flex';
        modal.className = 'modal-overlay';

        const currentTimer = this.state.activeConversation.disappearingTimer || 0;
        const options = [
            { label: 'Off', seconds: 0 },
            { label: '30 seconds', seconds: 30 },
            { label: '5 minutes', seconds: 300 },
            { label: '1 hour', seconds: 3600 },
            { label: '24 hours', seconds: 86400 },
            { label: '7 days', seconds: 604800 }
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
     * Setup Realtime WSS listeners for live chat
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
    },

    filterSidebarItems(root, query) {
        const items = root.querySelectorAll('.chat-item');
        items.forEach(it => {
            const text = it.textContent.toLowerCase();
            it.style.display = text.includes(query) ? 'flex' : 'none';
        });
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
        if (this.unsubscribeRealtime) {
            this.unsubscribeRealtime();
        }
        realtimeService.cleanup();
    }
};
