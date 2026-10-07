// ==============================================================================
// ImdConnect — Realtime Service (Phoenix WSS Channels)
// Subscribes to new text messages, delivery/read receipts, typing, and presence.
// Uses Supabase Realtime (WSS) exclusively — No Polling.
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class RealtimeService {
    constructor() {
        this.activeChannels = new Map();
        this.globalMessageListeners = new Set();
        this.globalPresenceChannel = null;
    }

    /**
     * Subscribe to a specific conversation thread (Messages, Receipts, Typing, Presence, Disappearing)
     * @param {string} conversationId 
     * @param {Object} handlers 
     * @param {Function} [handlers.onMessage] - Called on new incoming message
     * @param {Function} [handlers.onUpdate] - Called on delivery/read receipts or edits
     * @param {Function} [handlers.onDelete] - Called on message deletion or expiration
     * @param {Function} [handlers.onTyping] - Called on peer typing indicator
     * @param {Function} [handlers.onPresence] - Called on peer presence change
     * @returns {Function} Unsubscribe function
     */
    subscribeToConversation(conversationId, handlers = {}) {
        if (!conversationId) return () => {};

        const channelName = `conversation:${conversationId}`;
        let channel = this.activeChannels.get(channelName);

        if (channel) {
            channel.unsubscribe();
            this.activeChannels.delete(channelName);
        }

        channel = supabase.channel(channelName, {
            config: {
                presence: { key: conversationId },
                broadcast: { self: false }
            }
        });

        // 1. Listen for new text messages (Zero Polling)
        channel.on(
            'postgres_changes',
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages', 
                filter: `conversation_id=eq.${conversationId}` 
            },
            (payload) => {
                if (typeof handlers.onMessage === 'function') {
                    handlers.onMessage(payload.new);
                }
            }
        );

        // 2. Listen for delivery / read receipts updates
        channel.on(
            'postgres_changes',
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'messages', 
                filter: `conversation_id=eq.${conversationId}` 
            },
            (payload) => {
                if (typeof handlers.onUpdate === 'function') {
                    handlers.onUpdate(payload.new);
                }
            }
        );

        // 3. Listen for disappearing messages deletion
        channel.on(
            'postgres_changes',
            { 
                event: 'DELETE', 
                schema: 'public', 
                table: 'messages', 
                filter: `conversation_id=eq.${conversationId}` 
            },
            (payload) => {
                if (typeof handlers.onDelete === 'function') {
                    handlers.onDelete(payload.old);
                }
            }
        );

        // 4. Ephemeral broadcast for typing indicator
        channel.on('broadcast', { event: 'typing' }, (event) => {
            if (typeof handlers.onTyping === 'function') {
                handlers.onTyping(event.payload);
            }
        });

        // 5. Ephemeral broadcast for instant read/delivery receipts
        channel.on('broadcast', { event: 'receipt' }, (event) => {
            if (typeof handlers.onUpdate === 'function') {
                handlers.onUpdate(event.payload);
            }
        });

        // 6. Ephemeral broadcast for screenshot attempt privacy alert
        channel.on('broadcast', { event: 'privacy_alert' }, (event) => {
            if (typeof handlers.onPrivacyAlert === 'function') {
                handlers.onPrivacyAlert(event.payload);
            }
        });

        // 7. Ephemeral broadcast for privacy mode toggle sync
        channel.on('broadcast', { event: 'privacy_mode' }, (event) => {
            if (typeof handlers.onPrivacyMode === 'function') {
                handlers.onPrivacyMode(event.payload);
            }
        });

        // 8. Presence tracking (Online/Offline)
        channel.on('presence', { event: 'sync' }, () => {
            if (typeof handlers.onPresence === 'function') {
                const state = channel.presenceState();
                handlers.onPresence(state);
            }
        });

        channel.on('presence', { event: 'join' }, ({ newPresences }) => {
            if (typeof handlers.onPresence === 'function') {
                handlers.onPresence(channel.presenceState(), { event: 'join', presences: newPresences });
            }
        });

        channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
            if (typeof handlers.onPresence === 'function') {
                handlers.onPresence(channel.presenceState(), { event: 'leave', presences: leftPresences });
            }
        });

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                const user = await authService.getUser();
                if (user) {
                    await channel.track({
                        user_id: user.id,
                        online_at: new Date().toISOString()
                    });
                }
            }
        });

        this.activeChannels.set(channelName, channel);

        return () => {
            channel.unsubscribe();
            this.activeChannels.delete(channelName);
        };
    }

    /**
     * Broadcast typing indicator to conversation channel
     * @param {string} conversationId 
     * @param {Object} payload 
     * @param {string} payload.userId 
     * @param {string} payload.username 
     * @param {boolean} payload.isTyping 
     */
    async broadcastTyping(conversationId, { userId, username, isTyping = true }) {
        const channelName = `conversation:${conversationId}`;
        const channel = this.activeChannels.get(channelName);
        if (!channel) return;

        try {
            await channel.send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    userId,
                    username,
                    isTyping,
                    timestamp: Date.now()
                }
            });
        } catch (err) {
            console.warn('[RealtimeService] broadcastTyping error:', err);
        }
    }

    /**
     * Broadcast instant delivery or read receipt to conversation channel
     * @param {string} conversationId 
     * @param {Object} receiptData 
     */
    async broadcastReceipt(conversationId, receiptData) {
        const channelName = `conversation:${conversationId}`;
        const channel = this.activeChannels.get(channelName);
        if (!channel) return;

        try {
            await channel.send({
                type: 'broadcast',
                event: 'receipt',
                payload: receiptData
            });
        } catch (err) {
            console.warn('[RealtimeService] broadcastReceipt error:', err);
        }
    }

    /**
     * Broadcast privacy alert (e.g. screenshot attempt)
     * @param {string} conversationId 
     * @param {Object} payload 
     */
    async broadcastPrivacyAlert(conversationId, payload) {
        const channelName = `conversation:${conversationId}`;
        const channel = this.activeChannels.get(channelName);
        if (!channel) return;

        try {
            await channel.send({
                type: 'broadcast',
                event: 'privacy_alert',
                payload: {
                    ...payload,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (err) {
            console.warn('[RealtimeService] broadcastPrivacyAlert failed:', err);
        }
    }

    /**
     * Broadcast privacy mode toggle (enabled / disabled)
     * @param {string} conversationId 
     * @param {Object} payload 
     */
    async broadcastPrivacyMode(conversationId, payload) {
        const channelName = `conversation:${conversationId}`;
        const channel = this.activeChannels.get(channelName);
        if (!channel) return;

        try {
            await channel.send({
                type: 'broadcast',
                event: 'privacy_mode',
                payload: {
                    ...payload,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (err) {
            console.warn('[RealtimeService] broadcastPrivacyMode failed:', err);
        }
    }

    /**
     * Subscribe to global messages across all conversations (for sidebar previews & unread badges)
     * @param {Function} callback 
     * @returns {Function} Unsubscribe function
     */
    subscribeToMessages(callback) {
        this.globalMessageListeners.add(callback);

        if (!this.activeChannels.has('global-messages')) {
            const channel = supabase
                .channel('public:messages')
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'messages' },
                    (payload) => {
                        this.globalMessageListeners.forEach(cb => cb(payload.new));
                    }
                )
                .subscribe();

            this.activeChannels.set('global-messages', channel);
        }

        return () => {
            this.globalMessageListeners.delete(callback);
        };
    }

    /**
     * Track user global presence
     * @param {Object} user 
     */
    async trackGlobalPresence(user) {
        if (!user || this.globalPresenceChannel) return;

        this.globalPresenceChannel = supabase.channel('presence:global', {
            config: { presence: { key: user.id } }
        });

        this.globalPresenceChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await this.globalPresenceChannel.track({
                    user_id: user.id,
                    online_at: new Date().toISOString()
                });
            }
        });
    }

    /**
     * Cleanup all active realtime channels
     */
    cleanup() {
        this.activeChannels.forEach(ch => ch.unsubscribe());
        this.activeChannels.clear();
        this.globalMessageListeners.clear();
        if (this.globalPresenceChannel) {
            this.globalPresenceChannel.unsubscribe();
            this.globalPresenceChannel = null;
        }
    }
}

export const realtimeService = new RealtimeService();
