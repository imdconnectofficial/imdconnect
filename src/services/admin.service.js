// ==============================================================================
// ImdConnect — Admin & Moderation Service
// Connects to Supabase admin-guarded tables: profiles, groups, reports, moderation
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class AdminService {
    /**
     * Verify whether current user has admin / moderator privileges
     */
    async isAuthorized() {
        const user = await authService.getUser();
        if (!user) return false;

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        return profile && (profile.role === 'admin' || profile.role === 'moderator');
    }

    /**
     * Get High-Level System KPIs and Metrics
     */
    async getAdminStats() {
        try {
            const [usersRes, convsRes, grpsRes, reportsRes] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }),
                supabase.from('conversations').select('*', { count: 'exact', head: true }),
                supabase.from('groups').select('*', { count: 'exact', head: true }),
                supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending')
            ]);

            return {
                totalUsers: usersRes.count || 0,
                totalConversations: convsRes.count || 0,
                totalGroups: grpsRes.count || 0,
                pendingReports: reportsRes.count || 0,
                systemStatus: 'Operational',
                textOnlyEngine: 'Enforced'
            };
        } catch (err) {
            console.error('[AdminService] getAdminStats error:', err);
            return {
                totalUsers: 0,
                totalConversations: 0,
                totalGroups: 0,
                pendingReports: 0,
                systemStatus: 'Degraded',
                textOnlyEngine: 'Enforced'
            };
        }
    }

    /**
     * Query Users list with filters
     */
    async getUsers({ search = '', role = '', limit = 50, offset = 0 } = {}) {
        try {
            let query = supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url, role, status, is_suspended, created_at, last_seen_at')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (search) {
                query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
            }

            if (role) {
                query = query.eq('role', role);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('[AdminService] getUsers error:', err);
            return [];
        }
    }

    /**
     * Update User Role (User / Moderator / Admin)
     */
    async updateUserRole(userId, newRole) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .update({ role: newRole, updated_at: new Date().toISOString() })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Moderate User (Suspend / Ban / Unban)
     */
    async moderateUser({ userId, action, reason }) {
        const adminUser = await authService.getUser();
        if (!adminUser) return { success: false, error: 'Unauthenticated' };

        try {
            const isSuspended = action === 'temporary_suspension' || action === 'permanent_ban';
            const status = action === 'permanent_ban' ? 'banned' : (isSuspended ? 'suspended' : 'active');

            // 1. Update profiles table
            const { error: profErr } = await supabase
                .from('profiles')
                .update({
                    status: status,
                    is_suspended: isSuspended,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (profErr) throw profErr;

            // 2. Insert into moderation_records audit log
            await supabase.from('moderation_records').insert({
                user_id: userId,
                moderator_id: adminUser.id,
                action: action,
                reason: reason || 'Violation of Platform Terms'
            });

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Query Groups list
     */
    async getGroups({ search = '', limit = 50, offset = 0 } = {}) {
        try {
            let query = supabase
                .from('groups')
                .select('conversation_id, name, description, avatar_url, owner_id, created_at')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (search) {
                query = query.ilike('name', `%${search}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Fetch owner names
            if (data && data.length > 0) {
                const ownerIds = data.map(g => g.owner_id);
                const { data: owners } = await supabase
                    .from('public_profiles')
                    .select('id, username, display_name')
                    .in('id', ownerIds);

                return data.map(g => {
                    const owner = (owners || []).find(o => o.id === g.owner_id);
                    return {
                        ...g,
                        ownerName: owner?.display_name || `@${owner?.username || 'user'}`
                    };
                });
            }

            return data || [];
        } catch (err) {
            console.error('[AdminService] getGroups error:', err);
            return [];
        }
    }

    /**
     * Delete / Remove Group
     */
    async deleteGroup(groupId, reason) {
        try {
            const { error } = await supabase
                .from('conversations')
                .delete()
                .eq('id', groupId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Query Reports queue
     */
    async getReports({ status = 'pending', limit = 50, offset = 0 } = {}) {
        try {
            let query = supabase
                .from('reports')
                .select('*')
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;
            if (error) throw error;

            if (data && data.length > 0) {
                const userIds = [...new Set([
                    ...data.map(r => r.reporter_id),
                    ...data.map(r => r.reported_user_id)
                ])].filter(Boolean);

                const { data: profiles } = await supabase
                    .from('public_profiles')
                    .select('id, username, display_name')
                    .in('id', userIds);

                return data.map(r => {
                    const reporter = (profiles || []).find(p => p.id === r.reporter_id);
                    const reported = (profiles || []).find(p => p.id === r.reported_user_id);
                    return {
                        ...r,
                        reporterUsername: reporter?.username || 'anonymous',
                        reportedUsername: reported?.username || 'unknown'
                    };
                });
            }

            return data || [];
        } catch (err) {
            console.error('[AdminService] getReports error:', err);
            return [];
        }
    }

    /**
     * Resolve / Dismiss a report
     */
    async resolveReport(reportId, { actionType, notes }) {
        const adminUser = await authService.getUser();
        if (!adminUser) return { success: false, error: 'Unauthenticated' };

        try {
            const newStatus = actionType === 'report_dismissed' ? 'dismissed' : 'resolved';

            // 1. Update report status
            const { error: repErr } = await supabase
                .from('reports')
                .update({
                    status: newStatus,
                    resolved_by: adminUser.id,
                    resolved_at: new Date().toISOString(),
                    resolution_notes: notes || '',
                    updated_at: new Date().toISOString()
                })
                .eq('id', reportId);

            if (repErr) throw repErr;

            // 2. Insert into report_actions
            await supabase.from('report_actions').insert({
                report_id: reportId,
                moderator_id: adminUser.id,
                action_type: actionType,
                notes: notes || ''
            });

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Query Moderation Audit Records
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
