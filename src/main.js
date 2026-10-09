// ==============================================================================
// ImdConnect — Application Bootstrap & Route Registrations
// Handles Public, Authenticated, Settings, and Admin Portal Routes
// ==============================================================================
import { router } from './core/router.js';
import { authService } from './services/auth.service.js';
import { realtimeService } from './services/realtime.service.js';

// Core Views (Preloaded for instant interactive shell)
import { SplashView } from './views/splash.view.js';
import { LoginView } from './views/auth/login.view.js';
import { AppView } from './views/app/app.view.js';

// 1. Initialize Saved Theme
function initTheme() {
    const savedTheme = localStorage.getItem('imd_theme') || 'system';
    if (savedTheme !== 'system') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
}

// 2. Application Bootstrapper
async function bootstrap() {
    initTheme();

    const appRoot = document.getElementById('app');
    if (!appRoot) {
        console.error('[ImdConnect] Root #app container not found.');
        return;
    }

    // --------------------------------------------------------------------------
    // 3. Register PUBLIC Routes (Core eager, secondary lazy-loaded)
    // --------------------------------------------------------------------------
    router.register(['#/', '/'], {
        view: SplashView,
        requiresGuest: true
    });

    router.register(['#/login', '/login', '#/auth/login'], {
        view: LoginView,
        requiresGuest: true
    });

    router.register(['#/register', '/register', '#/auth/register'], {
        loader: () => import('./views/auth/register.view.js'),
        exportName: 'RegisterView',
        requiresGuest: true
    });

    router.register(['#/forgot-password', '/forgot-password', '#/auth/forgot-password'], {
        loader: () => import('./views/auth/forgot-password.view.js'),
        exportName: 'ForgotPasswordView',
        requiresGuest: true
    });

    router.register(['#/reset-password', '/reset-password', '#/auth/reset-password'], {
        loader: () => import('./views/auth/reset-password.view.js'),
        exportName: 'ResetPasswordView'
    });

    router.register(['#/verify-email', '/verify-email', '#/auth/verify-email'], {
        loader: () => import('./views/auth/verify-email.view.js'),
        exportName: 'VerifyEmailView'
    });

    router.register(['#/terms', '/terms'], {
        loader: () => import('./views/public/terms.view.js'),
        exportName: 'TermsView'
    });

    router.register(['#/privacy', '/privacy'], {
        loader: () => import('./views/public/privacy.view.js'),
        exportName: 'PrivacyView'
    });

    // --------------------------------------------------------------------------
    // 4. Register AUTHENTICATED Main Application Routes
    // --------------------------------------------------------------------------
    router.register(['#/chats', '#/app'], {
        view: AppView,
        requiresAuth: true
    });

    router.register(['#/friends'], {
        view: AppView,
        requiresAuth: true
    });

    router.register(['#/groups'], {
        view: AppView,
        requiresAuth: true
    });

    router.register(['#/notifications'], {
        view: AppView,
        requiresAuth: true
    });

    router.register(['#/profile'], {
        view: AppView,
        requiresAuth: true
    });

    router.register(['#/settings'], {
        view: AppView,
        requiresAuth: true
    });

    // --------------------------------------------------------------------------
    // 5. Register SETTINGS Sub-Routes (Lazy loaded on demand)
    // --------------------------------------------------------------------------
    router.register(['#/settings/account', '#/app/account'], {
        loader: () => import('./views/settings/account-settings.view.js'),
        exportName: 'AccountSettingsView',
        requiresAuth: true
    });

    router.register(['#/settings/privacy'], {
        loader: () => import('./views/settings/privacy-settings.view.js'),
        exportName: 'PrivacySettingsView',
        requiresAuth: true
    });

    router.register(['#/settings/notifications'], {
        loader: () => import('./views/settings/notification-settings.view.js'),
        exportName: 'NotificationSettingsView',
        requiresAuth: true
    });

    router.register(['#/settings/theme'], {
        loader: () => import('./views/settings/theme-settings.view.js'),
        exportName: 'ThemeSettingsView',
        requiresAuth: true
    });

    router.register(['#/settings/security'], {
        loader: () => import('./views/settings/security-settings.view.js'),
        exportName: 'SecuritySettingsView',
        requiresAuth: true
    });

    // --------------------------------------------------------------------------
    // 6. Register ADMIN Routes (Lazy loaded on demand & guarded)
    // --------------------------------------------------------------------------
    router.register(['#/admin'], {
        loader: () => import('./views/admin/admin-dashboard.view.js'),
        exportName: 'AdminDashboardView',
        requiresAdmin: true
    });

    router.register(['#/admin/users'], {
        loader: () => import('./views/admin/admin-users.view.js'),
        exportName: 'AdminUsersView',
        requiresAdmin: true
    });

    router.register(['#/admin/groups'], {
        loader: () => import('./views/admin/admin-groups.view.js'),
        exportName: 'AdminGroupsView',
        requiresAdmin: true
    });

    router.register(['#/admin/reports'], {
        loader: () => import('./views/admin/admin-reports.view.js'),
        exportName: 'AdminReportsView',
        requiresAdmin: true
    });

    router.register(['#/admin/moderation'], {
        loader: () => import('./views/admin/admin-moderation.view.js'),
        exportName: 'AdminModerationView',
        requiresAdmin: true
    });

    // --------------------------------------------------------------------------
    // 7. Global Auth State Listener
    // --------------------------------------------------------------------------
    authService.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            router.navigate('#/login');
        } else if (event === 'SIGNED_IN') {
            const currentHash = window.location.hash;
            if (currentHash.startsWith('#/login') || currentHash.startsWith('#/register') || currentHash.startsWith('#/auth/')) {
                router.navigate('#/chats');
            }
        } else if (event === 'PASSWORD_RECOVERY') {
            router.navigate('#/reset-password');
        }
    });

    // 8. Mount Router
    router.init(appRoot);

    // 9. Initialize Global Connection Status Banner
    initConnectionStatusIndicator();

    // 10. Initialize PWA Service Worker & Install Capability
    initPWA();
}

