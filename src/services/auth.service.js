// ==============================================================================
// ImdConnect — Authentication Service
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { CONFIG } from '../config.js';

class AuthService {
    constructor() {
        this._lastPasswordResetRequest = 0;
        this._lastResendVerification = 0;
        this._lastSignUpAttempt = 0;
    }

    /**
     * Dynamically calculate age from birth date string and check compliance.
     * Note: Age is NOT stored as authoritative data in DB — derived dynamically from birth_date.
     * @param {string} birthDateString - YYYY-MM-DD
     * @returns {{ age: number|null, isCompliant: boolean, error?: string }}
     */
    calculateAge(birthDateString) {
        if (!birthDateString || typeof birthDateString !== 'string') {
            return { age: null, isCompliant: false, error: 'Date of birth is required.' };
        }

        const parts = birthDateString.split('-');
        if (parts.length !== 3) {
            return { age: null, isCompliant: false, error: 'Invalid date format. Use YYYY-MM-DD.' };
        }

        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const dob = new Date(year, month, day);

        if (isNaN(dob.getTime()) || dob.getFullYear() !== year || dob.getMonth() !== month || dob.getDate() !== day) {
            return { age: null, isCompliant: false, error: 'Invalid calendar date.' };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dob > today) {
            return { age: null, isCompliant: false, error: 'Date of birth cannot be in the future.' };
        }

        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }

        if (age < 0) {
            return { age: 0, isCompliant: false, error: 'Date of birth cannot be in the future.' };
        }

        if (age < CONFIG.MIN_AGE_YEARS) {
            return {
                age,
                isCompliant: false,
                error: `You must be at least ${CONFIG.MIN_AGE_YEARS} years old to join ImdConnect.`
            };
        }

