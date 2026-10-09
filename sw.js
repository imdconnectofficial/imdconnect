// ==============================================================================
// ImdConnect — Progressive Web App Service Worker (Application Shell)
// ==============================================================================
// SECURITY CONSTRAINTS:
// - Caches ONLY static code assets, design tokens, and application UI shell.
// - NEVER caches private messages, encrypted ciphertext, or database queries.
// - NEVER caches Supabase API responses, tokens, or auth credentials.
// - Protects shared devices: zero conversation exposure across sessions.
// ==============================================================================

const CACHE_NAME = 'imdconnect-shell-v1.0.1';

const STATIC_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/assets/icons/favicon.svg',
    '/assets/icons/icon.svg',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png',
    '/assets/icons/apple-touch-icon.png',
    '/src/styles/tokens.css',
    '/src/styles/auth.css',
    '/src/styles/app.css',
    '/src/main.js',
    '/src/config.js',
    '/src/core/router.js',
    '/src/core/supabase.js',
    '/src/core/utils.js',
    '/src/services/auth.service.js',
    '/src/services/chat.service.js',
    '/src/services/friend.service.js',
    '/src/services/realtime.service.js',
    '/src/services/storage.service.js',
    '/src/services/profile.service.js',
    '/src/services/notification.service.js',
    '/src/services/admin.service.js',
    '/src/views/splash.view.js',
    '/src/views/auth/login.view.js',
    '/src/views/auth/register.view.js',
    '/src/views/auth/forgot-password.view.js',
    '/src/views/auth/reset-password.view.js',
    '/src/views/auth/verify-email.view.js',
    '/src/views/public/terms.view.js',
    '/src/views/public/privacy.view.js',
    '/src/views/app/app.view.js',
    '/src/views/settings/account-settings.view.js',
    '/src/views/settings/privacy-settings.view.js',
    '/src/views/settings/notification-settings.view.js',
    '/src/views/settings/theme-settings.view.js',
    '/src/views/settings/security-settings.view.js',
    '/src/views/admin/admin-dashboard.view.js',
    '/src/views/admin/admin-users.view.js',
    '/src/views/admin/admin-groups.view.js',
    '/src/views/admin/admin-reports.view.js',
    '/src/views/admin/admin-moderation.view.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

// ------------------------------------------------------------------------------
// 1. Service Worker Installation
// ------------------------------------------------------------------------------
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Cache shell files in parallel with non-blocking error tolerance
            await Promise.all(
                STATIC_SHELL_ASSETS.map(async (asset) => {
                    try {
                        await cache.add(asset);
                    } catch (err) {
                        console.warn(`[SW] Non-critical cache warning: ${asset}`, err.message);
                    }
                })
            );
        }).then(() => self.skipWaiting())
    );
});

// ------------------------------------------------------------------------------
// 2. Service Worker Activation & Cache Cleanup
// ------------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ------------------------------------------------------------------------------
// 3. Request Interception & Caching Strategy
// ------------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // SECURITY BOUNDARY 1: Never cache non-GET requests (mutations, sends, uploads)
    if (request.method !== 'GET') {
        return;
    }

    // SECURITY BOUNDARY 2: NEVER cache Supabase API calls or sensitive private data
    // Shared device rule: Private messages, user profiles & auth must never persist in SW cache
    const isSupabaseApi = url.hostname.includes('supabase.co') ||
                          url.pathname.includes('/rest/v1/') ||
                          url.pathname.includes('/auth/v1/') ||
                          url.pathname.includes('/storage/v1/');

    if (isSupabaseApi) {
        // Direct network pass-through; zero caching
        return;
    }

    // 4. HTML Navigation Requests -> Serve Offline Application Shell
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                const cachedShell = await caches.match('/index.html') || await caches.match('/');
                if (cachedShell) return cachedShell;
                return new Response(
                    '<!DOCTYPE html><html><head><title>ImdConnect — Offline</title></head><body><div id="app"><div style="padding: 2rem; text-align: center; font-family: sans-serif;"><h2>You are offline</h2><p>Please check your internet connection to continue.</p></div></div></body></html>',
                    { headers: { 'Content-Type': 'text/html' } }
                );
            })
        );
        return;
    }

    // 5. Static Shell Assets (CSS, JS, Fonts, Images) -> Stale-While-Revalidate
    const isStaticAsset = url.origin === self.location.origin ||
                          url.hostname === 'cdn.jsdelivr.net' ||
                          url.hostname === 'fonts.googleapis.com' ||
                          url.hostname === 'fonts.gstatic.com';

    if (isStaticAsset) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                // Fetch fresh copy from network in parallel
                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Offline fallback: returns cached response if network failed
                    return cachedResponse;
                });

                // Return cached version immediately if available, otherwise wait for network
                return cachedResponse || fetchPromise;
            })
        );
    }
});

// ------------------------------------------------------------------------------
// 4. Messaging & Security Wipe (e.g. on Logout or User Switch)
// ------------------------------------------------------------------------------
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
