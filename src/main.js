// ==============================================================================
// ImdConnect — Application Bootstrap & Entry Point
// ==============================================================================
import { router } from './core/router.js';
import { authService } from './services/auth.service.js';
import { LoginView } from './views/auth/login.view.js';
import { RegisterView } from './views/auth/register.view.js';
import { ForgotPasswordView } from './views/auth/forgot-password.view.js';
import { ResetPasswordView } from './views/auth/reset-password.view.js';
import { VerifyEmailView } from './views/auth/verify-email.view.js';
import { DashboardView } from './views/app/dashboard.view.js';

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

    // 3. Register Routes with Route Guards
    router.register('#/auth/login', {
        view: LoginView,
        requiresGuest: true
    });

    router.register('#/auth/register', {
        view: RegisterView,
        requiresGuest: true
    });

    router.register('#/auth/forgot-password', {
        view: ForgotPasswordView,
        requiresGuest: true
    });

    router.register('#/auth/reset-password', {
        view: ResetPasswordView
    });

    router.register('#/auth/verify-email', {
        view: VerifyEmailView
    });

    router.register('#/app', {
        view: DashboardView,
        requiresAuth: true
    });

    // 4. Global Auth State Listener
    authService.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            router.navigate('#/auth/login');
        } else if (event === 'SIGNED_IN') {
            const currentHash = window.location.hash;
            if (currentHash.startsWith('#/auth/login') || currentHash.startsWith('#/auth/register')) {
                router.navigate('#/app');
            }
        } else if (event === 'PASSWORD_RECOVERY') {
            router.navigate('#/auth/reset-password');
        }
    });

    // 5. Mount Router
    router.init(appRoot);
}

document.addEventListener('DOMContentLoaded', bootstrap);
