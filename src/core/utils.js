// ==============================================================================
// ImdConnect — Core Performance Utilities
// High-efficiency debounce, throttle, and DOM batching helpers
// ==============================================================================

/**
 * Debounce function execution until delay milliseconds of inactivity
 * Prevents rapid-fire Supabase queries and layout reflows during keystrokes
 * @param {Function} fn 
 * @param {number} delay 
 * @returns {Function}
 */
export function debounce(fn, delay = 250) {
    let timer = null;
    const debounced = function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, delay);
    };
    debounced.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    return debounced;
}

/**
 * Throttle function execution to at most once per limit milliseconds
 * Ideal for scroll listeners, viewport resizing, and typing broadcasts
 * @param {Function} fn 
 * @param {number} limit 
 * @returns {Function}
 */
export function throttle(fn, limit = 200) {
    let inThrottle = false;
    let lastArgs = null;
    let lastContext = null;

    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
                if (lastArgs) {
                    fn.apply(lastContext, lastArgs);
                    lastArgs = null;
                    lastContext = null;
                }
            }, limit);
        } else {
            lastArgs = args;
            lastContext = this;
        }
    };
}

/**
 * Escape HTML to prevent XSS while maintaining raw text speed
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
