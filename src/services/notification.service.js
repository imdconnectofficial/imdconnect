// ==============================================================================
// ImdConnect — Notification Service
// Handles unread counts, mark read / mark all read, deletion, 
// real-time subscriptions, and event dispatches across 10 notification types.
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

export const NOTIFICATION_TYPES = {
    NEW_FRIEND_REQUEST: 'NEW_FRIEND_REQUEST',
    FRIEND_REQUEST_ACCEPTED: 'FRIEND_REQUEST_ACCEPTED',
    NEW_MESSAGE: 'NEW_MESSAGE',
    GROUP_INVITATION: 'GROUP_INVITATION',
    ADDED_TO_GROUP: 'ADDED_TO_GROUP',
    REMOVED_FROM_GROUP: 'REMOVED_FROM_GROUP',
    MADE_ADMIN: 'MADE_ADMIN',
    REMOVED_AS_ADMIN: 'REMOVED_AS_ADMIN',
    SCREENSHOT_ATTEMPT: 'SCREENSHOT_ATTEMPT',
    SECURITY_ALERT: 'SECURITY_ALERT'
};

class NotificationService {
    constructor() {
        this._channel = null;
        this._listeners = new Set();
    }

    /**
     * Fetch notifications for current authenticated user
     * @param {Object} options
     * @param {boolean} [options.unreadOnly=false]
     * @param {number} [options.limit=50]
     * @param {number} [options.offset=0]
     * @returns {Promise<{ success: boolean, notifications: Array, error?: string }>}
     */
    async getNotifications({ unreadOnly = false, limit = 50, offset = 0 } = {}) {
        const user = await authService.getUser();
        if (!user) return { success: false, notifications: [], error: 'Not authenticated' };

        try {
            let query = supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (unreadOnly) {
                query = query.eq('is_read', false);
            }

            const { data, error } = await query;
            if (error) {
                console.error('[NotificationService] getNotifications error:', error);
                return { success: false, notifications: [], error: error.message };
            }

            return {
                success: true,
                notifications: (data || []).map(n => this._formatNotification(n))
            };
        } catch (err) {
            console.error('[NotificationService] getNotifications exception:', err);
            return { success: false, notifications: [], error: err.message };
        }
    }

