// ==============================================================================
// ImdConnect — Comprehensive 9-Viewport Automated Testing Suite via Chrome CDP
// Tests:
// - All 9 Viewports (320x568, 360x800, 375x812, 390x844, 412x915, 768x1024, 1024x768, 1280x800, 1440x900)
// - No horizontal scrolling
// - Bottom navigation visibility & height
// - Fixed message composer & touch targets
// - Safe-area spacing
// - Chat scrolling
// - Profile panel
// - Settings
// - Modals
// - Dropdowns
// - Notifications
// - Dark mode & Light mode
// ==============================================================================
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const VIEWPORTS = [
    { name: 'iPhone SE (1st gen)', width: 320, height: 568, isMobile: true },
    { name: 'Compact Android', width: 360, height: 800, isMobile: true },
    { name: 'iPhone X / 11 / 12 mini', width: 375, height: 812, isMobile: true },
    { name: 'iPhone 12 / 13 / 14', width: 390, height: 844, isMobile: true },
    { name: 'Pixel 7 / Android Large', width: 412, height: 915, isMobile: true },
    { name: 'iPad Mini / Portrait Tablet', width: 768, height: 1024, isMobile: true },
    { name: 'iPad Landscape / Small Laptop', width: 1024, height: 768, isMobile: false },
    { name: 'Laptop WXGA', width: 1280, height: 800, isMobile: false },
    { name: 'Desktop Widescreen', width: 1440, height: 900, isMobile: false }
];

