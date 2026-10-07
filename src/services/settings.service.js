// ==============================================================================
// ImdConnect — Settings Service
// Manages Account, Privacy, Notification, Theme, and Security Preferences
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class SettingsService {
    /**
     * Get Privacy Settings for current user
     */
    async getPrivacySettings() {
        const user = await authService.getUser();
        if (!user) return null;

        try {
            const { data, error } = await supabase
                .from('privacy_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) {
                // If row doesn't exist yet, insert default row
                const { data: inserted } = await supabase
                    .from('privacy_settings')
                    .insert({ user_id: user.id })
                    .select()
                    .single();
                return inserted;
            }

            return data;
        } catch (err) {
            console.error('[SettingsService] getPrivacySettings error:', err);
            return null;
        }
    }

    /**
     * Update Privacy Settings
     */
    async updatePrivacySettings(updates) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };

        try {
            const { data, error } = await supabase
                .from('privacy_settings')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('[SettingsService] updatePrivacySettings error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get Notification Settings for current user
     */
    async getNotificationSettings() {
        const user = await authService.getUser();
        if (!user) return null;

        try {
            const { data, error } = await supabase
                .from('notification_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) {
                const { data: inserted } = await supabase
                    .from('notification_settings')
                    .insert({ user_id: user.id })
                    .select()
                    .single();
                return inserted;
            }

            return data;
        } catch (err) {
            console.error('[SettingsService] getNotificationSettings error:', err);
            return null;
        }
    }

    /**
     * Update Notification Settings
     */
    async updateNotificationSettings(updates) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };

        try {
            const { data, error } = await supabase
                .from('notification_settings')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('[SettingsService] updateNotificationSettings error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get User Settings (General / Theme / UX)
     */
    async getUserSettings() {
        const user = await authService.getUser();
        if (!user) return null;

        try {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) {
                const { data: inserted } = await supabase
                    .from('user_settings')
                    .insert({ user_id: user.id })
                    .select()
                    .single();
                return inserted;
            }

            return data;
        } catch (err) {
            console.error('[SettingsService] getUserSettings error:', err);
            return null;
        }
    }

    /**
     * Update User Settings
     */
    async updateUserSettings(updates) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };

        try {
            const { data, error } = await supabase
                .from('user_settings')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('[SettingsService] updateUserSettings error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get Blocked Users list
     */
    async getBlockedUsers() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            const { data: blocks, error } = await supabase
                .from('blocked_users')
                .select('id, blocked_id, reason, created_at')
                .eq('blocker_id', user.id);

            if (error || !blocks || blocks.length === 0) return [];

            const blockedIds = blocks.map(b => b.blocked_id);
            const { data: profiles } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url')
                .in('id', blockedIds);

            return blocks.map(b => {
                const prof = (profiles || []).find(p => p.id === b.blocked_id);
                return {
                    id: b.id,
                    blockedId: b.blocked_id,
                    username: prof?.username || 'unknown',
                    displayName: prof?.display_name || 'Blocked User',
                    avatarUrl: prof?.avatar_url || '',
                    reason: b.reason,
                    createdAt: b.created_at
                };
            });
        } catch (err) {
            console.error('[SettingsService] getBlockedUsers error:', err);
            return [];
        }
    }

    /**
     * Unblock a user
     */
    async unblockUser(blockedId) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };

        try {
            const { error } = await supabase
                .from('blocked_users')
                .delete()
                .eq('blocker_id', user.id)
                .eq('blocked_id', blockedId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Get active sessions for current user
     * @returns {Promise<Array>}
     */
    async getActiveSessions() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            // Try RPC first
            const { data, error } = await supabase.rpc('get_user_sessions');
            if (!error && Array.isArray(data)) {
                return data;
            }

            // Fallback to direct table query
            const { data: sessions, error: tableErr } = await supabase
                .from('user_sessions')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_revoked', false)
                .order('last_active_at', { ascending: false });

            if (tableErr) {
                console.warn('[SettingsService] getActiveSessions table fallback error:', tableErr);
                return [];
            }
            return sessions || [];
        } catch (err) {
            console.error('[SettingsService] getActiveSessions exception:', err);
            return [];
        }
    }

    /**
     * Revoke a specific active session
     * @param {string} sessionId
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async revokeSession(sessionId) {
        if (!sessionId) return { success: false, error: 'Session ID required' };
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };

        try {
            const { data, error } = await supabase.rpc('revoke_user_session', {
                p_session_id: sessionId
            });

            if (!error) return { success: true };

            // Fallback to direct update
            const { error: updErr } = await supabase
                .from('user_sessions')
                .update({ is_revoked: true })
                .eq('id', sessionId)
                .eq('user_id', user.id);

            if (updErr) throw updErr;
            return { success: true };
        } catch (err) {
            console.error('[SettingsService] revokeSession error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Revoke all active sessions for caller (database-level invalidation)
     * @param {string|null} [exceptSessionId=null]
     * @returns {Promise<{ success: boolean, count?: number, error?: string }>}
     */
    async revokeAllSessions(exceptSessionId = null) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };

        try {
            const { data, error } = await supabase.rpc('revoke_all_user_sessions', {
                p_except_session_id: exceptSessionId || null
            });

            if (!error) return { success: true, count: data };

            let query = supabase
                .from('user_sessions')
                .update({ is_revoked: true })
                .eq('user_id', user.id);
            if (exceptSessionId) {
                query = query.neq('id', exceptSessionId);
            }
            const { error: updErr } = await query;
            if (updErr) throw updErr;
            return { success: true };
        } catch (err) {
            console.error('[SettingsService] revokeAllSessions error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get login history audit trail
     * @param {number} [limit=20]
     * @returns {Promise<Array>}
     */
    async getLoginHistory(limit = 20) {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            const { data, error } = await supabase.rpc('get_login_history', {
                p_limit: limit
            });

            if (!error && Array.isArray(data)) {
                return data;
            }

            // Fallback to direct table query
            const { data: history, error: tableErr } = await supabase
                .from('login_history')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (tableErr) {
                console.warn('[SettingsService] getLoginHistory table fallback error:', tableErr);
                return [];
            }
            return history || [];
        } catch (err) {
            console.error('[SettingsService] getLoginHistory exception:', err);
            return [];
        }
    }

    /**
     * Record login audit entry
     * @param {boolean} success
     * @param {string} [failureReason]
     * @returns {Promise<void>}
     */
    async recordLoginAudit(success, failureReason = null) {
        try {
            await supabase.rpc('record_login_audit', {
                p_success: success,
                p_failure_reason: failureReason,
                p_user_agent: navigator.userAgent
            });
        } catch (e) {
            console.warn('[SettingsService] recordLoginAudit non-fatal error:', e);
        }
    }
}

export const settingsService = new SettingsService();
