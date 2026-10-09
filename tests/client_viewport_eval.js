// ==============================================================================
// ImdConnect — Client-side In-Browser Testing Script for 9 Viewports
// ==============================================================================

export async function initTestApp() {
    window.__TEST_MODE__ = true;
    const { AppView } = await import('/src/views/app/app.view.js');
    window.testAppView = AppView;
    const root = document.getElementById('app');
    root.innerHTML = '';

    // Mock profile
    AppView.state.currentUser = { id: 'test-user-id', email: 'tester@imdconnect.local' };
    AppView.state.currentProfile = {
        id: 'test-user-id',
        username: 'testuser',
        display_name: 'Test User',
        bio: 'Testing ImdConnect UI across viewports.',
        avatar_url: null,
        role: 'user',
        friends_count: 12,
        groups_count: 4,
        joinedDateFormatted: 'Jan 2026'
    };
    AppView.state.stats = { friendsCount: 12, groupsCount: 4, joinedDate: 'Jan 2026' };

    // Prevent background network calls during headless test
    AppView.loadConversations = async (r) => {
        AppView.renderConversationsList(r);
    };
    AppView.refreshSocialState = async () => {};
    AppView.refreshNotifications = async () => {};
    AppView.setupRealtimeListeners = () => {};

    // Mock conversations
    AppView.state.conversations = [
        {
            id: 'conv-1',
            title: 'Alice Cooper',
            name: 'Alice Cooper',
            peerUsername: 'alice',
            username: 'alice',
            type: 'direct',
            lastMessage: 'Hey! Did you check out the new design?',
            lastMessageTime: '10:30 AM',
            unreadCount: 3,
            hasUnread: true,
            isOnline: true,
            updatedAtFormatted: '10:30 AM',
            isPrivacyMode: false,
            is_privacy_mode: false,
            disappearingTimer: 180,
            disappearing_timer: 180
        },
        {
            id: 'conv-2',
            title: 'Product Design Crew',
            name: 'Product Design Crew',
            peerUsername: null,
            username: 'design_team',
            type: 'group',
            lastMessage: 'Mobile first layouts looking super sharp!',
            lastMessageTime: 'Yesterday',
            unreadCount: 0,
            hasUnread: false,
            isOnline: false,
            updatedAtFormatted: 'Yesterday',
            isPrivacyMode: false,
            is_privacy_mode: false,
            disappearingTimer: 0,
            disappearing_timer: 0
        }
    ];

    // Mock messages
    AppView.state.messages = [
        {
            id: 'msg-1',
            conversation_id: 'conv-1',
            sender_id: 'alice-id',
            senderUsername: 'alice',
            text: 'Hey! Did you check out the new design?',
            sent_at: new Date(Date.now() - 60000).toISOString(),
            sentAtFormatted: '10:29 AM',
            isOutgoing: false
        },
        {
            id: 'msg-2',
            conversation_id: 'conv-1',
            sender_id: 'test-user-id',
            senderUsername: 'testuser',
            text: 'Yes! It passes all production security and responsive constraints.',
            sent_at: new Date().toISOString(),
            sentAtFormatted: '10:30 AM',
            read_at: new Date().toISOString(),
            isOutgoing: true
        }
    ];

    // Mock notifications
    AppView.state.notifications = [
        {
            id: 'notif-1',
            type: 'NEW_FRIEND_REQUEST',
            title: 'New Friend Request',
            body: '@bob wants to connect with you.',
            is_read: false,
            created_at: new Date().toISOString(),
            timeAgo: '5m ago'
        },
        {
            id: 'notif-2',
            type: 'SECURITY_ALERT',
            title: 'New Session Login',
            body: 'Your account was accessed from a new device.',
            is_read: true,
            created_at: new Date(Date.now() - 3600000).toISOString(),
            timeAgo: '1h ago'
        }
    ];
    AppView.state.unreadNotificationsCount = 1;

    const shell = await AppView.render();
    root.appendChild(shell);
    AppView.renderConversationsList(shell);

    return { mounted: true };
}

export function testChatsView() {
    const root = document.getElementById('app-main-shell') || document.getElementById('app');
    window.testAppView.switchTab(root, 'chats', false);

    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const bottomNav = document.querySelector('.bottom-nav');
    const bottomNavStyle = bottomNav ? window.getComputedStyle(bottomNav) : null;
    const isMobile = winWidth <= 900;

    const overflowing = [];
    document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > winWidth + 1.5) {
            overflowing.push({ tag: el.tagName, class: el.className, right: Math.round(r.right), width: Math.round(r.width) });
        }
    });

    return {
        docWidth,
        winWidth,
        hasHScroll: docWidth > winWidth,
        overflowing: overflowing.slice(0, 3),
        bottomNavDisplay: bottomNavStyle?.display || 'none',
        bottomNavHeight: bottomNav ? Math.round(bottomNav.getBoundingClientRect().height) : 0,
        isMobile
    };
}

