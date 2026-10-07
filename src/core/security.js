// ==============================================================================
// ImdConnect — Core Security & Sanitization Utilities
// ==============================================================================

/**
 * Robust HTML escaping preventing XSS across both text and attribute contexts.
 * Escapes: &, <, >, ", ', `
 * @param {string|number|null|undefined} str 
 * @returns {string}
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}

/**
 * Sanitize URL to prevent javascript: or data: code execution in href/src
 * @param {string} url 
 * @returns {string}
 */
export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    // Allow relative paths, standard HTTP/HTTPS protocols, and safe blob URLs
    if (
        trimmed.startsWith('https://') || 
        trimmed.startsWith('http://') || 
        trimmed.startsWith('./') || 
        trimmed.startsWith('/') ||
        trimmed.startsWith('blob:http') ||
        trimmed.startsWith('data:image/')
    ) {
        return escapeHtml(trimmed);
    }
    return '';
}
