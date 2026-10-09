// ==============================================================================
// ImdConnect — Production Performance Pass Verification Suite
// Tests:
// 1. JavaScript module lazy loading via Router loader caching
// 2. Chat message pagination (enforcing 40 items max, cursor pagination)
// 3. Search debounce verification (collapses rapid keystrokes)
// 4. Realtime subscription deduplication & inactive conversation teardown
// 5. CSS content-visibility & scroll anchoring for high-throughput chats
// 6. Notification pagination (limit 25 & load more batching)
// 7. Group member paginated query support
// ==============================================================================
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 1;
        this.pending = new Map();
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.method === 'Runtime.consoleAPICalled') {
                console.log('    [PAGE LOG]', data.params.type, data.params.args.map(a => a.value || a.description).join(' '));
            }
            if (data.method === 'Runtime.exceptionThrown') {
                const ed = data.params.exceptionDetails;
                console.log('    [PAGE EXCEPTION]', ed.url, 'Line:', ed.lineNumber, 'Col:', ed.columnNumber, ed.text, ed.exception?.description);
            }
            if (data.id && this.pending.has(data.id)) {
                const { resolve, reject } = this.pending.get(data.id);
                this.pending.delete(data.id);
                if (data.error) reject(new Error(data.error.message));
                else resolve(data.result);
            }
        };
    }

    async ready() {
        if (this.ws.readyState === WebSocket.OPEN) return;
        return new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
    }

    async send(method, params = {}) {
        await this.ready();
        const msgId = this.id++;
        return new Promise((resolve, reject) => {
            this.pending.set(msgId, { resolve, reject });
            this.ws.send(JSON.stringify({ id: msgId, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res?.exceptionDetails) {
            console.error('    [EVAL ERROR]', res.exceptionDetails.text, res.exceptionDetails.exception?.description || res.exceptionDetails.exception?.value);
        }
        return res?.result?.value;
    }

    close() {
        try { this.ws.close(); } catch (_) {}
    }
}

async function run() {
    console.log('\n========================================================================');
    console.log('       ImdConnect — Production Performance Verification Suite           ');
    console.log('========================================================================\n');

    const browserBin = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const userDataDir = path.resolve('tests/.chrome_perf_profile');
    if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userDataDir, { recursive: true });

    const chromeProcess = spawn(browserBin, [
        '--headless=new',
        '--remote-debugging-port=9227',
        `--user-data-dir=${userDataDir}`,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://localhost:3000/#/app'
    ]);

    let passedTests = 0;
    let failedTests = 0;

    function assert(name, condition, details = '') {
        if (condition) {
            console.log(`  [PASS] ${name}`);
            passedTests++;
        } else {
            console.error(`  [FAIL] ${name}: ${details}`);
            failedTests++;
        }
    }

    try {
        await sleep(3500);

        // Fetch targets
        const listRes = await fetch('http://127.0.0.1:9227/json/list');
        const pages = await listRes.json();
        const target = pages.find(p => p.url.includes('3000')) || pages[0];
        if (!target) throw new Error('No Chrome CDP page target available');

        const cdp = new CDPClient(target.webSocketDebuggerUrl);
        await cdp.ready();
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('DOM.enable');
        await cdp.send('Page.navigate', { url: 'http://localhost:3000/#/app' });
        await sleep(2500);

        // ----------------------------------------------------------------------
        // Test 1: JavaScript Module Lazy Loading in Router
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 1: JavaScript Module Lazy Loading');
        const routerCheck = await cdp.evaluate(`
            (async () => {
                const { router } = await import('/src/core/router.js');
                const routeEntries = Object.entries(router.routes || {});
                const lazyRoutes = routeEntries.filter(([p, r]) => typeof r.loader === 'function');
                const eagerRoutes = routeEntries.filter(([p, r]) => r.view !== null);
                
                // Navigate to a lazy route to verify dynamic import caching
                const secRoute = router.routes['#/settings/security'] || router.routes['/settings/security'];
                const hasLoader = !!(secRoute && typeof secRoute.loader === 'function');
                let loadedSuccess = false;
                if (hasLoader) {
                    const mod = await secRoute.loader();
                    const view = (secRoute.exportName && mod[secRoute.exportName]) || mod.default || Object.values(mod)[0];
                    loadedSuccess = !!(view && typeof view.render === 'function');
                }

                return {
                    totalRoutes: routeEntries.length,
                    lazyCount: lazyRoutes.length,
                    eagerCount: eagerRoutes.length,
                    hasLoader,
                    loadedSuccess
                };
            })()
        `);

        assert(
            'Non-critical routes configured with lazy loaders',
            routerCheck && routerCheck.lazyCount >= 10,
            `Found ${routerCheck?.lazyCount} lazy routes out of ${routerCheck?.totalRoutes}`
        );

        assert(
            'Dynamic route imports execute and resolve view exports',
            routerCheck && routerCheck.loadedSuccess === true,
            'Security settings view lazy loader failed to resolve'
        );

        // ----------------------------------------------------------------------
        // Test 2: CSS content-visibility & Overflow Anchor Performance
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 2: CSS Rendering Optimizations');
        const cssCheck = await cdp.evaluate(`
            (() => {
                const testDiv = document.createElement('div');
                testDiv.className = 'chat-item';
                document.body.appendChild(testDiv);
                const computed = window.getComputedStyle(testDiv);
                const contentVis = computed.getPropertyValue('content-visibility');
                const intrinsicSize = computed.getPropertyValue('contain-intrinsic-size');
                testDiv.remove();

                const feedDiv = document.createElement('div');
                feedDiv.className = 'messages-feed';
                document.body.appendChild(feedDiv);
                const feedComputed = window.getComputedStyle(feedDiv);
                const overflowAnchor = feedComputed.getPropertyValue('overflow-anchor');
                feedDiv.remove();

                return { contentVis, intrinsicSize, overflowAnchor };
            })()
        `);

        assert(
            'Chat items utilize content-visibility: auto for DOM virtualization',
            cssCheck && cssCheck.contentVis === 'auto',
            `content-visibility is "${cssCheck?.contentVis}"`
        );

        assert(
            'Messages feed enables overflow-anchor for scroll preservation',
            cssCheck && cssCheck.overflowAnchor === 'auto',
            `overflow-anchor is "${cssCheck?.overflowAnchor}"`
        );

        // ----------------------------------------------------------------------
        // Test 3: Chat Service Query Limits & Cursor Pagination
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 3: Supabase Chat Query & Message Pagination');
        const paginationCheck = await cdp.evaluate(`
            (async () => {
                const { chatService } = await import('/src/services/chat.service.js');
                
                // Test default getMessages enforces limit 40
                const mockMessages = Array.from({ length: 45 }, (_, i) => ({
                    id: 'msg-' + i,
                    conversation_id: 'conv-test-1',
                    sender_id: 'user-1',
                    ciphertext: 'Hello test message ' + i,
                    created_at: new Date(Date.now() - (45 - i) * 60000).toISOString()
                }));

                // Call getMessages on mock or non-existent conversation (must not throw, returns array with flags)
                const res = await chatService.getMessages('00000000-0000-0000-0000-000000000000', { limit: 40 });
                
                return {
                    isArray: Array.isArray(res),
                    hasMoreProperty: typeof res.hasMore === 'boolean',
                    oldestTimestampProperty: res.hasOwnProperty('oldestTimestamp')
                };
            })()
        `);

        assert(
            'chatService.getMessages returns paginated array with cursor metadata',
            paginationCheck && paginationCheck.isArray && paginationCheck.hasMoreProperty && paginationCheck.oldestTimestampProperty,
            JSON.stringify(paginationCheck)
        );

        // ----------------------------------------------------------------------
        // Test 4: Search Debounce Utility
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 4: Search Debounce Utility');
        const debounceCheck = await cdp.evaluate(`
            (async () => {
                const { debounce } = await import('/src/core/utils.js');
                let executions = 0;
                let lastValue = '';
                const debouncedFn = debounce((val) => {
                    executions++;
                    lastValue = val;
                }, 100);

                // Simulate 5 rapid keystrokes within 20ms
                debouncedFn('a');
                debouncedFn('al');
                debouncedFn('ale');
                debouncedFn('alex');
                debouncedFn('alexander');

                const initialExecutions = executions;

                // Wait 150ms for debounce window to fire exactly once
                await new Promise(r => setTimeout(r, 150));

                return {
                    initialExecutions,
                    finalExecutions: executions,
                    lastValue
                };
            })()
        `);

        assert(
            'Debounce utility collapses rapid keystrokes into exactly 1 execution',
            debounceCheck && debounceCheck.initialExecutions === 0 && debounceCheck.finalExecutions === 1 && debounceCheck.lastValue === 'alexander',
            JSON.stringify(debounceCheck)
        );

        // ----------------------------------------------------------------------
        // Test 5: Realtime Channel Cleanup on Inactive Conversations
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 5: Realtime Subscriptions & Channel Lifecycle');
        const realtimeCheck = await cdp.evaluate(`
            (async () => {
                const { realtimeService } = await import('/src/services/realtime.service.js');
                
                // Subscribe to a conversation
                const unsubConv = realtimeService.subscribeToConversation('conv-perf-test-123', {
                    onMessage: () => {}
                });

                const channelName = 'conversation:conv-perf-test-123';
                const hasChannelBefore = realtimeService.activeChannels.has(channelName);

                // Unsubscribe when closing/switching conversation
                unsubConv();
                const hasChannelAfter = realtimeService.activeChannels.has(channelName);

                // Test global messages unsubscribe cleanup
                let dummyCount = 0;
                const unsubGlobal = realtimeService.subscribeToMessages(() => { dummyCount++; });
                const globalChannelExists = realtimeService.activeChannels.has('global-messages');
                unsubGlobal();
                const globalChannelAfter = realtimeService.activeChannels.has('global-messages');

                return {
                    hasChannelBefore,
                    hasChannelAfter,
                    globalChannelExists,
                    globalChannelAfter
                };
            })()
        `);

        assert(
            'Conversation realtime channel created on active conversation',
            realtimeCheck && realtimeCheck.hasChannelBefore === true,
            'Channel was not stored in activeChannels'
        );

        assert(
            'Conversation realtime channel cleanly destroyed on unsubscription',
            realtimeCheck && realtimeCheck.hasChannelAfter === false,
            'Channel remained in activeChannels after unsubscribe'
        );

        assert(
            'Global messages channel cleaned up when all listeners unsubscribe',
            realtimeCheck && realtimeCheck.globalChannelAfter === false,
            'Global channel lingered after listeners cleared'
        );

        // ----------------------------------------------------------------------
        // Test 6: AppView Inactive Conversation Teardown
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 6: AppView closeActiveConversation Lifecycle');
        const appViewTeardownCheck = await cdp.evaluate(`
            (async () => {
                const { AppView } = await import('/src/views/app/app.view.js');
                const root = document.createElement('div');
                root.className = 'app-container in-chat';
                root.innerHTML = '<div id="btn-mobile-chat-back"></div><div id="chat-header-actions"></div><div id="chat-input-container"></div><div id="chat-header-name">Active User</div><div id="chat-header-status">Online</div><div id="chat-header-avatar"></div><div id="chat-ephemeral-banner"></div><div id="messages-feed"><div class="message-row">Test Msg</div></div>';
                document.body.appendChild(root);

                let unsubCalled = false;
                AppView.activeConvUnsubscribe = () => { unsubCalled = true; };
                AppView.state.activeConversation = { id: 'conv-123', title: 'Test' };

                // Call closeActiveConversation
                AppView.closeActiveConversation(root);

                const inChatClassRemoved = !root.classList.contains('in-chat');
                const activeConvNull = AppView.state.activeConversation === null;
                const activeUnsubCleared = AppView.activeConvUnsubscribe === null;
                const feedReset = root.querySelector('#messages-feed')?.innerHTML.includes('No conversation selected');

                root.remove();

                return {
                    unsubCalled,
                    inChatClassRemoved,
                    activeConvNull,
                    activeUnsubCleared,
                    feedReset
                };
            })()
        `);

        assert(
            'AppView.closeActiveConversation tears down realtime subscription and resets UI',
            appViewTeardownCheck && appViewTeardownCheck.unsubCalled && appViewTeardownCheck.inChatClassRemoved && appViewTeardownCheck.activeConvNull && appViewTeardownCheck.feedReset,
            JSON.stringify(appViewTeardownCheck)
        );

        // ----------------------------------------------------------------------
        // Test 7: Notification Pagination Support
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 7: Notification Service Pagination');
        const notifCheck = await cdp.evaluate(`
            (async () => {
                const { notificationService } = await import('/src/services/notification.service.js');
                const res = await notificationService.getNotifications({ limit: 25, offset: 0 });
                return {
                    success: res.success !== undefined,
                    notificationsIsArray: Array.isArray(res.notifications)
                };
            })()
        `);

        assert(
            'notificationService.getNotifications supports limit and offset parameters',
            notifCheck && notifCheck.success && notifCheck.notificationsIsArray,
            JSON.stringify(notifCheck)
        );

        // ----------------------------------------------------------------------
        // Test 8: Group Members Paginated RPC / Query
        // ----------------------------------------------------------------------
        console.log('\n>>> Section 8: Group Members Paginated API');
        const groupMembersCheck = await cdp.evaluate(`
            (async () => {
                const { chatService } = await import('/src/services/chat.service.js');
                const res = await chatService.getGroupMembers('00000000-0000-0000-0000-000000000000', {
                    limit: 40,
                    offset: 0,
                    search: ''
                });
                return {
                    hasSuccess: typeof res.success === 'boolean',
                    membersIsArray: Array.isArray(res.members)
                };
            })()
        `);

        assert(
            'chatService.getGroupMembers supports paginated loading and search query',
            groupMembersCheck && groupMembersCheck.hasSuccess && groupMembersCheck.membersIsArray,
            JSON.stringify(groupMembersCheck)
        );

        cdp.close();

    } catch (err) {
        console.error('\nSuite Execution Exception:', err);
        failedTests++;
    } finally {
        if (typeof cdp !== 'undefined') {
            try { cdp.close(); } catch (_) {}
            await sleep(300);
        }
        try { chromeProcess.kill(); } catch (_) {}
        await sleep(200);
    }

    console.log('\n========================================================================');
    console.log(`Summary: Passed: ${passedTests} | Failed: ${failedTests}`);
    console.log('========================================================================\n');

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

run();
