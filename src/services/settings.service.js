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
}

export const settingsService = new SettingsService();