export function testInChatView() {
    const root = document.getElementById('app-main-shell') || document.getElementById('app');
    const appContainer = document.querySelector('.app-container');
    if (window.innerWidth <= 900 && appContainer) {
        appContainer.classList.add('in-chat');
    }

    const conv = window.testAppView.state.conversations[0];
    window.testAppView.state.activeConversation = conv;
    const chatPanel = document.querySelector('.chat-panel');
    if (chatPanel) {
        chatPanel.style.display = 'flex';
    }

    const composer = document.querySelector('.chat-input-container');
    if (composer) {
        composer.style.display = 'flex';
    }

    const headerActions = document.querySelector('#chat-header-actions');
    if (headerActions) {
        headerActions.style.display = 'flex';
    }

    // Populate feed with test messages
    const feed = document.querySelector('#messages-feed');
    if (feed) {
        feed.innerHTML = '';
        window.testAppView.state.messages.forEach(m => {
            window.testAppView.appendMessageToFeed(root, m);
        });
    }

    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;

    const composerRect = composer ? composer.getBoundingClientRect() : null;
    const composerStyle = composer ? window.getComputedStyle(composer) : null;

    const sendBtn = document.querySelector('.chat-send-btn') || document.querySelector('#btn-send-message');
    const sendBtnRect = sendBtn ? sendBtn.getBoundingClientRect() : null;

    const feedEl = document.querySelector('.messages-feed');
    const feedStyle = feedEl ? window.getComputedStyle(feedEl) : null;

    return {
        docWidth,
        winWidth,
        hasHScroll: docWidth > winWidth,
        composerVisible: composerRect !== null && composerRect.height > 0,
        composerHeight: composerRect ? Math.round(composerRect.height) : 0,
        composerPaddingBottom: composerStyle?.paddingBottom || '',
        sendBtnWidth: sendBtnRect ? Math.round(sendBtnRect.width) : 0,
        sendBtnHeight: sendBtnRect ? Math.round(sendBtnRect.height) : 0,
        sendBtnMeets44px: sendBtnRect ? (sendBtnRect.width >= 40 && sendBtnRect.height >= 40) : false,
        feedScrollable: feedStyle?.overflowY === 'auto'
    };
}

export function resetInChat() {
    const appContainer = document.querySelector('.app-container');
    if (appContainer) appContainer.classList.remove('in-chat');
    const composer = document.querySelector('.chat-input-container');
    if (composer) composer.style.display = 'none';
    const chatPanel = document.querySelector('.chat-panel');
    if (chatPanel && window.innerWidth <= 900) chatPanel.style.display = 'none';
}

export function testTabView(tabName) {
    const root = document.getElementById('app-main-shell') || document.getElementById('app');
    window.testAppView.switchTab(root, tabName, false);
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    return {
        tab: tabName,
        docWidth,
        winWidth,
        hasHScroll: docWidth > winWidth
    };
}

export function testModal() {
    const root = document.getElementById('app-main-shell') || document.getElementById('app');
    window.testAppView.showDisappearingTimerModal(root);
    const modal = document.querySelector('.modal-dialog');
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const modalRect = modal ? modal.getBoundingClientRect() : null;

    const fitsInViewport = modalRect ? (modalRect.width <= winWidth && modalRect.height <= winHeight) : false;

    return {
        modalOpen: modal !== null,
        modalWidth: modalRect ? Math.round(modalRect.width) : 0,
        modalHeight: modalRect ? Math.round(modalRect.height) : 0,
        fitsInViewport,
        hasHScroll: docWidth > winWidth
    };
}

export function closeModal() {
    const overlay = document.querySelector('.modal-overlay') || document.querySelector('#modal-container');
    if (overlay) overlay.style.display = 'none';
}

export function testTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    const root = document.getElementById('app-main-shell') || document.getElementById('app');
    window.testAppView.switchTab(root, 'chats', false);
    const shell = document.querySelector('.app-container') || document.body;
    const bg = window.getComputedStyle(shell).backgroundColor;
    const text = window.getComputedStyle(shell).color;
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    return {
        theme: themeName,
        bg,
        text,
        hasHScroll: docWidth > winWidth
    };
}

window.__VIEWPORT_TESTS__ = {
    initTestApp,
    testChatsView,
    testInChatView,
    resetInChat,
    testTabView,
    testModal,
    closeModal,
    testTheme
};