/**
 * Initialize Global Realtime & Offline Connection Status Indicator
 * Seamlessly informs user when offline, reconnecting, or restored
 */
function initConnectionStatusIndicator() {
    const banner = document.getElementById('connection-status-banner');
    if (!banner) return;
    const icon = document.getElementById('connection-status-icon');
    const text = document.getElementById('connection-status-text');

    realtimeService.onStatusChange((status) => {
        banner.classList.remove('status-offline', 'status-reconnecting', 'status-connected');

        if (status === 'offline') {
            banner.classList.add('status-offline');
            if (icon) icon.innerHTML = '⚡';
            if (text) text.textContent = 'You are offline — Encrypted communications paused';
            banner.style.display = 'flex';
        } else if (status === 'reconnecting') {
            banner.classList.add('status-reconnecting');
            if (icon) icon.innerHTML = '<span class="status-spinner"></span>';
            if (text) text.textContent = 'Reconnecting to secure realtime channel...';
            banner.style.display = 'flex';
        } else if (status === 'disconnected') {
            banner.classList.add('status-reconnecting');
            if (icon) icon.innerHTML = '⚠️';
            if (text) text.textContent = 'Realtime disconnected. Reconnecting...';
            banner.style.display = 'flex';
        } else if (status === 'connected') {
            if (banner.style.display !== 'none' && !banner.classList.contains('status-connected')) {
                banner.classList.add('status-connected');
                if (icon) icon.innerHTML = '✓';
                if (text) text.textContent = 'Connected';
                setTimeout(() => {
                    banner.style.display = 'none';
                    banner.classList.remove('status-connected');
                }, 1500);
            } else {
                banner.style.display = 'none';
            }
        }
    });
}

/**
 * Initialize Progressive Web App Support
 * Registers Service Worker with security boundaries and captures install prompt
 */
function initPWA() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        const registerWorker = () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then((registration) => {
                    console.log('[ImdConnect PWA] Service Worker registered:', registration.scope);
                })
                .catch((err) => {
                    console.warn('[ImdConnect PWA] Service Worker registration failed:', err);
                });
        };

        if (document.readyState === 'complete') {
            registerWorker();
        } else {
            window.addEventListener('load', registerWorker);
        }
    }

    // Capture install prompt for PWA installation UI
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredPWAInstallPrompt = e;
        window.dispatchEvent(new CustomEvent('pwa:installable'));
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}


