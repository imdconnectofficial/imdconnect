// ==============================================================================
// ImdConnect — Secure Admin & Moderation Service
// Connects to PostgreSQL RPCs with strict admin authorization.
// Security: Zero plaintext password exposure, no generic private chat browsing,
// controlled moderation workflows for reported content only.
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class AdminService {
    /**
     * Verify whether current user has admin / moderator privileges
     * @returns {Promise<boolean>}
     */
    async isAuthorized() {
        const user = await authService.getUser();
        if (!user) return false;

        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            return profile && (profile.role === 'admin' || profile.role === 'moderator');
        } catch (err) {
            console.error('[AdminService] isAuthorized error:', err);
            return false;
        }
    }

    /**
     * Get All 13 High-Level Dashboard KPI Metrics
     * @returns {Promise<Object>}
     */
    async getAdminStats() {
        try {
            // 1. Try secure Postgres RPC
            const { data, error } = await supabase.rpc('get_admin_dashboard_metrics');
            if (!error && data) {
                return {
                    totalUsers: data.total_users || 0,
                    activeUsers: data.active_users || 0,
                    onlineUsers: data.online_users || 0,
                    newUsers: data.new_users || 0,
                    friendships: data.friendships || 0,
                    pendingRequests: data.pending_requests || 0,
                    personalChats: data.personal_chats || 0,
                    groups: data.groups || 0,
                    messages: data.messages || 0,
                    messagesToday: data.messages_today || 0,
                    reports: data.reports || 0,
                    pendingReports: data.pending_reports || 0,
                    blockedUsers: data.blocked_users || 0,
                    suspendedUsers: data.suspended_users || 0,
                    systemStatus: 'Operational',
                    textOnlyEngine: 'Enforced'
                };
            }

            // 2. Fallback to direct aggregated queries
            const [usersRes, convsRes, grpsRes, repRes, frRes, blkRes] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('conversations').select('*', { count: 'exact', head: true }),
                supabase.from('groups').select('*', { count: 'exact', head: true }),
                supabase.from('reports').select('*', { count: 'exact', head: true }),
                supabase.from('friendships').select('*', { count: 'exact', head: true }),
                supabase.from('blocked_users').select('*', { count: 'exact', head: true })
            ]);

            const { count: pendingReportsCount } = await supabase
                .from('reports')
                .select('*', { count: 'exact', head: true })
                .in('status', ['pending', 'under_review', 'investigating']);

            const { count: suspendedUsersCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('is_suspended', true);

            return {
                totalUsers: usersRes.count || 0,
                activeUsers: (usersRes.count || 0) - (suspendedUsersCount || 0),
                onlineUsers: 1,
                newUsers: usersRes.count || 0,
                friendships: Math.floor((frRes.count || 0) / 2),
                pendingRequests: 0,
                personalChats: (convsRes.count || 0) - (grpsRes.count || 0),
                groups: grpsRes.count || 0,
                messages: 0,
                messagesToday: 0,
                reports: repRes.count || 0,
                pendingReports: pendingReportsCount || 0,
                blockedUsers: blkRes.count || 0,
                suspendedUsers: suspendedUsersCount || 0,
                systemStatus: 'Operational',
                textOnlyEngine: 'Enforced'
            };
        } catch (err) {
            console.error('[AdminService] getAdminStats error:', err);
            return {
                totalUsers: 0,
                activeUsers: 0,
                onlineUsers: 0,
                newUsers: 0,
                friendships: 0,
                pendingRequests: 0,
                personalChats: 0,
                groups: 0,
                messages: 0,
                messagesToday: 0,
                reports: 0,
                pendingReports: 0,
                blockedUsers: 0,
                suspendedUsers: 0,
                systemStatus: 'Degraded',
                textOnlyEngine: 'Enforced'
            };
        }
    }

    /**
     * Query Users list with filters (Plaintext passwords NEVER exposed)
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async getUsers({ search = '', status = '', role = '', limit = 50, offset = 0 } = {}) {
        try {
            // Try RPC first
            const { data, error } = await supabase.rpc('admin_get_users', {
                p_search: search || null,
                p_status: status || null,
                p_role: role || null,
                p_limit: limit,
                p_offset: offset
            });

            if (!error && Array.isArray(data)) {
                return data;
            }

            // Fallback direct query
            let query = supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url, bio, role, status, is_suspended, created_at, last_seen_at')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (search) {
                query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
            }

            if (role) {
                query = query.eq('role', role);
            }

            if (status === 'suspended') {
                query = query.eq('is_suspended', true);
            } else if (status === 'banned') {
                query = query.eq('status', 'banned');
            } else if (status === 'active') {
                query = query.eq('is_suspended', false);
            }

            const { data: rows, error: qErr } = await query;
            if (qErr) throw qErr;
            return rows || [];
        } catch (err) {
            console.error('[AdminService] getUsers error:', err);
            return [];
        }
    }

    /**
     * Get Detailed User Profile for Admin Inspection Modal
     * Plaintext passwords are NEVER stored or returned.
     * @param {string} userId 
     * @returns {Promise<Object|null>}
     */
    async getUserProfile(userId) {
        if (!userId) return null;
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url, banner_url, bio, role, status, is_suspended, created_at, last_seen_at')
                .eq('id', userId)
                .single();

            if (error || !profile) return null;

            const [{ count: fCount }, { count: gCount }] = await Promise.all([
                supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('user_id', userId),
                supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('user_id', userId)
            ]);

            return {
                ...profile,
                friendsCount: fCount || 0,
                groupsCount: gCount || 0
            };
        } catch (err) {
            console.error('[AdminService] getUserProfile error:', err);
            return null;
        }
    }

    /**
     * Moderate User (Suspend / Unsuspend / Ban / Unban / Delete)
     * @param {Object} params
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async moderateUser({ userId, action, reason }) {
        if (!userId || !action) return { success: false, error: 'User ID and action required' };

        try {
            // Try RPC first
            const { error: rpcErr } = await supabase.rpc('admin_moderate_user', {
                p_user_id: userId,
                p_action: action,
                p_reason: reason || null
            });

            if (!rpcErr) return { success: true };

            // Fallback direct execution
            const adminUser = await authService.getUser();
            if (!adminUser) return { success: false, error: 'Unauthenticated' };

            if (action === 'suspend') {
                await supabase.from('profiles').update({ is_suspended: true, status: 'suspended', updated_at: new Date().toISOString() }).eq('id', userId);
            } else if (action === 'unsuspend') {
                await supabase.from('profiles').update({ is_suspended: false, status: 'active', updated_at: new Date().toISOString() }).eq('id', userId);
            } else if (action === 'ban') {
                await supabase.from('profiles').update({ is_suspended: true, is_banned: true, status: 'banned', updated_at: new Date().toISOString() }).eq('id', userId);
            } else if (action === 'unban') {
                await supabase.from('profiles').update({ is_suspended: false, is_banned: false, status: 'active', updated_at: new Date().toISOString() }).eq('id', userId);
            } else if (action === 'delete') {
                await supabase.from('profiles').delete().eq('id', userId);
            }

            await supabase.from('moderation_records').insert({
                user_id: userId,
                moderator_id: adminUser.id,
                action: action === 'suspend' ? 'temporary_suspension' : (action === 'ban' ? 'permanent_ban' : action),
                reason: reason || 'Admin moderation action'
            });

            return { success: true };
        } catch (err) {
            console.error('[AdminService] moderateUser error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Query Groups list with owner and status info
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async getGroups({ search = '', limit = 50, offset = 0 } = {}) {
        try {
            const { data, error } = await supabase.rpc('admin_get_groups', {
                p_search: search || null,
                p_limit: limit,
                p_offset: offset
            });

            if (!error && Array.isArray(data)) {
                return data.map(g => ({
                    ...g,
                    ownerName: g.owner_display_name || `@${g.owner_username || 'user'}`
                }));
            }

            // Fallback direct query
            let query = supabase
                .from('groups')
                .select('conversation_id, name, description, avatar_url, owner_id, is_suspended, suspension_reason, created_at')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (search) {
                query = query.ilike('name', `%${search}%`);
            }

            const { data: rows, error: qErr } = await query;
            if (qErr) throw qErr;

            if (rows && rows.length > 0) {
                const ownerIds = rows.map(g => g.owner_id);
                const { data: owners } = await supabase
                    .from('public_profiles')
                    .select('id, username, display_name')
                    .in('id', ownerIds);

                return rows.map(g => {
                    const owner = (owners || []).find(o => o.id === g.owner_id);
                    return {
                        ...g,
                        owner_username: owner?.username || 'user',
                        owner_display_name: owner?.display_name || 'Owner',
                        ownerName: owner?.display_name || `@${owner?.username || 'user'}`,
                        members_count: 0
                    };
                });
            }

            return rows || [];
        } catch (err) {
            console.error('[AdminService] getGroups error:', err);
            return [];
        }
    }

    /**
     * Get Members of a specific Group
     * @param {string} groupId 
     * @returns {Promise<Array>}
     */
    async getGroupMembers(groupId) {
        if (!groupId) return [];
        try {
            const { data, error } = await supabase.rpc('admin_get_group_members', {
                p_group_id: groupId
            });

            if (!error && Array.isArray(data)) {
                return data;
            }

            // Fallback
            const { data: members, error: mErr } = await supabase
                .from('group_members')
                .select('user_id, role, joined_at')
                .eq('group_id', groupId);

            if (mErr || !members) return [];

            const userIds = members.map(m => m.user_id);
            const { data: profiles } = await supabase
                .from('public_profiles')
                .select('id, username, display_name, avatar_url')
                .in('id', userIds);

            return members.map(m => {
                const p = (profiles || []).find(prof => prof.id === m.user_id);
                return {
                    user_id: m.user_id,
                    username: p?.username || 'user',
                    display_name: p?.display_name || 'Member',
                    avatar_url: p?.avatar_url || '',
                    role: m.role,
                    joined_at: m.joined_at
                };
            });
        } catch (err) {
            console.error('[AdminService] getGroupMembers error:', err);
            return [];
        }
    }

    /**
     * Moderate Group (Suspend, Unsuspend, Disband, Update)
     * @param {Object} params
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async moderateGroup({ groupId, action, reason, newName, newDescription }) {
        if (!groupId || !action) return { success: false, error: 'Group ID and action required' };

        try {
            const { error: rpcErr } = await supabase.rpc('admin_moderate_group', {
                p_group_id: groupId,
                p_action: action,
                p_reason: reason || null,
                p_new_name: newName || null,
                p_new_description: newDescription || null
            });

            if (!rpcErr) return { success: true };

            // Fallback direct execution
            if (action === 'suspend') {
                await supabase.from('groups').update({ is_suspended: true, suspension_reason: reason || 'Suspended by admin' }).eq('conversation_id', groupId);
            } else if (action === 'unsuspend') {
                await supabase.from('groups').update({ is_suspended: false, suspension_reason: null }).eq('conversation_id', groupId);
            } else if (action === 'disband') {
                await supabase.from('conversations').delete().eq('id', groupId);
            } else if (action === 'update') {
                const updates = {};
                if (newName) updates.name = newName;
                if (newDescription !== undefined) updates.description = newDescription;
                await supabase.from('groups').update(updates).eq('conversation_id', groupId);
            }

            return { success: true };
        } catch (err) {
            console.error('[AdminService] moderateGroup error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Query Reports queue
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async getReports({ status = 'pending', category = '', limit = 50, offset = 0 } = {}) {
        try {
            const { data, error } = await supabase.rpc('admin_get_reports', {
                p_status: status || null,
                p_category: category || null,
                p_limit: limit,
                p_offset: offset
            });

            if (!error && Array.isArray(data)) {
                return data;
            }

            // Fallback direct query
            let query = supabase
                .from('reports')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (status) {
                query = query.eq('status', status);
            }
            if (category) {
                query = query.eq('category', category);
            }

            const { data: rows, error: qErr } = await query;
            if (qErr) throw qErr;

            if (rows && rows.length > 0) {
                const userIds = [...new Set([
                    ...rows.map(r => r.reporter_id),
                    ...rows.map(r => r.reported_user_id)
                ])].filter(Boolean);

                const { data: profiles } = await supabase
                    .from('public_profiles')
                    .select('id, username, display_name')
                    .in('id', userIds);

                return rows.map(r => {
                    const reporter = (profiles || []).find(p => p.id === r.reporter_id);
                    const reported = (profiles || []).find(p => p.id === r.reported_user_id);
                    return {
                        ...r,
                        reporter_username: reporter?.username || 'user',
                        reported_username: reported?.username || 'user',
                        has_message_content: !!r.reported_message_id
                    };
                });
            }

            return rows || [];
        } catch (err) {
            console.error('[AdminService] getReports error:', err);
            return [];
        }
    }

    /**
     * Controlled Moderation Workflow: Explicitly Access Reported Message Content
     * Note: Admins CANNOT browse arbitrary private messages. Only the specific message attached
     * to a filed report is retrievable, and the access is audit logged.
     * @param {string} reportId 
     * @returns {Promise<Object>}
     */
    async getReportedContent(reportId) {
        if (!reportId) return { has_content: false, message: 'Report ID required' };

        try {
            const { data, error } = await supabase.rpc('admin_get_reported_content', {
                p_report_id: reportId
            });

            if (error) throw error;
            return data;
        } catch (err) {
            console.error('[AdminService] getReportedContent error:', err);
            return {
                has_content: false,
                message: err.message || 'Error accessing reported content'
            };
        }
    }

    /**
     * Update Report Status (Pending, Under review, Resolved, Rejected)
     * @param {Object} params
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    async updateReportStatus({ reportId, status, actionType, notes }) {
        if (!reportId || !status) return { success: false, error: 'Report ID and status required' };

        try {
            const { error: rpcErr } = await supabase.rpc('admin_update_report_status', {
                p_report_id: reportId,
                p_status: status,
                p_action_type: actionType || null,
                p_notes: notes || null
            });

            if (!rpcErr) return { success: true };

            // Fallback direct update
            const adminUser = await authService.getUser();
            await supabase
                .from('reports')
                .update({
                    status: status,
                    resolution_notes: notes || '',
                    resolved_by: (status === 'resolved' || status === 'rejected') ? adminUser?.id : null,
                    resolved_at: (status === 'resolved' || status === 'rejected') ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', reportId);

            if (actionType) {
                await supabase.from('report_actions').insert({
                    report_id: reportId,
                    moderator_id: adminUser?.id,
                    action_type: actionType,
                    notes: notes || ''
                });
            }

            return { success: true };
        } catch (err) {
            console.error('[AdminService] updateReportStatus error:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Query Moderation Audit Records
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    async getModerationRecords({ limit = 50, offset = 0 } = {}) {
        try {
            const { data, error } = await supabase
                .from('moderation_records')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                const userIds = [...new Set([
                    ...data.map(m => m.user_id),
                    ...data.map(m => m.moderator_id)
                ])].filter(Boolean);

                const { data: profiles } = await supabase
                    .from('public_profiles')
                    .select('id, username, display_name')
                    .in('id', userIds);

                return data.map(m => {
                    const target = (profiles || []).find(p => p.id === m.user_id);
                    const mod = (profiles || []).find(p => p.id === m.moderator_id);
                    return {
                        ...m,
                        targetUsername: target?.username || 'user',
                        moderatorUsername: mod?.username || 'system'
                    };
                });
            }

            return data || [];
        } catch (err) {
            console.error('[AdminService] getModerationRecords error:', err);
            return [];
        }
    }
}

export const adminService = new AdminService();
