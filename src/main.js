// ==============================================================================
// ImdConnect — Application Bootstrap & Route Registrations
// Handles Public, Authenticated, Settings, and Admin Portal Routes
// ==============================================================================
import { router } from './core/router.js';
import { authService } from './services/auth.service.js';

// Public Views
import { SplashView } from './views/splash.view.js';
import { LoginView } from './views/auth/login.view.js';
import { RegisterView } from './views/auth/register.view.js';
import { ForgotPasswordView } from './views/auth/forgot-password.view.js';
import { ResetPasswordView } from './views/auth/reset-password.view.js';
import { VerifyEmailView } from './views/auth/verify-email.view.js';
import { TermsView } from './views/public/terms.view.js';
import { PrivacyView } from './views/public/privacy.view.js';

// Authenticated Views
import { AppView } from './views/app/app.view.js';

// Settings Views
import { AccountSettingsView } from './views/settings/account-settings.view.js';
import { PrivacySettingsView } from './views/settings/privacy-settings.view.js';
import { NotificationSettingsView } from './views/settings/notification-settings.view.js';
import { ThemeSettingsView } from './views/settings/theme-settings.view.js';
import { SecuritySettingsView } from './views/settings/security-settings.view.js';

// Admin Views
import { AdminDashboardView } from './views/admin/admin-dashboard.view.js';
import { AdminUsersView } from './views/admin/admin-users.view.js';
import { AdminGroupsView } from './views/admin/admin-groups.view.js';
import { AdminReportsView } from './views/admin/admin-reports.view.js';
import { AdminModerationView } from './views/admin/admin-moderation.view.js';

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
    // 3. Register PUBLIC Routes
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
        view: RegisterView,
        requiresGuest: true
    });

    router.register(['#/forgot-password', '/forgot-password', '#/auth/forgot-password'], {
        view: ForgotPasswordView,
        requiresGuest: true
    });

    router.register(['#/reset-password', '/reset-password', '#/auth/reset-password'], {
        view: ResetPasswordView
    });

    router.register(['#/verify-email', '/verify-email', '#/auth/verify-email'], {
        view: VerifyEmailView
    });

    router.register(['#/terms', '/terms'], {
        view: TermsView
    });

    router.register(['#/privacy', '/privacy'], {
        view: PrivacyView
    });

    // --------------------------------------------------------------------------
    // 4. Register AUTHENTICATED Routes
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
    // 5. Register SETTINGS Sub-Routes
    // --------------------------------------------------------------------------
    router.register(['#/settings/account', '#/app/account'], {
        view: AccountSettingsView,
        requiresAuth: true
    });

    router.register(['#/settings/privacy'], {
        view: PrivacySettingsView,
        requiresAuth: true
    });

    router.register(['#/settings/notifications'], {
        view: NotificationSettingsView,
        requiresAuth: true
    });

    router.register(['#/settings/theme'], {
        view: ThemeSettingsView,
        requiresAuth: true
    });

    router.register(['#/settings/security'], {
        view: SecuritySettingsView,
        requiresAuth: true
    });

    // --------------------------------------------------------------------------
    // 6. Register ADMIN Routes (Guarded with requiresAdmin)
    // --------------------------------------------------------------------------
    router.register(['#/admin'], {
        view: AdminDashboardView,
        requiresAdmin: true
    });

    router.register(['#/admin/users'], {
        view: AdminUsersView,
        requiresAdmin: true
    });

    router.register(['#/admin/groups'], {
        view: AdminGroupsView,
        requiresAdmin: true
    });

    router.register(['#/admin/reports'], {
        view: AdminReportsView,
        requiresAdmin: true
    });

    router.register(['#/admin/moderation'], {
        view: AdminModerationView,
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
}

document.addEventListener('DOMContentLoaded', bootstrap);