        return { age, isCompliant: true };
    }

    /**
     * Validate age compliance (Minimum 13 years old)
     * @param {string} birthDateString - YYYY-MM-DD
     * @returns {boolean}
     */
    isAgeCompliant(birthDateString) {
        return this.calculateAge(birthDateString).isCompliant;
    }

    /**
     * Check if username is available (Pre-registration check)
     * @param {string} rawUsername 
     * @returns {Promise<{ available: boolean, error?: string }>}
     */
    async checkUsernameAvailability(rawUsername) {
        const username = (rawUsername || '').trim().toLowerCase().replace(/^@/, '');
        
        if (!CONFIG.USERNAME_REGEX.test(username)) {
            return {
                available: false,
                error: 'Username must be 3-30 lowercase characters (letters, numbers, underscores).'
            };
        }

        try {
            const { data, error } = await supabase.rpc('check_username_availability', {
                p_username: username
            });

            if (error) {
                console.error('[AuthService] Username availability error:', error);
                return { available: false, error: 'Could not verify username availability.' };
            }

            return { available: Boolean(data) };
        } catch (err) {
            console.error('[AuthService] RPC exception:', err);
            return { available: false, error: 'Network error checking username.' };
        }
    }

    /**
     * User Registration
     * @param {Object} params
     * @param {string} params.name - Full display name
     * @param {string} params.username - Unique alphanumeric handle
     * @param {string} params.birthDate - YYYY-MM-DD
     * @param {string} params.email - Private email
     * @param {string} params.password
     * @param {string} params.passwordConfirm
     * @returns {Promise<{ success: boolean, user?: Object, session?: Object, needsVerification?: boolean, rateLimited?: boolean, retryAfter?: number, error?: string }>}
     */
    async signUp({ name, username, birthDate, email, password, passwordConfirm }) {
        // 1. Client-Side Anti-Hammering Rate Limiting
        const now = Date.now();
        const cooldownMs = (CONFIG.REGISTRATION_COOLDOWN_SECONDS || 5) * 1000;
        const elapsed = now - this._lastSignUpAttempt;
        if (elapsed < cooldownMs) {
            const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
            return {
                success: false,
                rateLimited: true,
                retryAfter: remaining,
                error: `Please wait ${remaining} second${remaining > 1 ? 's' : ''} before submitting again.`
            };
        }
        this._lastSignUpAttempt = now;

        // 2. Client-Side Field Validation
        const trimmedName = (name || '').trim();
        const cleanedUsername = (username || '').trim().toLowerCase().replace(/^@/, '');
        const trimmedEmail = (email || '').trim().toLowerCase();

        if (!trimmedName || trimmedName.length < 2) {
            return { success: false, error: 'Full name must be at least 2 characters.' };
        }

        if (!CONFIG.USERNAME_REGEX.test(cleanedUsername)) {
            return { 
                success: false, 
                error: 'Username must be 3-30 characters (letters, numbers, and underscores only).' 
            };
        }

        const ageCheck = this.calculateAge(birthDate);
        if (!ageCheck.isCompliant) {
            return { 
                success: false, 
                error: ageCheck.error || `You must be at least ${CONFIG.MIN_AGE_YEARS} years old to join ImdConnect.` 
            };
        }

        if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            return { success: false, error: 'A valid email address is required.' };
        }

        if (!password || password.length < CONFIG.PASSWORD_MIN_LENGTH) {
            return { 
                success: false, 
                error: `Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters long.` 
            };
        }

        if (password !== passwordConfirm) {
            return { success: false, error: 'Password and password confirmation do not match.' };
        }

        // 3. Pre-flight Username Availability Check
        const availability = await this.checkUsernameAvailability(cleanedUsername);
        if (!availability.available) {
            return { 
                success: false, 
                error: availability.error || `The username "${cleanedUsername}" is already taken. Please choose another.` 
            };
        }

        // 4. Dispatch Supabase Auth Registration
        try {
            const { data, error } = await supabase.auth.signUp({
                email: trimmedEmail,
                password: password,
                options: {
                    data: {
                        username: cleanedUsername,
                        display_name: trimmedName,
                        birth_date: birthDate
                    },
                    emailRedirectTo: window.location.origin + '/#/auth/login'
                }
            });

            if (error) {
                console.error('[AuthService] Sign up error:', error);
                
                // Friendly error translation
                const errMsg = error.message || '';
                const errStatus = error.status || 0;

                if (errStatus === 429 || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('over_email_send_rate_limit')) {
                    return {
                        success: false,
                        rateLimited: true,
                        retryAfter: 30,
                        error: 'Too many registration requests. Please wait a moment before trying again.'
                    };
                }

                if (errMsg.toLowerCase().includes('already registered') || errMsg.toLowerCase().includes('already in use')) {
                    return {
                        success: false,
                        error: 'An account with this email address already exists. Please sign in instead.'
                    };
                }

                if (errMsg.includes('chk_profiles_username_format') || errMsg.includes('Username must be 3-30')) {
                    return {
                        success: false,
                        error: 'Username format is invalid. Use 3-30 lowercase letters, numbers, or underscores.'
                    };
                }

                if (errMsg.includes('chk_profiles_min_age') || errMsg.includes('at least 13 years old')) {
                    return {
                        success: false,
                        error: `Registration failed: You must be at least ${CONFIG.MIN_AGE_YEARS} years old to join ImdConnect.`
                    };
                }

                if (errMsg.includes('profiles_username_key') || errMsg.includes('already registered')) {
                    return {
                        success: false,
                        error: `The username "${cleanedUsername}" is already taken. Please choose another.`
                    };
                }

                return { success: false, error: errMsg || 'Registration failed. Please try again.' };
            }

            const user = data.user;
            const session = data.session;
            const needsVerification = !session && user && !user.email_confirmed_at;

            return {
                success: true,
                user,
                session,
                needsVerification
            };
        } catch (err) {
            console.error('[AuthService] Sign up exception:', err);
            return { success: false, error: 'An unexpected network error occurred.' };
        }
    }

    /**
     * User Login (Supports both Username and Email with zero plaintext password storage)
     * @param {Object} params
     * @param {string} params.identifier - @username or user@example.com
     * @param {string} params.password
     * @param {boolean} [params.rememberMe=true]
     * @returns {Promise<{ success: boolean, session?: Object, user?: Object, error?: string, deactivated?: boolean }>}
     */
    async login({ identifier, password, rememberMe = true }) {
        const rawId = (identifier || '').trim();
        if (!rawId || !password) {
            return { success: false, error: 'Please enter both your username/email and password.' };
        }

        let loginEmail = null;
        let isDeactivated = false;

        // Check if identifier is an email address
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawId);

        if (isEmail) {
            loginEmail = rawId.toLowerCase();
        } else {
            // Username lookup via timing-safe cryptographic RPC
            const cleanedUsername = rawId.toLowerCase().replace(/^@/, '');
            
            try {
                const { data, error } = await supabase.rpc('authenticate_with_username', {
                    p_username: cleanedUsername,
                    p_password: password
                });

                if (error || !data || data.length === 0) {
                    // Constant generic error to prevent account discovery
                    return { success: false, error: 'Invalid username, email, or password.' };
                }

                const result = data[0];
                if (result.is_suspended) {
                    return { success: false, error: 'This account has been suspended for terms violations.' };
                }

                loginEmail = result.email;
                isDeactivated = Boolean(result.is_deactivated);
            } catch (err) {
                console.error('[AuthService] Username authentication lookup failed:', err);
                return { success: false, error: 'Invalid username, email, or password.' };
            }
        }

        // Authenticate with Supabase Auth using the validated email & password
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password: password
            });

            if (error) {
                console.error('[AuthService] Login error:', error);
                if (error.message?.includes('Email not confirmed')) {
                    return { 
                        success: false, 
                        needsVerification: true,
                        email: loginEmail,
                        error: 'Please verify your email address before logging in.' 
                    };
                }
                return { success: false, error: 'Invalid username, email, or password.' };
            }

            // Auto-reactivate account if it was deactivated
            if (isDeactivated) {
                try {
                    await supabase.rpc('reactivate_account');
                } catch (reActErr) {
                    console.warn('[AuthService] Reactivation warning:', reActErr);
                }
            }

            return {
                success: true,
                session: data.session,
                user: data.user
            };
        } catch (err) {
            console.error('[AuthService] Sign in exception:', err);
            return { success: false, error: 'An unexpected authentication error occurred.' };
        }
    }

    /**
     * Log out of current device session
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async logout() {
        try {
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('[AuthService] Logout error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Log out of ALL active sessions on all devices
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async logoutAllSessions() {
        try {
            const { error } = await supabase.auth.signOut({ scope: 'global' });
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('[AuthService] Logout all sessions error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Request Password Reset Email (Rate-limited, zero account leakage)
     * @param {string} email 
     * @returns {Promise<{ success: boolean, error?: string, message: string }>}
     */
    async forgotPassword(email) {
        const trimmedEmail = (email || '').trim().toLowerCase();
        if (!trimmedEmail) {
            return { success: false, error: 'Please enter your account email address.' };
        }

        // Rate limit check
        const now = Date.now();
        const elapsed = (now - this._lastPasswordResetRequest) / 1000;
        if (elapsed < CONFIG.PASSWORD_RESET_COOLDOWN_SECONDS) {
            const waitTime = Math.ceil(CONFIG.PASSWORD_RESET_COOLDOWN_SECONDS - elapsed);
            return { 
                success: false, 
                error: `Please wait ${waitTime} seconds before requesting another reset email.` 
            };
        }

        this._lastPasswordResetRequest = now;

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
                redirectTo: window.location.origin + '/#/auth/reset-password'
            });

            if (error) {
                console.warn('[AuthService] Reset password warning:', error);
            }

            // Always return constant message to prevent email harvesting
            return {
                success: true,
                message: 'If an account exists with this email, password reset instructions have been sent.'
            };
        } catch (err) {
            return {
                success: true,
                message: 'If an account exists with this email, password reset instructions have been sent.'
            };
        }
    }

    /**
     * Reset Password after clicking email recovery link
     * @param {string} newPassword 
     * @param {string} confirmPassword 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async resetPassword(newPassword, confirmPassword) {
        if (!newPassword || newPassword.length < CONFIG.PASSWORD_MIN_LENGTH) {
            return { 
                success: false, 
                error: `Password must be at least ${CONFIG.PASSWORD_MIN_LENGTH} characters long.` 
            };
        }

        if (newPassword !== confirmPassword) {
            return { success: false, error: 'Passwords do not match.' };
        }

        try {
            const { data, error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) {
                return { success: false, error: error.message || 'Password update failed.' };
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: 'Network error updating password.' };
        }
    }

    /**
     * Change Password while authenticated
     * @param {string} newPassword 
     * @param {string} confirmPassword 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async changePassword(newPassword, confirmPassword) {
        return this.resetPassword(newPassword, confirmPassword);
    }

    /**
     * Resend verification email
     * @param {string} email 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async resendVerificationEmail(email) {
        const trimmedEmail = (email || '').trim().toLowerCase();
        if (!trimmedEmail) return { success: false, error: 'Email is required.' };

        const now = Date.now();
        const elapsed = (now - this._lastResendVerification) / 1000;
        if (elapsed < CONFIG.RESEND_COOLDOWN_SECONDS) {
            const waitTime = Math.ceil(CONFIG.RESEND_COOLDOWN_SECONDS - elapsed);
            return { success: false, error: `Please wait ${waitTime} seconds before resending.` };
        }

        this._lastResendVerification = now;

        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: trimmedEmail
            });

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('[AuthService] Resend error:', err);
            return { success: false, error: err.message || 'Could not resend email.' };
        }
    }

    /**
     * Account Deactivation
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async deactivateAccount() {
        try {
            const { error } = await supabase.rpc('deactivate_account');
            if (error) throw error;
            await this.logout();
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message || 'Deactivation failed.' };
        }
    }

    /**
     * Complete Account Deletion (GDPR / Privacy Cascade)
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async deleteAccount() {
        try {
            const { error } = await supabase.rpc('delete_account');
            if (error) throw error;
            await this.logout();
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message || 'Account deletion failed.' };
        }
    }

    /**
     * Get Current Active Session
     * @returns {Promise<Object|null>}
     */
    async getSession() {
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error || !data) return null;
            return data.session;
        } catch (err) {
            return null;
        }
    }

    /**
     * Get Current Authenticated User
     * @returns {Promise<Object|null>}
     */
    async getUser() {
        try {
            const { data, error } = await supabase.auth.getUser();
            if (error || !data) return null;
            return data.user;
        } catch (err) {
            return null;
        }
    }

    /**
     * Get Current Authenticated User Profile
     * @returns {Promise<Object|null>}
     */
    async getProfile() {
        try {
            const user = await this.getUser();
            if (!user) return null;
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            return data;
        } catch (err) {
            return null;
        }
    }

    /**
     * Check if authenticated user has admin/moderator role
     * @returns {Promise<boolean>}
     */
    async isAdmin() {
        try {
            const profile = await this.getProfile();
            return profile && (profile.role === 'admin' || profile.role === 'moderator');
        } catch (err) {
            return false;
        }
    }

    /**
     * Subscribe to Auth State Changes
     * @param {Function} callback 
     * @returns {{ unsubscribe: Function }}
     */
    onAuthStateChange(callback) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });
        return subscription;
    }
}

export const authService = new AuthService();