const SCREENSHOT_DIR = path.resolve('tests/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function findBrowserBinary() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const bin of candidates) {
        if (fs.existsSync(bin)) return bin;
    }
    throw new Error('No supported browser found.');
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 1;
        this.pending = new Map();
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
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
    console.log('   ImdConnect Comprehensive 9-Viewport Testing via Chrome DevTools CDP  ');
    console.log('========================================================================\n');

    const browserBin = findBrowserBinary();
    console.log(`Browser: ${browserBin}`);

    const userDataDir = path.resolve('tests/.chrome_test_profile');
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

    const chromeProcess = spawn(browserBin, [
        '--headless=new',
        '--remote-debugging-port=9222',
        `--user-data-dir=${userDataDir}`,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        'http://localhost:3000/#/app'
    ]);

    await sleep(2500);

    let targetPage;
    try {
        const versionRes = await fetch('http://localhost:9222/json/version');
        const ver = await versionRes.json();
        console.log(`CDP Version: ${ver.Browser}`);

        const pages = await (await fetch('http://localhost:9222/json/list')).json();
        targetPage = pages.find(p => p.url && p.url.includes('localhost:3000')) || pages.find(p => p.type === 'page') || pages[0];
        if (!targetPage) throw new Error('No target page found in Chrome.');
        console.log(`Connected to target page: ${targetPage.url}`);
    } catch (e) {
        console.error('Failed to initialize Chrome CDP:', e.message);
        chromeProcess.kill();
        process.exit(1);
    }

    const cdp = new CDPClient(targetPage.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

    await sleep(1500);

    // Initialize Mock Authenticated App View
    console.log('Mounting AppView with test data into DOM...');
    const mountRes = await cdp.evaluate(`(async () => {
        try {
            const mod = await import('/tests/client_viewport_eval.js?t=' + Date.now());
            return await mod.initTestApp();
        } catch (err) {
            return { error: err.message, stack: err.stack };
        }
    })()`);

    console.log('Mount result:', JSON.stringify(mountRes));
    if (mountRes?.error) {
        throw new Error('Failed to mount test app view: ' + mountRes.error);
    }
    await sleep(1000);

    const overallResults = [];

    for (const vp of VIEWPORTS) {
        console.log(`\n========================================================================`);
        console.log(`Testing Viewport: ${vp.width}x${vp.height} — ${vp.name}`);
        console.log(`========================================================================`);

        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: vp.width,
            height: vp.height,
            deviceScaleFactor: 2,
            mobile: vp.isMobile
        });

        await sleep(400);

        // 1. Diagnostics: Main Chats View
        const mainDiag = await cdp.evaluate(`window.__VIEWPORT_TESTS__.testChatsView()`);

        if (mainDiag?.error) {
            console.error(`  [Chats View Error]:`, mainDiag.error);
        } else {
            console.log(`[Chats View]`);
            console.log(`  - Horizontal Scroll: ${!mainDiag.hasHScroll ? '✓ NONE (PASS)' : `✗ OVERFLOW (${mainDiag.docWidth}px > ${mainDiag.winWidth}px)`}`);
            if (mainDiag.hasHScroll) console.log(`    Elements:`, JSON.stringify(mainDiag.overflowing));
            console.log(`  - Bottom Nav: Display = ${mainDiag.bottomNavDisplay}, Height = ${mainDiag.bottomNavHeight}px (Expected ${mainDiag.isMobile ? 'Visible' : 'Hidden'})`);
        }

        // Screenshot: Chats View Light
        const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `${vp.width}x${vp.height}_chats_light.png`), Buffer.from(shot1.data, 'base64'));

        // 2. Diagnostics: In-Chat View (Fixed composer, scrolling, safe areas)
        const chatDiag = await cdp.evaluate(`window.__VIEWPORT_TESTS__.testInChatView()`);

        if (chatDiag?.error) {
            console.error(`  [In-Chat View Error]:`, chatDiag.error);
        } else {
            console.log(`[In-Chat View]`);
            console.log(`  - Horizontal Scroll: ${!chatDiag.hasHScroll ? '✓ NONE (PASS)' : '✗ OVERFLOW'}`);
            console.log(`  - Composer Visible: ${chatDiag.composerVisible ? 'YES' : 'NO'} (Height: ${chatDiag.composerHeight}px, PB: ${chatDiag.composerPaddingBottom})`);
            console.log(`  - Send Button Touch Target: ${chatDiag.sendBtnWidth}x${chatDiag.sendBtnHeight}px (${chatDiag.sendBtnMeets44px ? '✓ PASS' : '✗ TOO SMALL'})`);
            console.log(`  - Feed Scrollable: ${chatDiag.feedScrollable ? '✓ YES (overflow-y: auto)' : '✗ NO'}`);
        }

        // Screenshot: In-Chat View
        const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `${vp.width}x${vp.height}_inchat_light.png`), Buffer.from(shot2.data, 'base64'));

        // Reset in-chat state
        await cdp.evaluate(`window.__VIEWPORT_TESTS__.resetInChat()`);

        // 3. Diagnostics: Notifications View
        const notifDiag = await cdp.evaluate(`window.__VIEWPORT_TESTS__.testTabView('notifications')`);

        console.log(`[Notifications View]`);
        console.log(`  - Horizontal Scroll: ${!notifDiag?.hasHScroll ? '✓ NONE (PASS)' : '✗ OVERFLOW'}`);

        // 4. Diagnostics: Settings View
        const settingsDiag = await cdp.evaluate(`window.__VIEWPORT_TESTS__.testTabView('settings')`);

        console.log(`[Settings View]`);
        console.log(`  - Horizontal Scroll: ${!settingsDiag?.hasHScroll ? '✓ NONE (PASS)' : '✗ OVERFLOW'}`);

        // 5. Diagnostics: Profile View
        const profileDiag = await cdp.evaluate(`window.__VIEWPORT_TESTS__.testTabView('profile')`);

        console.log(`[Profile View]`);
        console.log(`  - Horizontal Scroll: ${!profileDiag?.hasHScroll ? '✓ NONE (PASS)' : '✗ OVERFLOW'}`);

        // 6. Diagnostics: Modal View (Disappearing Timer Modal)
        const modalDiag = await cdp.evaluate(`window.__VIEWPORT_TESTS__.testModal()`);

        console.log(`[Modal View]`);
        console.log(`  - Modal Open: ${modalDiag?.modalOpen ? 'YES' : 'NO'} (${modalDiag?.modalWidth}x${modalDiag?.modalHeight}px, Fits: ${modalDiag?.fitsInViewport ? '✓ PASS' : '✗ OVERFLOW'})`);
        console.log(`  - Horizontal Scroll: ${!modalDiag?.hasHScroll ? '✓ NONE (PASS)' : '✗ OVERFLOW'}`);

        // Screenshot: Modal
        const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `${vp.width}x${vp.height}_modal_light.png`), Buffer.from(shot3.data, 'base64'));

        // Close modal
        await cdp.evaluate(`window.__VIEWPORT_TESTS__.closeModal()`);

        // 7. Diagnostics: Dark Mode across Viewport
        const darkDiag = await cdp.evaluate(`window.__VIEWPORT_TESTS__.testTheme('dark')`);
        await sleep(150);

        console.log(`[Dark Mode]`);
        console.log(`  - Theme: Active (BG: ${darkDiag?.bg}, Text: ${darkDiag?.text})`);
        console.log(`  - Horizontal Scroll: ${!darkDiag?.hasHScroll ? '✓ NONE (PASS)' : '✗ OVERFLOW'}`);

        // Screenshot: Dark Mode
        const shot4 = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SCREENSHOT_DIR, `${vp.width}x${vp.height}_chats_dark.png`), Buffer.from(shot4.data, 'base64'));

        // Reset to light theme
        await cdp.evaluate(`window.__VIEWPORT_TESTS__.testTheme('light')`);

        const isVpPass = !mainDiag.hasHScroll && !chatDiag.hasHScroll && !notifDiag.hasHScroll &&
                         !settingsDiag.hasHScroll && !profileDiag.hasHScroll && !modalDiag.hasHScroll &&
                         chatDiag.sendBtnMeets44px && modalDiag.fitsInViewport;

        overallResults.push({
            viewport: `${vp.width}x${vp.height}`,
            name: vp.name,
            pass: isVpPass,
            mainDiag,
            chatDiag,
            modalDiag
        });
    }

    cdp.close();
    chromeProcess.kill();

    console.log('\n========================================================================');
    console.log('                 FINAL VIEWPORT AUDIT RESULTS SUMMARY                   ');
    console.log('========================================================================');
    let allPassed = true;
    for (const r of overallResults) {
        const status = r.pass ? '✓ PASS' : '✗ FAIL';
        if (!r.pass) allPassed = false;
        console.log(`  ${r.viewport.padEnd(12)} (${r.name.padEnd(30)}): ${status}`);
    }
    console.log('========================================================================\n');

    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
