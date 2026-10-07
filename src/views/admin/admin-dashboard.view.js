// ==============================================================================
// ImdConnect — Secure Admin Dashboard Overview (#/admin)
// System metrics, all 13 KPI stats, architecture health, and quick actions
// ==============================================================================
import { adminService } from '../../services/admin.service.js';
import { createAdminShell } from './admin-shell.js';

export const AdminDashboardView = {
    async render() {
        const stats = await adminService.getAdminStats();

        const contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 1040px;">
                <!-- System Health Status Banner -->
                <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-surface-elevated); padding: 0.85rem 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); flex-wrap: wrap; gap: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--color-success); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);"></span>
                        <span style="font-weight: 600; font-size: 0.9rem;">Platform Engine: ${stats.systemStatus}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">|</span>
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">🔒 Text-Only Messaging: ${stats.textOnlyEngine}</span>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--accent); font-weight: 600;">
                        PostgreSQL 15+ RLS Strict Restrictive Mode
                    </div>
                </div>

                <!-- 13 KPI Metric Cards Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem;">
                    <!-- 1. Total Users -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Users</span>
                            <span style="font-size: 1.2rem;">👥</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.totalUsers}</div>
                        <div style="font-size: 0.725rem; color: var(--color-success); margin-top: 0.25rem;">Registered Profiles</div>
                    </div>

                    <!-- 2. Active Users -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Active Users</span>
                            <span style="font-size: 1.2rem;">✨</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.activeUsers}</div>
                        <div style="font-size: 0.725rem; color: var(--color-success); margin-top: 0.25rem;">In Good Standing</div>
                    </div>

                    <!-- 3. Online Users -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Online Users</span>
                            <span style="font-size: 1.2rem;">🟢</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--color-success);">${stats.onlineUsers}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Active in last 5m</div>
                    </div>

                    <!-- 4. New Users -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">New Users</span>
                            <span style="font-size: 1.2rem;">🌱</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--accent);">${stats.newUsers}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Joined Last 7 Days</div>
                    </div>

                    <!-- 5. Friendships -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Friendships</span>
                            <span style="font-size: 1.2rem;">🤝</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.friendships}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Mutual Accepted Pairs</div>
                    </div>

                    <!-- 6. Pending Requests -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Pending Requests</span>
                            <span style="font-size: 1.2rem;">⏳</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.pendingRequests}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Awaiting Contact Response</div>
                    </div>

                    <!-- 7. Personal Chats -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Personal Chats</span>
                            <span style="font-size: 1.2rem;">💬</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.personalChats}</div>
                        <div style="font-size: 0.725rem; color: var(--accent); margin-top: 0.25rem;">1-on-1 Direct Channels</div>
                    </div>

                    <!-- 8. Groups -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Groups</span>
                            <span style="font-size: 1.2rem;">👥</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.groups}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Group Chat Rooms</div>
                    </div>

                    <!-- 9. Messages -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Total Messages</span>
                            <span style="font-size: 1.2rem;">📨</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.messages}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Direct & Group Texts</div>
                    </div>

                    <!-- 10. Messages Today -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Messages Today</span>
                            <span style="font-size: 1.2rem;">📈</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--accent);">${stats.messagesToday}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Sent Since Midnight</div>
                    </div>

                    <!-- 11. Reports -->
                    <div class="auth-card" style="padding: 1.25rem; border-color: ${stats.pendingReports > 0 ? 'var(--color-danger)' : 'var(--border-color)'};">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Reports</span>
                            <span style="font-size: 1.2rem;">⚠️</span>
                        </div>
                        <div style="display: flex; align-items: baseline; gap: 0.5rem;">
                            <span style="font-size: 1.75rem; font-weight: 700; color: ${stats.pendingReports > 0 ? 'var(--color-danger)' : 'var(--text-primary)'};">${stats.reports}</span>
                            ${stats.pendingReports > 0 ? `<span class="age-pill age-invalid" style="font-size: 0.7rem;">${stats.pendingReports} Pending</span>` : ''}
                        </div>
                        <div style="font-size: 0.725rem; color: ${stats.pendingReports > 0 ? 'var(--color-danger)' : 'var(--color-success)'}; margin-top: 0.25rem;">
                            ${stats.pendingReports > 0 ? '● Moderation Action Needed' : '✓ Zero Backlog'}
                        </div>
                    </div>

                    <!-- 12. Blocked Users -->
                    <div class="auth-card" style="padding: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Blocked Users</span>
                            <span style="font-size: 1.2rem;">🚫</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: var(--text-primary);">${stats.blockedUsers}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">User-to-User Blocks</div>
                    </div>

                    <!-- 13. Suspended Users -->
                    <div class="auth-card" style="padding: 1.25rem; border-color: ${stats.suspendedUsers > 0 ? 'var(--color-warning)' : 'var(--border-color)'};">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
                            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Suspended Users</span>
                            <span style="font-size: 1.2rem;">⛔</span>
                        </div>
                        <div style="font-size: 1.75rem; font-weight: 700; color: ${stats.suspendedUsers > 0 ? 'var(--color-danger)' : 'var(--text-primary)'};">${stats.suspendedUsers}</div>
                        <div style="font-size: 0.725rem; color: var(--text-muted); margin-top: 0.25rem;">Suspended or Banned</div>
                    </div>
                </div>

                <!-- Platform Security Standards & Privacy Rules -->
                <div class="auth-card" style="padding: 1.5rem;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem;">Platform Security Architecture</h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
                        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <span style="font-weight: 600; font-size: 0.875rem;">Password Confidentiality</span>
                                <span style="color: var(--color-success); font-weight: 700; font-size: 0.75rem;">ZERO PLAINTEXT</span>
                            </div>
                            <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                                Plaintext passwords are NEVER stored in the database or visible to administrators. Supabase Auth manages cryptographic password hashes.
                            </p>
                        </div>

                        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <span style="font-weight: 600; font-size: 0.875rem;">Private Chat Protection</span>
                                <span style="color: var(--color-success); font-weight: 700; font-size: 0.75rem;">NO GENERIC BROWSING</span>
                            </div>
                            <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                                Admins CANNOT browse arbitrary private messages. Message inspection is restricted exclusively to filed report tickets with audit logging.
                            </p>
                        </div>

                        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <span style="font-weight: 600; font-size: 0.875rem;">Identity Media Restriction</span>
                                <span style="color: var(--accent); font-weight: 700; font-size: 0.75rem;">AVATARS ONLY</span>
                            </div>
                            <p style="font-size: 0.775rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                                ImdConnect is strictly a text-only platform. Storage buckets are locked solely to profile and group identity avatars/covers.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Administrative Workflows Navigation -->
                <div class="auth-card" style="padding: 1.5rem;">
                    <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem;">Administrative Workflows</h3>
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                        <a href="#/admin/users" class="btn-secondary" style="flex: 1; min-width: 190px; justify-content: center; text-decoration: none;">
                            👥 User Management (${stats.totalUsers})
                        </a>
                        <a href="#/admin/groups" class="btn-secondary" style="flex: 1; min-width: 190px; justify-content: center; text-decoration: none;">
                            💬 Group Moderation (${stats.groups})
                        </a>
                        <a href="#/admin/reports" class="btn-secondary" style="flex: 1; min-width: 190px; justify-content: center; text-decoration: none; ${stats.pendingReports > 0 ? 'border-color: var(--color-danger); color: var(--color-danger);' : ''}">
                            ⚠️ Review Reports (${stats.pendingReports} pending)
                        </a>
                        <a href="#/admin/moderation" class="btn-secondary" style="flex: 1; min-width: 190px; justify-content: center; text-decoration: none;">
                            📜 Audit Trails
                        </a>
                    </div>
                </div>
            </div>
        `;

        return createAdminShell({
            activeSection: 'overview',
            title: 'Admin Dashboard',
            description: 'Platform overview, key performance indicators, and security status.',
            contentHtml,
            pendingReportsCount: stats.pendingReports
        });
    }
};
