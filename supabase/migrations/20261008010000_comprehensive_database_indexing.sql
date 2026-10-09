-- ==============================================================================
-- ImdConnect — Comprehensive PostgreSQL Schema Indexing & Pruning Pass
-- 
-- Tailored to application query patterns:
-- - Exact match, prefix, and pg_trgm substring search
-- - Cursor and limit/offset pagination
-- - Realtime and unread state filtering (partial indexes)
-- - Reverse foreign key and RLS verification joins
-- - Pruning of redundant indexes already covered by composite or UNIQUE constraints
-- ==============================================================================

-- Ensure pg_trgm is available for trigram GIN wildcard indexing
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==============================================================================
-- 1. PROFILES (profiles.username & profiles.name / display_name)
-- ==============================================================================
-- Query Patterns:
-- a. Search: username.ilike.%query% OR display_name.ilike.%query%
-- b. Autocomplete / Prefix: lower(username) LIKE 'query%'
-- c. Case-insensitive exact match: lower(username) = lower($1)
-- Redundancy check:
-- uq_profiles_username UNIQUE (username) already provides a B-tree on exact username.
-- We add GIN trigram indexes for %substring% searches and lower() B-trees for prefix/case-folding.

-- Drop redundant duplicate index on username (covered by uq_profiles_username)
DROP INDEX IF EXISTS public.idx_profiles_username;

-- Trigram GIN index for fast debounced username wildcard search (ILIKE '%xyz%')
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm 
    ON public.profiles USING gin (username gin_trgm_ops);

-- Trigram GIN index for fast debounced display_name wildcard search (ILIKE '%xyz%')
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm 
    ON public.profiles USING gin (display_name gin_trgm_ops);

-- Lowercase prefix index for B-tree exact lookups & prefix autocomplete
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower 
    ON public.profiles (lower(username) varchar_pattern_ops);

-- Lowercase display_name index for sorting & case-insensitive filters
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_lower 
    ON public.profiles (lower(display_name) varchar_pattern_ops);


-- ==============================================================================
-- 2. FRIEND REQUESTS (friend_requests.sender_id, receiver_id, status)
-- ==============================================================================
-- Query Patterns:
-- a. Incoming pending: WHERE receiver_id = $1 AND status = 'pending' ORDER BY created_at DESC
-- b. Outgoing pending: WHERE sender_id = $1 AND status = 'pending' ORDER BY created_at DESC
-- c. Active mutual check: WHERE sender_id = $1 AND receiver_id = $2 AND status = 'pending'
-- Redundancy check:
-- uq_friend_requests UNIQUE (sender_id, receiver_id) covers exact sender-receiver pairs.
-- We use highly compact partial indexes for 'pending' requests which make up the live working set.

-- Fast incoming pending request feed (covers filter + sort without heap sort)
CREATE INDEX IF NOT EXISTS idx_friend_requests_pending_receiver 
    ON public.friend_requests (receiver_id, created_at DESC) 
    WHERE status = 'pending';

-- Fast outgoing pending request feed (covers filter + sort without heap sort)
CREATE INDEX IF NOT EXISTS idx_friend_requests_pending_sender 
    ON public.friend_requests (sender_id, created_at DESC) 
    WHERE status = 'pending';

