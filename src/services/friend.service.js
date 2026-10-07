// ==============================================================================
// ImdConnect — Social Friend Service
// Manages user search, friend requests, mutual acceptance, removal, and blocking.
// Enforces: Zero messaging before friendship acceptance, and block overrides.
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class FriendService {
    /**
     * Search users by username or display name
     * Respects blocks and privacy boundaries; never exposes DOB.
     * @param {string} query 
     * @returns {Promise<Array>}
     */
    async searchUsers(query) {
        const cleaned = (query || '').trim().toLowerCase().replace(/^@/, '');
        if (!cleaned) return [];

        try {
            const { data, error } = await supabase.rpc('search_users_social', {
                p_query: cleaned,
                p_limit: 25
            });

            if (!error && data) {
                return data;
            }

            // Fallback if RPC is not yet compiled
            return await this._fallbackSearch(cleaned);
        } catch (err) {
            console.warn('[FriendService] searchUsers error, falling back:', err);
            return await this._fallbackSearch(cleaned);
        }
    }

    /**
     * Fallback search in case RPC is not yet compiled
     * @private
     */
    async _fallbackSearch(cleaned) {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            // Get public profiles matching query
            const { data } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url, bio')
                .or(`username.ilike.%${cleaned}%,display_name.ilike.%${cleaned}%`)
                .neq('id', user.id)
                .limit(20);

            if (!data || data.length === 0) return [];

            const userIds = data.map(p => p.id);

            // Fetch current user friendships with these candidates
            const { data: friends } = await supabase
                .from('friendships')
                .select('friend_id')
                .eq('user_id', user.id)
                .in('friend_id', userIds);
            const friendSet = new Set((friends || []).map(f => f.friend_id));

            // Fetch pending requests in either direction
            const { data: requests } = await supabase
                .from('friend_requests')
                .select('id, sender_id, receiver_id, status')
                .eq('status', 'pending')
                .or(`and(sender_id.eq.${user.id},receiver_id.in.(${userIds.join(',')})),and(receiver_id.eq.${user.id},sender_id.in.(${userIds.join(',')}))`);

            const reqMap = new Map();
            (requests || []).forEach(r => {
                if (r.sender_id === user.id) {
                    reqMap.set(r.receiver_id, { status: 'pending_outgoing', id: r.id });
                } else {
                    reqMap.set(r.sender_id, { status: 'pending_incoming', id: r.id });
                }
            });

            // Fetch blocks
            const { data: blockedList } = await supabase
                .from('blocked_users')
                .select('blocked_id')
                .eq('blocker_id', user.id)
                .in('blocked_id', userIds);
            const blockedSet = new Set((blockedList || []).map(b => b.blocked_id));

            return data.map(p => {
                const isFriend = friendSet.has(p.id);
                const req = reqMap.get(p.id);
                const isBlocked = blockedSet.has(p.id);
                return {
                    id: p.id,
                    username: p.username,
                    display_name: p.display_name,
                    avatar_url: p.avatar_url,
                    bio: p.bio,
                    is_friend: isFriend,
                    request_status: req ? req.status : 'none',
                    request_id: req ? req.id : null,
                    is_blocked_by_me: isBlocked,
                    can_message: isFriend && !isBlocked
                };
            });
        } catch (err) {
            console.error('[FriendService] _fallbackSearch error:', err);
            return [];
        }
    }

    /**
     * Get complete social overview (Friends, Incoming, Outgoing, Blocked)
     * @returns {Promise<{ friends: Array, pending_incoming: Array, pending_outgoing: Array, blocked: Array }>}
     */
    async getSocialOverview() {
        try {
            const { data, error } = await supabase.rpc('get_social_overview');
            if (!error && data && typeof data === 'object') {
                return {
                    friends: data.friends || [],
                    pending_incoming: data.pending_incoming || [],
                    pending_outgoing: data.pending_outgoing || [],
                    blocked: data.blocked || []
                };
            }

            // Fallback manual aggregation
            const [friends, incoming, outgoing, blocked] = await Promise.all([
                this.getFriends(),
                this.getPendingIncoming(),
                this.getPendingOutgoing(),
                this.getBlockedUsers()
            ]);

            return { friends, pending_incoming: incoming, pending_outgoing: outgoing, blocked };
        } catch (err) {
            console.warn('[FriendService] getSocialOverview error, using fallbacks:', err);
            const [friends, incoming, outgoing, blocked] = await Promise.all([
                this.getFriends(),
                this.getPendingIncoming(),
                this.getPendingOutgoing(),
                this.getBlockedUsers()
            ]);
            return { friends, pending_incoming: incoming, pending_outgoing: outgoing, blocked };
        }
    }

    /**
     * Get mutual friends
     * @returns {Promise<Array>}
     */
    async getFriends() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            const { data: rows, error } = await supabase
                .from('friendships')
                .select('friend_id, created_at')
                .eq('user_id', user.id);

            if (error || !rows || rows.length === 0) return [];
            const friendIds = rows.map(r => r.friend_id);

            const { data: profiles } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url, bio, last_seen_at')
                .in('id', friendIds);

            const pMap = new Map((profiles || []).map(p => [p.id, p]));
            return rows.map(f => {
                const p = pMap.get(f.friend_id) || {};
                return {
                    id: f.friend_id,
                    username: p.username || 'unknown',
                    display_name: p.display_name || p.username || 'User',
                    avatar_url: p.avatar_url || null,
                    bio: p.bio || '',
                    friendship_since: f.created_at,
                    is_online: p.last_seen_at ? ((Date.now() - new Date(p.last_seen_at).getTime()) / 1000 < 180) : false
                };
            }).sort((a, b) => a.display_name.localeCompare(b.display_name));
        } catch (err) {
            console.error('[FriendService] getFriends exception:', err);
            return [];
        }
    }

    /**
     * Get pending incoming friend requests
     * @returns {Promise<Array>}
     */
    async getPendingIncoming() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            const { data: reqs, error } = await supabase
                .from('friend_requests')
                .select('id, sender_id, created_at')
                .eq('receiver_id', user.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error || !reqs || reqs.length === 0) return [];
            const senderIds = reqs.map(r => r.sender_id);

            const { data: profiles } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url, bio')
                .in('id', senderIds);

            const pMap = new Map((profiles || []).map(p => [p.id, p]));
            return reqs.map(r => {
                const p = pMap.get(r.sender_id) || {};
                return {
                    request_id: r.id,
                    sender_id: r.sender_id,
                    username: p.username || 'unknown',
                    display_name: p.display_name || p.username || 'User',
                    avatar_url: p.avatar_url || null,
                    bio: p.bio || '',
                    created_at: r.created_at
                };
            });
        } catch (err) {
            console.error('[FriendService] getPendingIncoming exception:', err);
            return [];
        }
    }

    /**
     * Get pending outgoing friend requests
     * @returns {Promise<Array>}
     */
    async getPendingOutgoing() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            const { data: reqs, error } = await supabase
                .from('friend_requests')
                .select('id, receiver_id, created_at')
                .eq('sender_id', user.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error || !reqs || reqs.length === 0) return [];
            const receiverIds = reqs.map(r => r.receiver_id);

            const { data: profiles } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url, bio')
                .in('id', receiverIds);

            const pMap = new Map((profiles || []).map(p => [p.id, p]));
            return reqs.map(r => {
                const p = pMap.get(r.receiver_id) || {};
                return {
                    request_id: r.id,
                    receiver_id: r.receiver_id,
                    username: p.username || 'unknown',
                    display_name: p.display_name || p.username || 'User',
                    avatar_url: p.avatar_url || null,
                    bio: p.bio || '',
                    created_at: r.created_at
                };
            });
        } catch (err) {
            console.error('[FriendService] getPendingOutgoing exception:', err);
            return [];
        }
    }

    /**
     * Get list of blocked users
     * @returns {Promise<Array>}
     */
    async getBlockedUsers() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            const { data: rows, error } = await supabase
                .from('blocked_users')
                .select('id, blocked_id, reason, created_at')
                .eq('blocker_id', user.id)
                .order('created_at', { ascending: false });

            if (error || !rows || rows.length === 0) return [];
            const blockedIds = rows.map(r => r.blocked_id);

            const { data: profiles } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url')
                .in('id', blockedIds);

            const pMap = new Map((profiles || []).map(p => [p.id, p]));
            return rows.map(b => {
                const p = pMap.get(b.blocked_id) || {};
                return {
                    blocked_id: b.blocked_id,
                    username: p.username || 'unknown',
                    display_name: p.display_name || p.username || 'User',
                    avatar_url: p.avatar_url || null,
                    reason: b.reason || '',
                    blocked_at: b.created_at
                };
            });
        } catch (err) {
            console.error('[FriendService] getBlockedUsers exception:', err);
            return [];
        }
    }

    /**
     * Send friend request to another user
     * Handles race conditions and mutual requests safely.
     * @param {string} targetUserId 
     * @returns {Promise<{ success: boolean, status?: string, message?: string, error?: string }>}
     */
    async sendFriendRequest(targetUserId) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Authentication required.' };
        if (user.id === targetUserId) return { success: false, error: 'You cannot add yourself.' };

        try {
            const { data, error } = await supabase.rpc('send_friend_request', {
                p_target_id: targetUserId
            });

            if (!error && data) {
                return data;
            }

            // Fallback direct execution
            return await this._fallbackSendFriendRequest(user.id, targetUserId);
        } catch (err) {
            console.warn('[FriendService] sendFriendRequest RPC failed, falling back:', err);
            return await this._fallbackSendFriendRequest(user.id, targetUserId);
        }
    }

    /**
     * Fallback for sending friend requests
     * @private
     */
    async _fallbackSendFriendRequest(callerId, targetUserId) {
        try {
            // Check target privacy settings
            const { data: targetPrivacy } = await supabase
                .from('privacy_settings')
                .select('friend_request_permissions')
                .eq('user_id', targetUserId)
                .maybeSingle();

            if (targetPrivacy && targetPrivacy.friend_request_permissions === 'nobody') {
                return { success: false, error: 'This user does not accept friend requests.' };
            }

            // Check mutual reverse request
            const { data: mutual } = await supabase
                .from('friend_requests')
                .select('id')
                .eq('sender_id', targetUserId)
                .eq('receiver_id', callerId)
                .eq('status', 'pending')
                .maybeSingle();

            if (mutual) {
                // Auto-accept!
                await supabase
                    .from('friend_requests')
                    .update({ status: 'accepted', updated_at: new Date().toISOString() })
                    .eq('id', mutual.id);

                await supabase.from('friendships').upsert([
                    { user_id: callerId, friend_id: targetUserId },
                    { user_id: targetUserId, friend_id: callerId }
                ]);

                return {
                    success: true,
                    status: 'accepted',
                    message: 'Mutual request detected! You are now friends.'
                };
            }

            // Check existing outgoing request
            const { data: existing } = await supabase
                .from('friend_requests')
                .select('id, status')
                .eq('sender_id', callerId)
                .eq('receiver_id', targetUserId)
                .maybeSingle();

            if (existing) {
                if (existing.status === 'pending') {
                    return { success: false, error: 'Friend request is already pending.', status: 'pending' };
                }
                // Re-open
                await supabase
                    .from('friend_requests')
                    .update({ status: 'pending', updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
                return { success: true, status: 'pending', message: 'Friend request sent.' };
            }

            // Insert new request
            const { error: insErr } = await supabase
                .from('friend_requests')
                .insert({
                    sender_id: callerId,
                    receiver_id: targetUserId,
                    status: 'pending'
                });

            if (insErr) {
                return { success: false, error: insErr.message || 'Could not send request.' };
            }

            return { success: true, status: 'pending', message: 'Friend request sent.' };
        } catch (err) {
            return { success: false, error: 'Failed to send friend request.' };
        }
    }

    /**
     * Accept incoming friend request
     * @param {string} requestId 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async acceptFriendRequest(requestId) {
        try {
            const { data, error } = await supabase.rpc('respond_friend_request', {
                p_request_id: requestId,
                p_action: 'accept'
            });

            if (!error && data) return data;

            // Fallback direct execution
            const user = await authService.getUser();
            if (!user) return { success: false, error: 'Authentication required' };

            const { data: req } = await supabase
                .from('friend_requests')
                .select('sender_id, receiver_id')
                .eq('id', requestId)
                .single();

            if (!req) return { success: false, error: 'Request not found.' };

            await supabase
                .from('friend_requests')
                .update({ status: 'accepted', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            await supabase.from('friendships').upsert([
                { user_id: req.sender_id, friend_id: req.receiver_id },
                { user_id: req.receiver_id, friend_id: req.sender_id }
            ]);

            return { success: true, message: 'Friend request accepted.' };
        } catch (err) {
            return { success: false, error: 'Network error accepting friend request.' };
        }
    }

    /**
     * Reject incoming friend request
     * @param {string} requestId 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async rejectFriendRequest(requestId) {
        try {
            const { data, error } = await supabase.rpc('respond_friend_request', {
                p_request_id: requestId,
                p_action: 'reject'
            });

            if (!error && data) return data;

            // Fallback direct execution
            await supabase
                .from('friend_requests')
                .update({ status: 'rejected', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            return { success: true, message: 'Friend request declined.' };
        } catch (err) {
            return { success: false, error: 'Network error rejecting friend request.' };
        }
    }

    /**
     * Cancel outgoing friend request
     * @param {string} requestId 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async cancelFriendRequest(requestId) {
        try {
            const { data, error } = await supabase.rpc('respond_friend_request', {
                p_request_id: requestId,
                p_action: 'cancel'
            });

            if (!error && data) return data;

            // Fallback direct execution
            await supabase
                .from('friend_requests')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            return { success: true, message: 'Friend request cancelled.' };
        } catch (err) {
            return { success: false, error: 'Network error cancelling friend request.' };
        }
    }

    /**
     * Remove mutual friend
     * Bilaterally purges friendships and cleans up any friend requests.
     * @param {string} friendId 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async removeFriend(friendId) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Authentication required' };

        try {
            const { data, error } = await supabase.rpc('remove_friend', {
                p_friend_id: friendId
            });

            if (!error && data) return data;

            // Fallback direct execution
            await supabase
                .from('friendships')
                .delete()
                .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

            await supabase
                .from('friend_requests')
                .delete()
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`);

            return { success: true, message: 'Friend removed successfully.' };
        } catch (err) {
            return { success: false, error: 'Network error removing friend.' };
        }
    }

    /**
     * Block a user
     * Overrides messaging and severs friendships automatically.
     * @param {string} targetUserId 
     * @param {string} [reason] 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async blockUser(targetUserId, reason = null) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Authentication required' };

        try {
            const { data, error } = await supabase.rpc('block_user_safe', {
                p_target_id: targetUserId,
                p_reason: reason
            });

            if (!error && data) return data;

            // Fallback direct execution
            await supabase
                .from('blocked_users')
                .upsert({
                    blocker_id: user.id,
                    blocked_id: targetUserId,
                    reason: reason || null
                });

            // Clean up friendships and requests
            await this.removeFriend(targetUserId);

            return { success: true, message: 'User blocked successfully.' };
        } catch (err) {
            return { success: false, error: 'Network error blocking user.' };
        }
    }

    /**
     * Unblock a user
     * @param {string} targetUserId 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async unblockUser(targetUserId) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Authentication required' };

        try {
            const { data, error } = await supabase.rpc('unblock_user_safe', {
                p_target_id: targetUserId
            });

            if (!error && data) return data;

            // Fallback direct execution
            await supabase
                .from('blocked_users')
                .delete()
                .eq('blocker_id', user.id)
                .eq('blocked_id', targetUserId);

            return { success: true, message: 'User unblocked successfully.' };
        } catch (err) {
            return { success: false, error: 'Network error unblocking user.' };
        }
    }
}

export const friendService = new FriendService();
