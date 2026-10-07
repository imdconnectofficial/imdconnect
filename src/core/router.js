// ==============================================================================
// ImdConnect — Client-Side SPA Router with Public Paths & Admin Role Guards
// ==============================================================================
import { authService } from '../services/auth.service.js';

class Router {
    constructor() {
        this.routes = {};
        this.currentView = null;
        this.appRoot = null;
    }

    /**
     * Register a route definition
     * @param {string|Array<string>} paths - Path or array of path aliases (e.g. ['/login', '#/login'])
     * @param {Object} config - { view: Component, requiresAuth?: boolean, requiresGuest?: boolean, requiresAdmin?: boolean }
     */
    register(paths, config) {
        const pathList = Array.isArray(paths) ? paths : [paths];
        pathList.forEach(p => {
            this.routes[p] = config;
        });
    }

    /**
     * Initialize router and bind hash and popstate listeners
     * @param {HTMLElement} rootElement 
     */
    init(rootElement) {
        this.appRoot = rootElement;

        window.addEventListener('hashchange', () => this.handleRouting());
        window.addEventListener('popstate', () => this.handleRouting());

        // Check if user arrived via Supabase recovery email link
        if (window.location.hash.includes('type=recovery')) {
            window.location.hash = '#/reset-password';
            return;
        }

        // Normalize non-hash pathnames if applicable (e.g. direct visits to /terms, /privacy, /login)
        const pathname = window.location.pathname.replace(/\/+$/, '');
        if (pathname && pathname !== '' && pathname !== '/' && !window.location.hash) {
            const potentialRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/terms', '/privacy'];
            const match = potentialRoutes.find(r => pathname.endsWith(r));
            if (match) {
                window.location.hash = '#' + match;
                return;
            }
        }

        this.handleRouting();
    }

    /**
     * Programmatic navigation
     * @param {string} path 
     */
    navigate(path) {
        if (!path.startsWith('#')) {
            window.location.hash = '#' + (path.startsWith('/') ? path : '/' + path);
        } else {
            window.location.hash = path;
        }
    }

    /**
     * Main route resolution with authentication & admin role protection
     */
    async handleRouting() {
        let rawHash = window.location.hash || '#/';
        const hashPath = rawHash.split('?')[0];

        // Normalize root
        let normalizedPath = hashPath;
        if (normalizedPath === '#' || normalizedPath === '#/' || normalizedPath === '') {
            normalizedPath = '#/';
        }

        // Check if path is public without hash e.g. '/terms'
        let routeConfig = this.routes[normalizedPath];

        // Try hashless lookup alias e.g. '/login' for '#/login'
        if (!routeConfig) {
            const hashless = normalizedPath.replace(/^#/, '');
            routeConfig = this.routes[hashless];
        }

        // Root landing logic
        if (normalizedPath === '#/') {
            const session = await authService.getSession();
            if (session) {
                this.navigate('#/chats');
                return;
            }
        }

        // Fallback to registered '#/' route if route not found
        if (!routeConfig) {
            routeConfig = this.routes['#/'] || this.routes['/'];
            if (!routeConfig) return;
        }

        const session = await authService.getSession();

        // 1. Guard: Requires authenticated user
        if (routeConfig.requiresAuth && !session) {
            this.navigate('#/login');
            return;
        }

        // 2. Guard: Requires unauthenticated guest
        if (routeConfig.requiresGuest && session) {
            this.navigate('#/chats');
            return;
        }

        // 3. Guard: Requires Admin role
        if (routeConfig.requiresAdmin) {
            if (!session) {
                this.navigate('#/login');
                return;
            }
            const isAdmin = await authService.isAdmin();
            if (!isAdmin) {
                alert('Access Denied: Administrator privileges are required to view this portal.');
                this.navigate('#/chats');
                return;
            }
        }

        // Cleanup existing view
        if (this.currentView && typeof this.currentView.unmount === 'function') {
            this.currentView.unmount();
        }

        // Instantiate and mount view
        this.currentView = routeConfig.view;
        if (this.currentView && typeof this.currentView.render === 'function') {
            this.appRoot.innerHTML = '';
            const viewElement = await this.currentView.render();
            if (viewElement) {
                this.appRoot.appendChild(viewElement);
            }
        }
    }
}

export const router = new Router();
