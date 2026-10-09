// ==============================================================================
// ImdConnect — Comprehensive PWA Support Automated Verification Test
// Tests:
// 1. Manifest link & JSON schema validation (name, short_name, icons, display, colors)
// 2. Application icon assets accessibility (192, 512, maskable, apple-touch, favicon)
// 3. Installable meta tags (apple-mobile-web-app-capable, theme-color, viewport)
// 4. Service Worker registration & static shell caching
// 5. SECURITY CHECK: Zero caching of private messages, credentials, or Supabase endpoints
// 6. Graceful offline state & realtime reconnecting indicator
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
        return res?.result?.value;
    }

    close() {
        try { this.ws.close(); } catch (_) {}
    }
}

async function run() {
    console.log('\n========================================================================');
    console.log('            ImdConnect — PWA & Offline Support Verification Suite       ');
    console.log('========================================================================\n');

    const browserBin = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const userDataDir = path.resolve('tests/.chrome_pwa_profile');
    if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(userDataDir, { recursive: true });

    const chromeProcess = spawn(browserBin, [
        '--headless=new',
        '--remote-debugging-port=9226',
        `--user-data-dir=${userDataDir}`,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://localhost:3000/#/app'
    ]);

    await sleep(2500);

    const pages = await (await fetch('http://localhost:9226/json/list')).json();
    const targetPage = pages.find(p => p.url && p.url.includes('localhost:3000')) || pages[0];
    const cdp = new CDPClient(targetPage.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Console.enable');
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('ServiceWorker.enable');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/#/app' });
    await sleep(2500);

    let passes = 0;
    let total = 0;
    function check(desc, condition, details = '') {
        total++;
        if (condition) {
            passes++;
            console.log(`  ✓ PASS: ${desc} ${details ? `(${details})` : ''}`);
        } else {
            console.log(`  ✗ FAIL: ${desc} ${details ? `(${details})` : ''}`);
        }
    }

    // --------------------------------------------------------------------------
    // Test 1: Web App Manifest & Metadata in DOM
    // --------------------------------------------------------------------------
    console.log('[1. Manifest & Head Metadata Inspection]');
    const domMeta = await cdp.evaluate(`(() => {
        const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
        const themeColorLight = document.querySelector('meta[name="theme-color"][media*="light"]')?.getAttribute('content');
        const themeColorDark = document.querySelector('meta[name="theme-color"][media*="dark"]')?.getAttribute('content');
        const appleMobileCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content');
        const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content');
        const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href');
        const favicon = document.querySelector('link[rel="icon"]')?.getAttribute('href');
        return { manifestLink, themeColorLight, themeColorDark, appleMobileCapable, appleTitle, appleIcon, favicon };
    })()`);

    check('Manifest link present in HTML', domMeta.manifestLink === './manifest.webmanifest', domMeta.manifestLink);
    check('Theme color light configured', domMeta.themeColorLight === '#2563eb', domMeta.themeColorLight);
    check('Theme color dark configured', domMeta.themeColorDark === '#0f172a', domMeta.themeColorDark);
    check('Apple mobile web app capable set to yes', domMeta.appleMobileCapable === 'yes');
    check('Apple web app title configured', domMeta.appleTitle === 'ImdConnect');
    check('Apple touch icon referenced', !!domMeta.appleIcon, domMeta.appleIcon);
    check('SVG Favicon referenced', !!domMeta.favicon, domMeta.favicon);

    // --------------------------------------------------------------------------
    // Test 2: Fetch and Validate manifest.webmanifest content
    // --------------------------------------------------------------------------
    console.log('\n[2. Web Manifest Schema & Icon Completeness]');
    const manifestRes = await fetch('http://localhost:3000/manifest.webmanifest');
    check('manifest.webmanifest returns HTTP 200', manifestRes.status === 200);
    const manifestJson = await manifestRes.json();
    check('Manifest contains application name', manifestJson.name.includes('ImdConnect'));
    check('Manifest contains short_name', manifestJson.short_name === 'ImdConnect');
    check('Manifest start_url is defined', !!manifestJson.start_url, manifestJson.start_url);
    check('Manifest display is standalone', manifestJson.display === 'standalone');
    check('Manifest contains icons array', Array.isArray(manifestJson.icons) && manifestJson.icons.length >= 4, `${manifestJson.icons?.length} icons`);
    
    const has192 = manifestJson.icons.some(i => i.sizes === '192x192' && i.purpose === 'any');
    const has512 = manifestJson.icons.some(i => i.sizes === '512x512' && i.purpose === 'any');
    const hasMaskable192 = manifestJson.icons.some(i => i.sizes === '192x192' && i.purpose === 'maskable');
    const hasMaskable512 = manifestJson.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable');

    check('Has 192x192 standard icon', has192);
    check('Has 512x512 standard icon', has512);
    check('Has 192x192 maskable icon', hasMaskable192);
    check('Has 512x512 maskable icon', hasMaskable512);

    // --------------------------------------------------------------------------
    // Test 3: Icon Files HTTP Accessibility
    // --------------------------------------------------------------------------
    console.log('\n[3. Application Icon Assets File Integrity]');
    for (const icon of manifestJson.icons) {
        const cleanUrl = icon.src.replace('./', 'http://localhost:3000/');
        const res = await fetch(cleanUrl);
        check(`Icon ${icon.sizes} (${icon.purpose}) responds 200 OK`, res.status === 200, `${cleanUrl}`);
    }
    const appleIconRes = await fetch('http://localhost:3000/assets/icons/apple-touch-icon.png');
    check('Apple touch icon responds 200 OK', appleIconRes.status === 200);

    // --------------------------------------------------------------------------
    // Test 4: Service Worker Registration & Scope
    // --------------------------------------------------------------------------
    console.log('\n[4. Service Worker Registration & Cache Storage]');
    const swStatus = await cdp.evaluate(`(async () => {
        try {
            if (!('serviceWorker' in navigator)) return { supported: false };
            let reg = await navigator.serviceWorker.getRegistration();
            if (!reg) {
                reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            }
            // Wait up to 4s for service worker to become ready/active
            await Promise.race([
                navigator.serviceWorker.ready,
                new Promise(r => setTimeout(r, 4000))
            ]);
            const keys = await caches.keys();
            let shellCacheCount = 0;
            for (const k of keys) {
                const cache = await caches.open(k);
                const reqs = await cache.keys();
                shellCacheCount += reqs.length;
            }
            return {
                supported: true,
                registered: !!reg,
                scope: reg?.scope,
                state: reg?.active?.state || reg?.installing?.state || reg?.waiting?.state,
                cacheKeys: keys,
                shellCacheCount
            };
        } catch(err) {
            return { error: err.message };
        }
    })()`);

    check('Service Worker API supported', swStatus.supported);
    check('Service Worker registered', swStatus.registered, swStatus.scope);
    check('Static application shell cached in CacheStorage', swStatus.shellCacheCount > 0, `${swStatus.shellCacheCount} assets cached`);

    // --------------------------------------------------------------------------
    // Test 5: SECURITY CHECK — Zero Caching of Private Messages & Supabase APIs
    // --------------------------------------------------------------------------
    console.log('\n[5. Security Gate: Zero Caching of Sensitive/Private Messages]');
    const securityCheck = await cdp.evaluate(`(async () => {
        try {
            const keys = await caches.keys();
            let leakedUrls = [];
            for (const key of keys) {
                const cache = await caches.open(key);
                const requests = await cache.keys();
                for (const req of requests) {
                    const u = req.url.toLowerCase();
                    if (u.includes('supabase.co') || u.includes('/rest/v1/') || u.includes('/auth/v1/') || u.includes('/storage/v1/') || u.includes('messages') || u.includes('ciphertext')) {
                        leakedUrls.push(req.url);
                    }
                }
            }
            return {
                leakedUrls,
                isClean: leakedUrls.length === 0
            };
        } catch(err) {
            return { error: err.message };
        }
    })()`);

    check('ZERO Supabase API requests in CacheStorage', securityCheck.isClean, securityCheck.leakedUrls?.length === 0 ? 'Verified Clean' : `LEAK: ${securityCheck.leakedUrls?.join(', ')}`);
    check('ZERO private messages or ciphertext cached in SW', securityCheck.isClean);

    // --------------------------------------------------------------------------
    // Test 6: Reconnecting & Offline State UI Behavior
    // --------------------------------------------------------------------------
    console.log('\n[6. Offline State & Reconnecting UI Behavior]');
    
    // Test Global and AppView Realtime Reconnecting State
    const reconnectingUi = await cdp.evaluate(`(async () => {
        try {
            await import('/src/main.js');
            const { realtimeService } = await import('/src/services/realtime.service.js');
            const banner = document.getElementById('connection-status-banner');

            // 1. Trigger Reconnecting State
            realtimeService.setStatus('reconnecting');
            const isReconnectingVisible = banner && banner.style.display !== 'none' && banner.classList.contains('status-reconnecting');
            const reconnectingText = banner?.querySelector('#connection-status-text')?.textContent;

            // 2. Trigger Offline State
            realtimeService.setStatus('offline');
            const isOfflineVisible = banner && banner.style.display !== 'none' && banner.classList.contains('status-offline');
            const offlineText = banner?.querySelector('#connection-status-text')?.textContent;

            // 3. Trigger Connected State (auto-hide transition)
            realtimeService.setStatus('connected');
            const isConnectedHandled = banner && banner.classList.contains('status-connected');

            return {
                isReconnectingVisible,
                reconnectingText,
                isOfflineVisible,
                offlineText,
                isConnectedHandled
            };
        } catch(err) {
            return { error: err.message, stack: err.stack };
        }
    })()`);

    if (reconnectingUi?.error) {
        console.log('  [TEST 6 ERROR]', reconnectingUi.error, reconnectingUi.stack);
    }

    check('Reconnecting banner displayed when realtime unavailable', reconnectingUi?.isReconnectingVisible, reconnectingUi?.reconnectingText);
    check('Offline banner displayed when network offline', reconnectingUi?.isOfflineVisible, reconnectingUi?.offlineText);
    check('Connected banner displayed on reconnection recovery', reconnectingUi?.isConnectedHandled);

    // --------------------------------------------------------------------------
    // Test 7: Offline Application Shell Loading via Service Worker
    // --------------------------------------------------------------------------
    console.log('\n[7. Offline Shell Resilience Verification]');
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0
    });

    // Reload page while completely offline
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/#/app' });
    await sleep(2000);

    const offlineShellCheck = await cdp.evaluate(`(() => {
        const root = document.getElementById('app');
        const banner = document.getElementById('connection-status-banner');
        return {
            hasAppRoot: !!root,
            hasBanner: !!banner,
            title: document.title
        };
    })()`);

    check('Application shell rendered from SW cache while offline', offlineShellCheck?.hasAppRoot, offlineShellCheck?.title);
    check('Offline connection banner mounted in offline shell', offlineShellCheck?.hasBanner);

    // Restore network
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1
    });

    cdp.close();
    chromeProcess.kill();
    await sleep(800);
    try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {}

    console.log('\n========================================================================');
    console.log(`   PWA SUITE EXECUTION SUMMARY: ${passes}/${total} CHECKS PASSED`);
    console.log('========================================================================\n');

    process.exit(passes === total ? 0 : 1);
}

run().catch(err => {
    console.error('PWA Test Runner fatal error:', err);
    process.exit(1);
});
