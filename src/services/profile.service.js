// ==============================================================================
// ImdConnect — Profile Service
// Handles profile retrieval, identity updates, 7-day username change cooldown,
// and privacy-respecting profile resolution.
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { CONFIG } from '../config.js';
import { storageService } from './storage.service.js';
import { authService } from './auth.service.js';
import { notificationService } from './notification.service.js';

class ProfileService {
    /**
     * Get user profile safely respecting privacy settings and never exposing DOB publicly
     * @param {Object} options
     * @param {string} [options.userId] - User UUID (defaults to current authenticated user)
     * @param {string} [options.username] - User handle without @
     * @returns {Promise<{ success: boolean, profile?: Object, error?: string }>}
     */
    async getProfile({ userId, username } = {}) {
        try {
            // Attempt RPC with privacy and relation awareness
            const { data, error } = await supabase.rpc('get_user_profile_safe', {
                p_user_id: userId || null,
                p_username: username ? username.toLowerCase().replace(/^@/, '') : null
            });

            if (!error && data && data.success) {
                const p = data;
                const joinedDate = p.created_at ? 
                    new Date(p.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 
                    'Recently';

                return {
                    success: true,
                    profile: {
                        ...p,
                        joinedDateFormatted: joinedDate
                    }
                };
            }

            // Fallback for current user direct query
            const currentUser = await authService.getUser();
            const targetId = userId || currentUser?.id;
            if (!targetId) {
                return { success: false, error: 'User not found.' };
            }

            const { data: directProfile, error: pError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', targetId)
                .single();

            if (pError || !directProfile) {
                return { success: false, error: 'Could not load profile.' };
            }

            // Calculate stats counts
            const { count: fCount } = await supabase
                .from('friendships')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', targetId);

            const { count: gCount } = await supabase
                .from('group_members')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', targetId);

            const isSelf = currentUser && currentUser.id === targetId;
            const joinedDate = directProfile.created_at ? 
                new Date(directProfile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 
                'Recently';

            return {
                success: true,
                profile: {
                    id: directProfile.id,
                    username: directProfile.username,
                    display_name: directProfile.display_name,
                    bio: directProfile.bio,
                    avatar_url: directProfile.avatar_url,
                    banner_url: directProfile.banner_url,
                    friends_count: fCount || 0,
                    groups_count: gCount || 0,
                    created_at: directProfile.created_at,
                    joinedDateFormatted: joinedDate,
                    is_self: isSelf,
                    is_restricted: false,
                    last_username_change_at: directProfile.last_username_change_at,
                    // Strictly hide DOB from others
                    birth_date: isSelf ? directProfile.birth_date : null
                }
            };
        } catch (err) {
            console.error('[ProfileService] getProfile exception:', err);
            return { success: false, error: 'Network error loading profile.' };
        }
    }

    /**
     * Update Profile Display Name and Bio
     * @param {Object} params
     * @param {string} params.displayName
     * @param {string} params.bio
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async updateProfile({ displayName, bio }) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Authentication required.' };

        const cleanName = (displayName || '').trim();
        const cleanBio = (bio || '').trim();

        if (!cleanName || cleanName.length < 2) {
            return { success: false, error: 'Display name must be at least 2 characters.' };
        }

        if (cleanName.length > 100) {
            return { success: false, error: 'Display name must not exceed 100 characters.' };
        }

        if (cleanBio.length > 500) {
            return { success: false, error: 'Bio must not exceed 500 characters.' };
        }

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    display_name: cleanName,
                    bio: cleanBio,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (error) {
                console.error('[ProfileService] updateProfile error:', error);
                return { success: false, error: error.message };
            }

            // Sync auth metadata
            try {
                await supabase.auth.updateUser({
                    data: { display_name: cleanName }
                });
            } catch (authErr) {
                console.warn('[ProfileService] Auth metadata sync warning:', authErr);
            }

            return { success: true };
        } catch (err) {
            console.error('[ProfileService] updateProfile exception:', err);
            return { success: false, error: 'Network error updating profile.' };
        }
    }

    /**
     * Upload and update user avatar image
     * @param {File} file 
     * @returns {Promise<{ success: boolean, url?: string, error?: string }>}
     */
    async updateAvatar(file) {
        return storageService.uploadAvatar(file);
    }

    /**
     * Upload and update user cover banner image
     * @param {File} file 
     * @returns {Promise<{ success: boolean, url?: string, error?: string }>}
     */
    async updateCover(file) {
        return storageService.uploadCover(file);
    }

    /**
     * Get username change eligibility status (7-day cooldown rule)
     * @returns {Promise<{ canChange: boolean, currentUsername: string, lastChangedAt: string|null, nextAvailableAt: string, daysRemaining: number, formattedNextDate: string, error?: string }>}
     */
    async getUsernameEligibility() {
        try {
            const { data, error } = await supabase.rpc('get_username_change_eligibility');
            if (!error && data) {
                const nextDate = data.next_available_at ? new Date(data.next_available_at) : new Date();
                const formattedNextDate = nextDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                return {
                    canChange: Boolean(data.can_change),
                    currentUsername: data.current_username,
                    lastChangedAt: data.last_username_change_at,
                    nextAvailableAt: data.next_available_at,
                    secondsRemaining: data.seconds_remaining || 0,
                    daysRemaining: data.days_remaining || 0,
                    formattedNextDate
                };
            }

            // Fallback: direct profiles query
            const user = await authService.getUser();
            if (!user) throw new Error('Unauthenticated');

            const { data: p } = await supabase
                .from('profiles')
                .select('username, last_username_change_at')
                .eq('id', user.id)
                .single();

            if (!p) throw new Error('Profile missing');

            const lastChanged = p.last_username_change_at ? new Date(p.last_username_change_at) : null;
            if (!lastChanged) {
                return {
                    canChange: true,
                    currentUsername: p.username,
                    lastChangedAt: null,
                    nextAvailableAt: new Date().toISOString(),
                    secondsRemaining: 0,
                    daysRemaining: 0,
                    formattedNextDate: 'Immediately'
                };
            }

            const nextAllowedMs = lastChanged.getTime() + (7 * 24 * 60 * 60 * 1000);
            const nowMs = Date.now();
            const canChange = nowMs >= nextAllowedMs;
            const diffMs = Math.max(0, nextAllowedMs - nowMs);
            const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
            const nextDate = new Date(nextAllowedMs);

            return {
                canChange,
                currentUsername: p.username,
                lastChangedAt: p.last_username_change_at,
                nextAvailableAt: nextDate.toISOString(),
                secondsRemaining: Math.ceil(diffMs / 1000),
                daysRemaining,
                formattedNextDate: nextDate.toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            };
        } catch (err) {
            console.error('[ProfileService] getUsernameEligibility exception:', err);
            return {
                canChange: false,
                currentUsername: '',
                lastChangedAt: null,
                nextAvailableAt: '',
                secondsRemaining: 0,
                daysRemaining: 7,
                formattedNextDate: 'Unknown',
                error: 'Could not fetch username eligibility.'
            };
        }
    }

    /**
     * Change username with strict 7-day cooldown and global uniqueness enforcement
     * @param {string} newUsername 
     * @returns {Promise<{ success: boolean, newUsername?: string, nextAvailableAt?: string, error?: string }>}
     */
    async changeUsername(newUsername) {
        const cleaned = (newUsername || '').trim().toLowerCase().replace(/^@/, '');

        if (!CONFIG.USERNAME_REGEX.test(cleaned)) {
            return {
                success: false,
                error: 'Username must be 3-30 lowercase characters (letters, numbers, and underscores only).'
            };
        }

        try {
            // First call atomic RPC
            const { data, error } = await supabase.rpc('update_username', {
                p_new_username: cleaned
            });

            if (error) {
                console.error('[ProfileService] update_username RPC error:', error);
                return { success: false, error: error.message };
            }

            if (data && !data.success) {
                return {
                    success: false,
                    error: data.error,
                    nextAvailableAt: data.next_available_at,
                    daysRemaining: data.days_remaining
                };
            }

            // Dispatch security alert for username change
            notificationService.sendSecurityAlert({
                title: 'Username Changed',
                body: `Your username was successfully changed to @${data?.new_username || cleaned}.`,
                data: { event: 'username_change', new_username: data?.new_username || cleaned }
            }).catch(e => console.warn('[ProfileService] Security alert dispatch non-fatal error:', e));

            return {
                success: true,
                newUsername: data?.new_username || cleaned,
                nextAvailableAt: data?.next_available_at
            };
        } catch (err) {
            console.error('[ProfileService] changeUsername exception:', err);
            return { success: false, error: 'Network error updating username.' };
        }
    }
}

export const profileService = new ProfileService();
