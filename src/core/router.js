// ==============================================================================
// ImdConnect — Client-Side SPA Hash Router with Auth Guards
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
     * @param {string} path 
     * @param {Object} config - { view: Component, requiresAuth?: boolean, requiresGuest?: boolean }
     */
    register(path, config) {
        this.routes[path] = config;
    }

    /**
     * Initialize router and bind hash listeners
     * @param {HTMLElement} rootElement 
     */
    init(rootElement) {
        this.appRoot = rootElement;

        window.addEventListener('hashchange', () => this.handleRouting());
        
        // Listen for Supabase recovery token in URL fragment
        if (window.location.hash.includes('type=recovery')) {
            window.location.hash = '#/auth/reset-password';
            return;
        }

        this.handleRouting();
    }

    /**
     * Programmatic navigation
     * @param {string} path 
     */
    navigate(path) {
        window.location.hash = path;
    }

    /**
     * Main route resolution with authentication protection
     */
    async handleRouting() {
        const rawHash = window.location.hash || '#/';
        const path = rawHash.split('?')[0];

        // Default root landing redirect
        if (path === '#/' || path === '#' || path === '') {
            const session = await authService.getSession();
            this.navigate(session ? '#/app' : '#/auth/login');
            return;
        }

        const routeConfig = this.routes[path] || this.routes['#/auth/login'];
        if (!routeConfig) return;

        const session = await authService.getSession();

        // Guard: Requires authenticated user
        if (routeConfig.requiresAuth && !session) {
            this.navigate('#/auth/login');
            return;
        }

        // Guard: Requires unauthenticated guest
        if (routeConfig.requiresGuest && session) {
            this.navigate('#/app');
            return;
        }

        // Cleanup existing view if unmount exists
        if (this.currentView && typeof this.currentView.unmount === 'function') {
            this.currentView.unmount();
        }

        // Instantiate and mount new view
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
