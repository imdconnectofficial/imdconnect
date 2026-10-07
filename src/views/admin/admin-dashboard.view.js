// ==============================================================================
// ImdConnect — Admin Dashboard Overview (#/admin)
// System metrics, KPI stats, platform status, and quick admin actions
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminDashboardView = {
    async render() {
        const stats = await adminService.getAdminStats();

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 960px;">
                <!-- KPI Stat Cards Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Users</span>
                            <span style="font-size: 1.25rem;">👥</span>
                        </div>
                        <div style="font-size: 1.85rem; font-weight: 700; color: var(--text-primary);">${stats.totalUsers}</div>
                        <div style="font-size: 0.75rem; color: var(--color-success); margin-top: 0.25rem;">● Real Supabase Profiles</div>
                    </div>

                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Conversations</span>
                            <span style="font-size: 1.25rem;">💬</span>
                        </div>
                        <div style="font-size: 1.85rem; font-weight: 700; color: var(--text-primary);">${stats.totalConversations}</div>
                        <div style="font-size: 0.75rem; color: var(--accent); margin-top: 0.25rem;">Direct & Group Chats</div>
                    </div>

                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Groups</span>
                            <span style="font-size: 1.25rem;">👥</span>
                        </div>
                        <div style="font-size: 1.85rem; font-weight: 700; color: var(--text-primary);">${stats.totalGroups}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Text-Only Group Rooms</div>
                    </div>

                    <div class="auth-card" style="padding: 1.25rem; border-color: ${stats.pendingReports > 0 ? 'var(--color-danger)' : 'var(--border-color)'};">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Pending Reports</span>
                            <span style="font-size: 1.25rem;">⚠️</span>
                        </div>
                        <div style="font-size: 1.85rem; font-weight: 700; color: ${stats.pendingReports > 0 ? 'var(--color-danger)' : 'var(--text-primary)'};">${stats.pendingReports}</div>
                        <div style="font-size: 0.75rem; color: ${stats.pendingReports > 0 ? 'var(--color-danger)' : 'var(--color-success)'}; margin-top: 0.25rem;">
                            ${stats.pendingReports > 0 ? '● Action Required' : '✓ Zero Backlog'}
                        </div>
                    </div>
                </div>

                <!-- Platform Architecture & Security Health -->
                <div class="auth-card" style="padding: 1.5rem;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem;">Platform Security Status</h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
                        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <span style="font-weight: 600; font-size: 0.875rem;">PostgreSQL RLS Status</span>
                                <span style="color: var(--color-success); font-weight: 700; font-size: 0.8rem;">100% ENFORCED</span>
                            </div>
                            <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0;">All 23 tables protected with RESTRICTIVE Row-Level Security policies.</p>
                        </div>

                        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <span style="font-weight: 600; font-size: 0.875rem;">Text-Only Messaging Engine</span>
                                <span style="color: var(--color-success); font-weight: 700; font-size: 0.8rem;">ACTIVE</span>
                            </div>
                            <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0;">Zero in-chat media attachments permitted across the entire platform.</p>
                        </div>

                        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <span style="font-weight: 600; font-size: 0.875rem;">Identity Media Buckets</span>
                                <span style="color: var(--accent); font-weight: 700; font-size: 0.8rem;">RESTRICTED</span>
                            </div>
                            <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0;">Storage limited solely to avatars and cover banners with tight MIME validation.</p>
                        </div>
                    </div>
                </div>

                <!-- Quick Administrative Shortcuts -->
                <div class="auth-card" style="padding: 1.5rem;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem;">Administrative Workflows</h3>
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <a href="#/admin/users" class="btn-secondary" style="flex: 1; min-width: 180px; justify-content: center; text-decoration: none;">
                            👥 Manage Users
                        </a>
                        <a href="#/admin/groups" class="btn-secondary" style="flex: 1; min-width: 180px; justify-content: center; text-decoration: none;">
                            💬 Moderate Groups
                        </a>
                        <a href="#/admin/reports" class="btn-secondary" style="flex: 1; min-width: 180px; justify-content: center; text-decoration: none; ${stats.pendingReports > 0 ? 'border-color: var(--color-danger); color: var(--color-danger);' : ''}">
                            ⚠️ Review Reports (${stats.pendingReports})
                        </a>
                        <a href="#/admin/moderation" class="btn-secondary" style="flex: 1; min-width: 180px; justify-content: center; text-decoration: none;">
                            📜 Audit Trails
                        </a>
                    </div>
                </div>
            </div>
        `;

        return createAdminShell({
            activeSection: 'overview',
            title: 'Admin Dashboard',
            description: 'Platform overview, key indicators, and system health status.',
            contentHtml,
            pendingReportsCount: stats.pendingReports
        });
    }
};
