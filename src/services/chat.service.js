// ==============================================================================
// ImdConnect — Chat & Messaging Service (Strictly Text-Only)
// Connects to real Supabase tables: conversations, messages, groups, friendships
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class ChatService {
    /**
     * Fetch all conversations for the authenticated user
     * @returns {Promise<Array>}
     */
    async getConversations() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            // 1. Get conversation memberships
            const { data: memberRows, error: memberErr } = await supabase
                .from('conversation_members')
                .select('conversation_id, role, is_muted, is_pinned, is_archived, last_read_at')
                .eq('user_id', user.id);

            if (memberErr || !memberRows || memberRows.length === 0) {
                return [];
            }

            const convIds = memberRows.map(m => m.conversation_id);

            // 2. Fetch conversations metadata
            const { data: convRows, error: convErr } = await supabase
                .from('conversations')
                .select('*')
                .in('id', convIds)
                .order('updated_at', { ascending: false });

            if (convErr || !convRows) return [];

            // 3. Enrich conversations with peer/group details & latest message
            const enriched = await Promise.all(convRows.map(async (conv) => {
                const membership = memberRows.find(m => m.conversation_id === conv.id);
                let title = 'Conversation';
                let avatarUrl = '';
                let peerUsername = '';
                let isOnline = false;

                if (conv.type === 'group') {
                    const { data: grp } = await supabase
                        .from('groups')
                        .select('name, avatar_url')
                        .eq('conversation_id', conv.id)
                        .single();
                    if (grp) {
                        title = grp.name;
                        avatarUrl = grp.avatar_url;
                    }
                } else {
                    // Direct 1-on-1: find the other participant
                    const { data: peers } = await supabase
                        .from('conversation_members')
                        .select('user_id')
                        .eq('conversation_id', conv.id)
                        .neq('user_id', user.id);

                    if (peers && peers.length > 0) {
                        const peerId = peers[0].user_id;
                        const { data: peerProfile } = await supabase
                            .from('public_profiles')
                            .select('username, display_name, avatar_url, last_seen_at')
                            .eq('id', peerId)
                            .single();

                        if (peerProfile) {
                            title = peerProfile.display_name || `@${peerProfile.username}`;
                            peerUsername = peerProfile.username;
                            avatarUrl = peerProfile.avatar_url;
                            if (peerProfile.last_seen_at) {
                                const diff = (Date.now() - new Date(peerProfile.last_seen_at).getTime()) / 1000;
                                isOnline = diff < 180; // active in last 3 mins
                            }
                        }
                    }
                }

                // 4. Fetch latest text message
                const { data: lastMsgs } = await supabase
                    .from('messages')
                    .select('id, sender_id, ciphertext, sent_at, created_at')
                    .eq('conversation_id', conv.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const lastMsg = lastMsgs && lastMsgs[0] ? lastMsgs[0] : null;

                const isMuted = membership ? !!membership.is_muted : false;
                const hasUnread = lastMsg && lastMsg.sender_id !== user.id && 
                    (!membership?.last_read_at || new Date(lastMsg.sent_at || lastMsg.created_at) > new Date(membership.last_read_at));

                return {
                    id: conv.id,
                    type: conv.type,
                    title,
                    peerUsername,
                    avatarUrl,
                    isOnline,
                    isMuted,
                    hasUnread,
                    disappearingTimer: conv.disappearing_timer,
                    membership,
                    lastMessage: lastMsg ? lastMsg.ciphertext : 'No messages yet',
                    lastMessageTime: lastMsg ? new Date(lastMsg.sent_at || lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                    updatedAt: conv.updated_at
                };
            }));

            return enriched;
        } catch (err) {
            console.error('[ChatService] getConversations error:', err);
            return [];
        }
    }

    /**
     * Fetch message thread for a conversation
     * Filters expired disappearing messages and maps sent, delivered, and read receipt statuses
     * @param {string} conversationId 
     * @returns {Promise<Array>}
     */
    async getMessages(conversationId) {
        const user = await authService.getUser();
        if (!user || !conversationId) return [];

        try {
            const nowIso = new Date().toISOString();
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[ChatService] getMessages error:', error);
                return [];
            }

            const now = Date.now();
            return (data || [])
                .filter(m => {
                    if (m.is_deleted_for_all) return false;
                    if (m.expires_at && new Date(m.expires_at).getTime() <= now) return false;
                    return true;
                })
                .map(m => {
                    const isOutgoing = m.sender_id === user.id;
                    const sentAt = m.sent_at || m.created_at;
                    const deliveredAt = m.delivered_at;
                    const readAt = m.read_at;

                    // Compute receipt state: 'sent' (1 tick) | 'delivered' (2 gray ticks) | 'read' (2 blue ticks)
                    let status = 'sent';
                    if (readAt) status = 'read';
                    else if (deliveredAt) status = 'delivered';

                    return {
                        id: m.id,
                        conversationId: m.conversation_id,
                        senderId: m.sender_id,
                        isOutgoing,
                        text: m.ciphertext,
                        sentAt,
                        deliveredAt,
                        readAt,
                        status,
                        timeFormatted: new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        expiresAt: m.expires_at,
                        messageType: m.message_type
                    };
                });
        } catch (err) {
            console.error('[ChatService] getMessages exception:', err);
            return [];
        }
    }

    /**
     * Send a strictly text-only message (Rule 1 & Rule 2)
     * Rejects any attachments, voice notes, stickers, images, or media files
     * @param {Object} params
     * @param {string} params.conversationId
     * @param {string} params.text
     * @returns {Promise<{ success: boolean, message?: Object, error?: string }>}
     */
    async sendMessage({ conversationId, text }) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'User must be authenticated.' };

        const trimmedText = (text || '').trim();
        if (!trimmedText) return { success: false, error: 'Cannot send empty message.' };

        try {
            const nowIso = new Date().toISOString();
            const { data, error } = await supabase
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    sender_id: user.id,
                    ciphertext: trimmedText,
                    nonce_iv: 'v1_direct',
                    message_type: 'text',
                    sent_at: nowIso
                })
                .select()
                .single();

            if (error) {
                console.error('[ChatService] Send message error:', error);
                return { success: false, error: error.message };
            }

            // Update conversation updated_at timestamp
            await supabase
                .from('conversations')
                .update({ updated_at: nowIso })
                .eq('id', conversationId);

            return { success: true, message: data };
        } catch (err) {
            console.error('[ChatService] Send message exception:', err);
            return { success: false, error: 'Failed to send text message.' };
        }
    }

    /**
     * Mark conversation messages as delivered
     * @param {string} conversationId 
     * @returns {Promise<{ success: boolean, count?: number }>}
     */
    async markMessagesDelivered(conversationId) {
        const user = await authService.getUser();
        if (!user || !conversationId) return { success: false };

        try {
            const { data, error } = await supabase.rpc('mark_conversation_delivered', {
                p_conversation_id: conversationId
            });

            if (!error && data?.success) {
                return { success: true, count: data.marked_delivered_count };
            }

            // Fallback direct table update
            await supabase
                .from('messages')
                .update({ delivered_at: new Date().toISOString() })
                .eq('conversation_id', conversationId)
                .neq('sender_id', user.id)
                .is('delivered_at', null);

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }

    /**
     * Mark conversation messages as read (Read Receipts)
     * @param {string} conversationId 
     * @returns {Promise<{ success: boolean, count?: number }>}
     */
    async markMessagesAsRead(conversationId) {
        const user = await authService.getUser();
        if (!user || !conversationId) return { success: false };

        try {
            const { data, error } = await supabase.rpc('mark_conversation_read', {
                p_conversation_id: conversationId
            });

            if (!error && data?.success) {
                return { success: true, count: data.marked_read_count };
            }

            // Fallback direct table updates
            const now = new Date().toISOString();
            await supabase
                .from('messages')
                .update({ read_at: now, delivered_at: now })
                .eq('conversation_id', conversationId)
                .neq('sender_id', user.id)
                .is('read_at', null);

            await supabase
                .from('conversation_members')
                .update({ last_read_at: now })
                .eq('conversation_id', conversationId)
                .eq('user_id', user.id);

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }

    /**
     * Toggle conversation mute notifications
     * @param {string} conversationId 
     * @returns {Promise<{ success: boolean, isMuted?: boolean }>}
     */
    async toggleConversationMute(conversationId) {
        const user = await authService.getUser();
        if (!user || !conversationId) return { success: false };

        try {
            const { data, error } = await supabase.rpc('toggle_conversation_mute', {
                p_conversation_id: conversationId
            });

            if (!error && data?.success) {
                return { success: true, isMuted: data.is_muted };
            }

            // Fallback direct update
            const { data: member } = await supabase
                .from('conversation_members')
                .select('is_muted')
                .eq('conversation_id', conversationId)
                .eq('user_id', user.id)
                .single();

            const nextMuted = !(member?.is_muted);
            await supabase
                .from('conversation_members')
                .update({ is_muted: nextMuted })
                .eq('conversation_id', conversationId)
                .eq('user_id', user.id);

            return { success: true, isMuted: nextMuted };
        } catch (err) {
            return { success: false };
        }
    }

    /**
     * Purge expired disappearing messages
     * @returns {Promise<{ success: boolean, purgedCount?: number }>}
     */
    async purgeExpiredMessages() {
        try {
            // First call cleanup_expired_messages (primary function)
            const { data, error } = await supabase.rpc('cleanup_expired_messages');
            if (!error && data?.success) {
                return { success: true, purgedCount: data.purged_count };
            }

            // Fallback to purge_expired_messages alias
            const { data: d2, error: e2 } = await supabase.rpc('purge_expired_messages');
            if (!e2 && d2?.success) {
                return { success: true, purgedCount: d2.purged_count };
            }

            // Fallback direct cleanup
            await supabase
                .from('messages')
                .delete()
                .not('expires_at', 'is', null)
                .lte('expires_at', new Date().toISOString());

            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }

    /**
     * Create or retrieve direct conversation with a target user
     * @param {string} targetUserId 
     * @returns {Promise<{ success: boolean, conversationId?: string, error?: string }>}
     */
    async createDirectConversation(targetUserId) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };
        if (user.id === targetUserId) return { success: false, error: 'Cannot chat with yourself.' };

        try {
            // Rule 1: A user cannot message another user before friendship is accepted
            let isFriend = false;
            try {
                const { data, error } = await supabase.rpc('are_friends', { 
                    user_a: user.id, 
                    user_b: targetUserId 
                });
                if (!error && typeof data === 'boolean') {
                    isFriend = data;
                }
            } catch (rpcErr) {
                // Ignore and fall back to table
            }

            if (!isFriend) {
                const { data: fRow } = await supabase
                    .from('friendships')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('friend_id', targetUserId)
                    .maybeSingle();
                isFriend = !!fRow;
            }

            if (!isFriend) {
                return { 
                    success: false, 
                    error: 'You cannot message this user before your friend request is accepted.' 
                };
            }

            // Rule 2: Block rules override messaging permissions
            let isBlocked = false;
            try {
                const { data: blockedMe } = await supabase.rpc('is_blocked_by', { 
                    target_user_id: targetUserId, 
                    check_user_id: user.id 
                });
                const { data: iBlocked } = await supabase.rpc('is_blocked_by', { 
                    target_user_id: user.id, 
                    check_user_id: targetUserId 
                });
                if (blockedMe || iBlocked) isBlocked = true;
            } catch (blockErr) {
                // Ignore and fall back to table
            }

            if (!isBlocked) {
                const { data: bRow } = await supabase
                    .from('blocked_users')
                    .select('id')
                    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${user.id})`)
                    .limit(1);
                if (bRow && bRow.length > 0) isBlocked = true;
            }

            if (isBlocked) {
                return { 
                    success: false, 
                    error: 'Cannot start conversation: Communication is prohibited by block settings.' 
                };
            }

            // Check if conversation already exists
            const { data: myConvs } = await supabase
                .from('conversation_members')
                .select('conversation_id')
                .eq('user_id', user.id);

            if (myConvs && myConvs.length > 0) {
                const convIds = myConvs.map(c => c.conversation_id);
                const { data: existing } = await supabase
                    .from('conversation_members')
                    .select('conversation_id')
                    .eq('user_id', targetUserId)
                    .in('conversation_id', convIds);

                if (existing && existing.length > 0) {
                    return { success: true, conversationId: existing[0].conversation_id };
                }
            }

            // Create new conversation with default 3-minute (180s) disappearing timer
            const { data: conv, error: convErr } = await supabase
                .from('conversations')
                .insert({
                    type: 'direct',
                    disappearing_timer: 180,
                    created_by: user.id
                })
                .select()
                .single();

            if (convErr || !conv) throw convErr;

            // Add creator
            await supabase.from('conversation_members').insert({
                conversation_id: conv.id,
                user_id: user.id,
                role: 'owner'
            });

            // Add peer
            await supabase.from('conversation_members').insert({
                conversation_id: conv.id,
                user_id: targetUserId,
                role: 'member'
            });

            return { success: true, conversationId: conv.id };
        } catch (err) {
            console.error('[ChatService] Create conversation error:', err);
            return { success: false, error: err.message || 'Could not start conversation.' };
        }
    }

    /**
     * Create a new Group
     * @param {Object} params
     * @param {string} params.name
     * @param {string} [params.description]
     * @returns {Promise<{ success: boolean, conversationId?: string, error?: string }>}
     */
    async createGroup({ name, description }) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Unauthenticated' };

        const trimmedName = (name || '').trim();
        if (!trimmedName) return { success: false, error: 'Group name is required.' };

        try {
            // 1. Create conversation container with default 3-minute (180s) disappearing timer
            const { data: conv, error: convErr } = await supabase
                .from('conversations')
                .insert({
                    type: 'group',
                    disappearing_timer: 180,
                    created_by: user.id
                })
                .select()
                .single();

            if (convErr) throw convErr;

            // 2. Create group record
            const { error: grpErr } = await supabase
                .from('groups')
                .insert({
                    conversation_id: conv.id,
                    name: trimmedName,
                    description: (description || '').trim(),
                    owner_id: user.id
                });

            if (grpErr) throw grpErr;

            // 3. Add owner to conversation_members & group_members
            await supabase.from('conversation_members').insert({
                conversation_id: conv.id,
                user_id: user.id,
                role: 'owner'
            });

            await supabase.from('group_members').insert({
                group_id: conv.id,
                user_id: user.id,
                role: 'owner',
                can_invite: true,
                can_pin_messages: true,
                can_change_info: true
            });

            // 4. Create default group settings
            await supabase.from('group_settings').insert({
                group_id: conv.id
            });

            return { success: true, conversationId: conv.id };
        } catch (err) {
            console.error('[ChatService] createGroup error:', err);
            return { success: false, error: err.message || 'Failed to create group.' };
        }
    }

    /**
     * Search users by username
     * @param {string} query 
     * @returns {Promise<Array>}
     */
    async searchUsers(query) {
        const cleaned = (query || '').trim().toLowerCase().replace(/^@/, '');
        if (!cleaned || cleaned.length < 2) return [];

        try {
            const { data, error } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url, bio')
                .ilike('username', `%${cleaned}%`)
                .limit(10);

            if (error) return [];
            return data || [];
        } catch (err) {
            return [];
        }
    }

    /**
     * Get user friends
     * @returns {Promise<Array>}
     */
    async getFriends() {
        const user = await authService.getUser();
        if (!user) return [];

        try {
            const { data: friendshipRows } = await supabase
                .from('friendships')
                .select('friend_id, custom_nickname')
                .eq('user_id', user.id);

            if (!friendshipRows || friendshipRows.length === 0) return [];

            const friendIds = friendshipRows.map(f => f.friend_id);
            const { data: profiles } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url, last_seen_at')
                .in('id', friendIds);

            return (profiles || []).map(p => ({
                id: p.id,
                username: p.username,
                displayName: p.display_name,
                avatarUrl: p.avatar_url,
                isOnline: p.last_seen_at ? ((Date.now() - new Date(p.last_seen_at).getTime()) / 1000 < 180) : false
            }));
        } catch (err) {
            return [];
        }
    }

    /**
     * Update disappearing message timer
     * Allowed durations: 0 (Off), 30s, 60s (1m), 180s (3m, Default), 600s (10m), 3600s (1h), 86400s (24h)
     * @param {string} conversationId 
     * @param {number} timerSeconds 
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async updateDisappearingTimer(conversationId, timerSeconds) {
        const user = await authService.getUser();
        if (!user || !conversationId) return { success: false, error: 'Authentication required.' };

        const allowedDurations = [0, 30, 60, 180, 600, 3600, 86400];
        const sec = parseInt(timerSeconds, 10);
        if (!allowedDurations.includes(sec)) {
            return { success: false, error: 'Invalid disappearing timer duration.' };
        }

        try {
            const { error } = await supabase
                .from('conversations')
                .update({
                    disappearing_timer: sec,
                    disappearing_timer_set_by: user.id,
                    disappearing_timer_updated_at: new Date().toISOString()
                })
                .eq('id', conversationId);

            if (error) {
                console.error('[ChatService] updateDisappearingTimer error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

export const chatService = new ChatService();
