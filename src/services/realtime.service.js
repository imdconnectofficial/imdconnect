// ==============================================================================
// ImdConnect — Realtime Service (Phoenix WSS Channels)
// Subscribes to new text messages, broadcasts typing, and presence tracking
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class RealtimeService {
    constructor() {
        this.activeChannels = new Map();
        this.messageListeners = new Set();
    }

    /**
     * Subscribe to live incoming text messages
     * @param {Function} callback 
     */
    subscribeToMessages(callback) {
        this.messageListeners.add(callback);

        if (!this.activeChannels.has('global-messages')) {
            const channel = supabase
                .channel('public:messages')
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'messages' },
                    (payload) => {
                        this.messageListeners.forEach(cb => cb(payload.new));
                    }
                )
                .subscribe();

            this.activeChannels.set('global-messages', channel);
        }

        return () => {
            this.messageListeners.delete(callback);
        };
    }

    /**
     * Broadcast ephemeral typing indicator
     * @param {string} conversationId 
     * @param {string} username 
     */
    async broadcastTyping(conversationId, username) {
        const channelName = `typing:${conversationId}`;
        let channel = this.activeChannels.get(channelName);

        if (!channel) {
            channel = supabase.channel(channelName);
            this.activeChannels.set(channelName, channel);
            await channel.subscribe();
        }

        await channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { username, timestamp: Date.now() }
        });
    }

    /**
     * Listen for typing indicators in a conversation
     * @param {string} conversationId 
     * @param {Function} callback 
     */
    listenToTyping(conversationId, callback) {
        const channelName = `typing:${conversationId}`;
        let channel = this.activeChannels.get(channelName);

        if (!channel) {
            channel = supabase.channel(channelName);
            this.activeChannels.set(channelName, channel);
        }

        channel
            .on('broadcast', { event: 'typing' }, (payload) => {
                callback(payload.payload);
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
            this.activeChannels.delete(channelName);
        };
    }

    /**
     * Cleanup channels
     */
    cleanup() {
        this.activeChannels.forEach(ch => ch.unsubscribe());
        this.activeChannels.clear();
        this.messageListeners.clear();
    }
}

export const realtimeService = new RealtimeService();