    /**
     * Get count of unread notifications for current user
     * @returns {Promise<number>}
     */
    async getUnreadCount() {
        const user = await authService.getUser();
        if (!user) return 0;

        try {
            // Try RPC first for fast indexed count
            const { data: rpcCount, error: rpcErr } = await supabase.rpc('get_unread_notifications_count');
            if (!rpcErr && typeof rpcCount === 'number') {
                return rpcCount;
            }

            // Fallback to direct query
            const { count, error } = await supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);

            if (error) {
                console.warn('[NotificationService] getUnreadCount fallback error:', error);
                return 0;
            }
            return count || 0;
        } catch (err) {
            console.error('[NotificationService] getUnreadCount exception:', err);
            return 0;
        }
    }

    /**
     * Mark a single notification as read
     * @param {string} notificationId
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async markAsRead(notificationId) {
        if (!notificationId) return { success: false, error: 'Notification ID required' };
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        try {
            // Try RPC first
            const { data: rpcSuccess, error: rpcErr } = await supabase.rpc('mark_notification_read', {
                p_notification_id: notificationId
            });

            if (!rpcErr && rpcSuccess !== undefined) {
                return { success: !!rpcSuccess };
            }

            // Fallback to direct table update
            const { error } = await supabase
                .from('notifications')
                .update({
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('id', notificationId)
                .eq('user_id', user.id);

            if (error) {
                console.error('[NotificationService] markAsRead error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (err) {
            console.error('[NotificationService] markAsRead exception:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Mark all notifications as read for current user
     * @returns {Promise<{ success: boolean, count?: number, error?: string }>}
     */
    async markAllAsRead() {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        try {
            // Try RPC first
            const { data: rpcCount, error: rpcErr } = await supabase.rpc('mark_all_notifications_read');
            if (!rpcErr && typeof rpcCount === 'number') {
                return { success: true, count: rpcCount };
            }

            // Fallback to direct update
            const { error } = await supabase
                .from('notifications')
                .update({
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .eq('is_read', false);

            if (error) {
                console.error('[NotificationService] markAllAsRead fallback error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (err) {
            console.error('[NotificationService] markAllAsRead exception:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Delete a single notification
     * @param {string} notificationId
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async deleteNotification(notificationId) {
        if (!notificationId) return { success: false, error: 'Notification ID required' };
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        try {
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('id', notificationId)
                .eq('user_id', user.id);

            if (error) {
                console.error('[NotificationService] deleteNotification error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (err) {
            console.error('[NotificationService] deleteNotification exception:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Clear all read notifications
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async clearReadNotifications() {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        try {
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('user_id', user.id)
                .eq('is_read', true);

            if (error) {
                console.error('[NotificationService] clearReadNotifications error:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (err) {
            console.error('[NotificationService] clearReadNotifications exception:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Dispatch notification via RPC
     * @param {Object} params
     * @param {string} params.userId
     * @param {string} params.type
     * @param {string} params.title
     * @param {string} params.body
     * @param {Object} [params.data]
     * @returns {Promise<{ success: boolean, notificationId?: string, error?: string }>}
     */
    async dispatchNotification({ userId, type, title, body, data = {} }) {
        if (!userId || !type || !title || !body) {
            return { success: false, error: 'Missing required notification fields' };
        }

        try {
            const { data: newId, error } = await supabase.rpc('dispatch_notification', {
                p_user_id: userId,
                p_type: type,
                p_title: title,
                p_body: body,
                p_data: data
            });

            if (error) {
                console.error('[NotificationService] dispatchNotification error:', error);
                return { success: false, error: error.message };
            }

            return { success: true, notificationId: newId };
        } catch (err) {
            console.error('[NotificationService] dispatchNotification exception:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Record screenshot attempt in conversation
     * @param {string} conversationId
     * @returns {Promise<{ success: boolean, notifiedCount?: number, error?: string }>}
     */
    async recordScreenshotAttempt(conversationId) {
        if (!conversationId) return { success: false, error: 'Conversation ID required' };

        try {
            const { data, error } = await supabase.rpc('record_screenshot_attempt', {
                p_conversation_id: conversationId
            });

            if (error) {
                console.error('[NotificationService] recordScreenshotAttempt error:', error);
                return { success: false, error: error.message };
            }

            return { success: true, notifiedCount: data?.notified_count || 0 };
        } catch (err) {
            console.error('[NotificationService] recordScreenshotAttempt exception:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Send group invitation notification
     * @param {string} groupId
     * @param {string} inviteeId
     * @returns {Promise<{ success: boolean, notificationId?: string, error?: string }>}
     */
    async sendGroupInvitation(groupId, inviteeId) {
        if (!groupId || !inviteeId) return { success: false, error: 'Group ID and Invitee ID required' };

        try {
            const { data, error } = await supabase.rpc('send_group_invitation', {
                p_group_id: groupId,
                p_invitee_id: inviteeId
            });

            if (error) {
                console.error('[NotificationService] sendGroupInvitation error:', error);
                return { success: false, error: error.message };
            }

            if (!data?.success) {
                return { success: false, error: data?.error || 'Could not send invitation' };
            }

            return { success: true, notificationId: data?.notification_id };
        } catch (err) {
            console.error('[NotificationService] sendGroupInvitation exception:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Dispatch SECURITY_ALERT notification for current user
     * @param {Object} params
     * @param {string} params.title
     * @param {string} params.body
     * @param {Object} [params.data]
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async sendSecurityAlert({ title, body, data = {} }) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        return this.dispatchNotification({
            userId: user.id,
            type: NOTIFICATION_TYPES.SECURITY_ALERT,
            title,
            body,
            data
        });
    }

    /**
     * Subscribe to realtime notification changes for user
     * @param {string} userId
     * @param {Function} callback (eventType: 'INSERT'|'UPDATE'|'DELETE', record: Object)
     * @returns {Function} Unsubscribe function
     */
    subscribe(userId, callback) {
        if (!userId || typeof callback !== 'function') return () => {};

        this._listeners.add(callback);

        if (!this._channel) {
            this._channel = supabase
                .channel(`notifications_realtime_${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`
                    },
                    (payload) => {
                        const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'
                        const record = eventType === 'DELETE' 
                            ? payload.old 
                            : this._formatNotification(payload.new);

                        this._listeners.forEach(fn => {
                            try {
                                fn(eventType, record);
                            } catch (e) {
                                console.error('[NotificationService] Realtime listener error:', e);
                            }
                        });
                    }
                )
                .subscribe();
        }

        return () => {
            this._listeners.delete(callback);
            if (this._listeners.size === 0 && this._channel) {
                this._channel.unsubscribe();
                this._channel = null;
            }
        };
    }

    /**
     * Unsubscribe and cleanup all notification streams
     */
    cleanup() {
        this._listeners.clear();
        if (this._channel) {
            this._channel.unsubscribe();
            this._channel = null;
        }
    }

    /**
     * Format raw database record into rich notification object
     * @private
     */
    _formatNotification(record) {
        if (!record) return null;

        // Map legacy lowercase to uppercase
        let normalizedType = record.type;
        if (normalizedType === 'friend_request') normalizedType = NOTIFICATION_TYPES.NEW_FRIEND_REQUEST;
        else if (normalizedType === 'friend_accepted') normalizedType = NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED;
        else if (normalizedType === 'group_invite') normalizedType = NOTIFICATION_TYPES.GROUP_INVITATION;
        else if (normalizedType === 'system_alert') normalizedType = NOTIFICATION_TYPES.SECURITY_ALERT;

        const typeMeta = this.getTypeMetadata(normalizedType);

        return {
            id: record.id,
            userId: record.user_id,
            type: normalizedType,
            title: record.title || typeMeta.defaultTitle,
            body: record.body || '',
            data: record.data || {},
            isRead: !!record.is_read,
            readAt: record.read_at,
            createdAt: record.created_at,
            timeAgo: this.formatTimeAgo(record.created_at),
            icon: typeMeta.icon,
            iconClass: typeMeta.iconClass,
            actionLabel: typeMeta.actionLabel,
            actionType: typeMeta.actionType
        };
    }

    /**
     * Get visual metadata and icons for each notification type
     * @param {string} type
     */
    getTypeMetadata(type) {
        switch (type) {
            case NOTIFICATION_TYPES.NEW_FRIEND_REQUEST:
                return {
                    icon: '👤➕',
                    iconClass: 'notif-icon-friend',
                    defaultTitle: 'New Friend Request',
                    actionLabel: 'View Request',
                    actionType: 'friends_incoming'
                };
            case NOTIFICATION_TYPES.FRIEND_REQUEST_ACCEPTED:
                return {
                    icon: '🤝',
                    iconClass: 'notif-icon-friend-accept',
                    defaultTitle: 'Friend Request Accepted',
                    actionLabel: 'Message',
                    actionType: 'open_chat'
                };
            case NOTIFICATION_TYPES.NEW_MESSAGE:
                return {
                    icon: '💬',
                    iconClass: 'notif-icon-message',
                    defaultTitle: 'New Message',
                    actionLabel: 'Open Chat',
                    actionType: 'open_conversation'
                };
            case NOTIFICATION_TYPES.GROUP_INVITATION:
                return {
                    icon: '✉️',
                    iconClass: 'notif-icon-group-invite',
                    defaultTitle: 'Group Invitation',
                    actionLabel: 'View Group',
                    actionType: 'open_group'
                };
            case NOTIFICATION_TYPES.ADDED_TO_GROUP:
                return {
                    icon: '👥',
                    iconClass: 'notif-icon-group-added',
                    defaultTitle: 'Added to Group',
                    actionLabel: 'Open Group',
                    actionType: 'open_group'
                };
            case NOTIFICATION_TYPES.REMOVED_FROM_GROUP:
                return {
                    icon: '🚪',
                    iconClass: 'notif-icon-group-removed',
                    defaultTitle: 'Removed from Group',
                    actionLabel: 'Dismiss',
                    actionType: 'dismiss'
                };
            case NOTIFICATION_TYPES.MADE_ADMIN:
                return {
                    icon: '👑',
                    iconClass: 'notif-icon-admin-promoted',
                    defaultTitle: 'Promoted to Admin',
                    actionLabel: 'Open Group',
                    actionType: 'open_group'
                };
            case NOTIFICATION_TYPES.REMOVED_AS_ADMIN:
                return {
                    icon: '🛡️',
                    iconClass: 'notif-icon-admin-demoted',
                    defaultTitle: 'Admin Status Changed',
                    actionLabel: 'Dismiss',
                    actionType: 'dismiss'
                };
            case NOTIFICATION_TYPES.SCREENSHOT_ATTEMPT:
                return {
                    icon: '📸',
                    iconClass: 'notif-icon-screenshot',
                    defaultTitle: 'Screenshot Attempt Detected',
                    actionLabel: 'View Chat',
                    actionType: 'open_conversation'
                };
            case NOTIFICATION_TYPES.SECURITY_ALERT:
                return {
                    icon: '⚠️',
                    iconClass: 'notif-icon-security',
                    defaultTitle: 'Security Alert',
                    actionLabel: 'Review Security',
                    actionType: 'open_security'
                };
            default:
                return {
                    icon: '🔔',
                    iconClass: 'notif-icon-default',
                    defaultTitle: 'Notification',
                    actionLabel: 'View',
                    actionType: 'none'
                };
        }
    }

    /**
     * Format timestamp relative time string
     * @param {string} isoString
     */
    formatTimeAgo(isoString) {
        if (!isoString) return '';
        const diffSecs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
        if (diffSecs < 45) return 'Just now';
        if (diffSecs < 90) return '1m ago';
        const mins = Math.floor(diffSecs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours === 1) return '1h ago';
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return new Date(isoString).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });
    }
}

export const notificationService = new NotificationService();