-- General composite indexes for audit/history lookups across all statuses
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_status_created 
    ON public.friend_requests (receiver_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_status_created 
    ON public.friend_requests (sender_id, status, created_at DESC);


-- ==============================================================================
-- 3. FRIENDSHIPS (friendships.user_id, friendships.friend_id)
-- ==============================================================================
-- Query Patterns:
-- a. User's friends list: WHERE user_id = $1 ORDER BY created_at DESC
-- b. Reverse lookup & RLS check: WHERE friend_id = $1 (check mutual contact)
-- c. Pair check: WHERE user_id = $1 AND friend_id = $2
-- Redundancy check:
-- uq_friendships UNIQUE (user_id, friend_id) covers (user_id) as leading column.
-- Standalone idx_friendships_user is replaced by (user_id, created_at DESC) to eliminate sorting.

DROP INDEX IF EXISTS public.idx_friendships_user;

-- User's friend list ordered by friendship date
CREATE INDEX IF NOT EXISTS idx_friendships_user_created 
    ON public.friendships (user_id, created_at DESC);

-- Reverse lookup covering index for RLS mutual contact checks (Index-Only Scan)
CREATE INDEX IF NOT EXISTS idx_friendships_friend_user 
    ON public.friendships (friend_id, user_id);


-- ==============================================================================
-- 4. BLOCKED USERS (blocked_users.blocker_id, blocked_users.blocked_id)
-- ==============================================================================
-- Query Patterns:
-- a. User's blocked list: WHERE blocker_id = $1 ORDER BY created_at DESC
-- b. RLS & delivery check: WHERE blocked_id = $1 AND blocker_id = $2 (is sender blocked by recipient?)
-- Redundancy check:
-- uq_blocked_users UNIQUE (blocker_id, blocked_id) already covers blocker_id.
-- Standalone idx_blocked_users_blocker is replaced with (blocker_id, created_at DESC).

DROP INDEX IF EXISTS public.idx_blocked_users_blocker;

-- Blocked users settings list ordered by recency
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_created 
    ON public.blocked_users (blocker_id, created_at DESC);

-- Reverse lookup covering index for incoming message blocking check (Index-Only Scan)
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_blocker 
    ON public.blocked_users (blocked_id, blocker_id);


-- ==============================================================================
-- 5. CONVERSATIONS (conversations.type, updated_at, disappearing_timer)
-- ==============================================================================
-- Query Patterns:
-- a. Listing user conversations: joined through conversation_members, ordered by updated_at DESC
-- b. Filtering by type (direct vs group) while ordering by recency
-- c. Disappearing messages timer lookup

-- Composite index for type-filtered recency queries
CREATE INDEX IF NOT EXISTS idx_conversations_type_updated 
    ON public.conversations (type, updated_at DESC);

-- Partial index for active disappearing timer conversations (avoids indexing timer=0)
CREATE INDEX IF NOT EXISTS idx_conversations_active_disappearing 
    ON public.conversations (id, disappearing_timer) 
    WHERE disappearing_timer > 0;


-- ==============================================================================
-- 6. CONVERSATION MEMBERS (conversation_members.user_id, conversation_id, etc.)
-- ==============================================================================
-- Query Patterns:
-- a. Sidebar chat list: WHERE user_id = $1 AND is_archived = false ORDER BY is_pinned DESC
-- b. RLS authorization on messages: WHERE conversation_id = $1 AND user_id = auth.uid()
-- c. Unread message count calculation: compares messages.created_at against last_read_at
-- Redundancy check:
-- uq_conversation_members UNIQUE (conversation_id, user_id) already indexes conversation_id.
-- Standalone idx_conv_members_conv is redundant.

DROP INDEX IF EXISTS public.idx_conv_members_conv;

-- Active (unarchived) user conversation memberships ordered by pinned status
CREATE INDEX IF NOT EXISTS idx_conv_members_active_user_pinned 
    ON public.conversation_members (user_id, is_pinned DESC, joined_at DESC) 
    WHERE is_archived = false;

-- Unread count synchronization covering index (Index-Only Scan)
CREATE INDEX IF NOT EXISTS idx_conv_members_unread_calc 
    ON public.conversation_members (conversation_id, user_id, last_read_at);


-- ==============================================================================
-- 7. MESSAGES (messages.conversation_id, created_at, expires_at)
-- ==============================================================================
-- Query Patterns:
-- a. Chat feed pagination: WHERE conversation_id = $1 AND is_deleted_for_all = false ORDER BY created_at DESC LIMIT $2
-- b. Cursor pagination: WHERE conversation_id = $1 AND is_deleted_for_all = false AND created_at < $cursor ORDER BY created_at DESC LIMIT $2
-- c. Disappearing evaporation cron: WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND is_deleted_for_all = false
-- d. Pinned message lookups: WHERE conversation_id = $1 AND is_pinned = true
-- Redundancy check:
-- idx_messages_conv_created is identical to idx_messages_conversation_created_at_desc.
-- Keep one primary descending index, plus partial index for non-deleted messages.

DROP INDEX IF EXISTS public.idx_messages_conv_created;

-- Primary paginated message index for chat feed
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at_desc 
    ON public.messages (conversation_id, created_at DESC);

-- High-performance partial index for non-deleted active messages
CREATE INDEX IF NOT EXISTS idx_messages_active_unexpired 
    ON public.messages (conversation_id, created_at DESC) 
    WHERE is_deleted_for_all = false;

-- Partial index for disappearing message cleanup worker / cron (Index-Only Scan)
CREATE INDEX IF NOT EXISTS idx_messages_evaporation_cleanup 
    ON public.messages (expires_at) 
    WHERE expires_at IS NOT NULL AND is_deleted_for_all = false;

-- Partial index for pinned messages in a conversation
CREATE INDEX IF NOT EXISTS idx_messages_pinned_active 
    ON public.messages (conversation_id, created_at DESC) 
    WHERE is_pinned = true AND is_deleted_for_all = false;


-- ==============================================================================
-- 8. GROUPS & GROUP MEMBERS (groups.owner_id, name, group_members)
-- ==============================================================================
-- Query Patterns:
-- a. Group search: WHERE name ILIKE '%query%'
-- b. Public groups directory: WHERE is_public = true ORDER BY created_at DESC
-- c. Group members pagination: WHERE group_id = $1 ORDER BY joined_at DESC LIMIT $2 OFFSET $3
-- d. Group role check (Index-Only Scan for admin/owner permissions)
-- Redundancy check:
-- uq_group_members UNIQUE (group_id, user_id) already covers (group_id, user_id).
-- Standalone idx_group_members_group is redundant.

DROP INDEX IF EXISTS public.idx_group_members_group;

-- Trigram GIN index for group name search (ILIKE '%search%')
CREATE INDEX IF NOT EXISTS idx_groups_name_trgm 
    ON public.groups USING gin (name gin_trgm_ops);

-- Directory index for public groups
CREATE INDEX IF NOT EXISTS idx_groups_public_directory 
    ON public.groups (created_at DESC) 
    WHERE is_public = true;

-- Paginated group members index
CREATE INDEX IF NOT EXISTS idx_group_members_group_joined 
    ON public.group_members (group_id, joined_at DESC);

-- Covering index with role included for permission checks without heap fetch
CREATE INDEX IF NOT EXISTS idx_group_members_perm_check 
    ON public.group_members (group_id, user_id) 
    INCLUDE (role);

-- Partial index for group moderators / admins
CREATE INDEX IF NOT EXISTS idx_group_members_admins 
    ON public.group_members (group_id) 
    WHERE role IN ('owner', 'admin');


-- ==============================================================================
-- 9. NOTIFICATIONS (notifications.user_id / recipient_id, read_at, is_read)
-- ==============================================================================
-- Query Patterns:
-- a. Unread badge count: SELECT count(*) FROM notifications WHERE user_id = $1 AND is_read = false
-- b. Unread notification tab: WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC
-- c. All notifications paginated: WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25 OFFSET $2
-- d. Clear read: DELETE FROM notifications WHERE user_id = $1 AND is_read = true

-- High-speed partial index for unread badge count & unread notifications tab
CREATE INDEX IF NOT EXISTS idx_notifications_unread_fast 
    ON public.notifications (user_id, created_at DESC) 
    WHERE is_read = false;

-- General paginated notifications feed index
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc 
    ON public.notifications (user_id, created_at DESC);

-- Partial index for clearing / archiving read notifications
CREATE INDEX IF NOT EXISTS idx_notifications_read_at 
    ON public.notifications (user_id, read_at) 
    WHERE is_read = true;


-- ==============================================================================
-- 10. REPORTS (reports.status, reported_user_id, reporter_id)
-- ==============================================================================
-- Query Patterns:
-- a. Moderation queue: WHERE status = 'pending' ORDER BY created_at DESC
-- b. User risk audit: WHERE reported_user_id = $1 AND status IN ('pending', 'investigating')
-- c. Reporter tracking: WHERE reporter_id = $1 ORDER BY created_at DESC

-- Partial index for active moderation backlog (pending & investigating)
CREATE INDEX IF NOT EXISTS idx_reports_active_backlog 
    ON public.reports (status, created_at DESC) 
    WHERE status IN ('pending', 'investigating');

-- User moderation history lookup (reported user + status)
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_status 
    ON public.reports (reported_user_id, status, created_at DESC);

-- Reporter submission tracking index
CREATE INDEX IF NOT EXISTS idx_reports_reporter_created 
    ON public.reports (reporter_id, created_at DESC);


-- ==============================================================================
-- 11. SESSIONS & LOGIN HISTORY (user_sessions.user_id, login_history.user_id)
-- ==============================================================================
-- Query Patterns:
-- a. Active devices list: WHERE user_id = $1 AND is_revoked = false ORDER BY last_active_at DESC
-- b. Session validation: WHERE session_token_hash = $1 AND is_revoked = false
-- c. User login audit: WHERE user_id = $1 ORDER BY created_at DESC
-- d. Brute-force rate limiting: WHERE user_id = $1 AND success = false AND created_at >= NOW() - INTERVAL '15m'

-- Partial index for active (non-revoked) user sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user 
    ON public.user_sessions (user_id, last_active_at DESC) 
    WHERE is_revoked = false;

-- Fast session token lookup
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_active 
    ON public.user_sessions (session_token_hash) 
    WHERE is_revoked = false;

-- Login audit history for user activity logs
CREATE INDEX IF NOT EXISTS idx_login_history_user_created 
    ON public.login_history (user_id, created_at DESC);

-- Partial index for failed login attempts (brute-force rate limiting)
CREATE INDEX IF NOT EXISTS idx_login_history_failed_attempts 
    ON public.login_history (user_id, created_at DESC) 
    WHERE success = false;
