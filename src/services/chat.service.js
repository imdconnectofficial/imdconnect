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

                return {
                    id: conv.id,
                    type: conv.type,
                    title,
                    peerUsername,
                    avatarUrl,
                    isOnline,
                    disappearingTimer: conv.disappearing_timer,
                    membership,
                    lastMessage: lastMsg ? lastMsg.ciphertext : 'No messages yet',
                    lastMessageTime: lastMsg ? new Date(lastMsg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
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
     * @param {string} conversationId 
     * @returns {Promise<Array>}
     */
    async getMessages(conversationId) {
        const user = await authService.getUser();
        if (!user || !conversationId) return [];

        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[ChatService] getMessages error:', error);
                return [];
            }

            return (data || []).map(m => ({
                id: m.id,
                conversationId: m.conversation_id,
                senderId: m.sender_id,
                isOutgoing: m.sender_id === user.id,
                text: m.ciphertext,
                sentAt: m.sent_at,
                timeFormatted: new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                expiresAt: m.expires_at,
                messageType: m.message_type
            }));
        } catch (err) {
            console.error('[ChatService] getMessages exception:', err);
            return [];
        }
    }

    /**
     * Send a strictly text-only message (Rule 1 & Rule 2)
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
            const { data, error } = await supabase
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    sender_id: user.id,
                    ciphertext: trimmedText,
                    nonce_iv: 'v1_direct',
                    message_type: 'text'
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
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId);

            return { success: true, message: data };
        } catch (err) {
            console.error('[ChatService] Send message exception:', err);
            return { success: false, error: 'Failed to send text message.' };
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

            // Create new conversation
            const { data: conv, error: convErr } = await supabase
                .from('conversations')
                .insert({
                    type: 'direct',
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
            // 1. Create conversation container
            const { data: conv, error: convErr } = await supabase
                .from('conversations')
                .insert({
                    type: 'group',
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
     * @param {string} conversationId 
     * @param {number} timerSeconds 
     * @returns {Promise<{ success: boolean }>}
     */
    async updateDisappearingTimer(conversationId, timerSeconds) {
        const user = await authService.getUser();
        if (!user) return { success: false };

        try {
            const { error } = await supabase
                .from('conversations')
                .update({
                    disappearing_timer: timerSeconds,
                    disappearing_timer_set_by: user.id,
                    disappearing_timer_updated_at: new Date().toISOString()
                })
                .eq('id', conversationId);

            return { success: !error };
        } catch (err) {
            return { success: false };
        }
    }
}

export const chatService = new ChatService();
