-- ==============================================================================
-- ImdConnect — Production Performance Pass: Database Indexes & RPCs
-- Optimization for:
-- 1. Paginated chat message retrieval (Zero "load thousands at once")
-- 2. Fast unread notification counts & paginated notification feeds
-- 3. Composite indexes for conversation membership & social queries
-- 4. Fast debounced user & profile search via pg_trgm
-- 5. Paginated group member lists
-- 6. Unified RPC to eliminate N+1 roundtrips on conversation lists
-- ==============================================================================

-- Enable Trigram extension for fast debounced substring/prefix searching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------------------------
-- 1. Chat Messages Indexes (Critical for Fast Cursor/Offset Pagination)
-- ------------------------------------------------------------------------------

-- Primary composite index for paginated message fetching:
-- WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at_desc 
    ON public.messages (conversation_id, created_at DESC);

-- Partial index for active non-deleted messages
CREATE INDEX IF NOT EXISTS idx_messages_active_unexpired 
    ON public.messages (conversation_id, created_at DESC) 
    WHERE is_deleted_for_all = false;

-- Sender lookup index for cascades and profile associations
CREATE INDEX IF NOT EXISTS idx_messages_sender_id 
    ON public.messages (sender_id);

-- Partial index for fast unread / undelivered receipt updates
CREATE INDEX IF NOT EXISTS idx_messages_unread_receipts 
    ON public.messages (conversation_id, sender_id) 
    WHERE read_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. Conversation Members & Group Members Indexes
-- ------------------------------------------------------------------------------

-- Fast lookup of user's conversation list ordered by pinned status
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_pinned 
    ON public.conversation_members (user_id, is_pinned DESC, is_archived);

CREATE INDEX IF NOT EXISTS idx_conversation_members_conv_user 
    ON public.conversation_members (conversation_id, user_id);

-- Group members pagination and role lookup
CREATE INDEX IF NOT EXISTS idx_group_members_group_joined 
    ON public.group_members (group_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_members_group_user 
    ON public.group_members (group_id, user_id);

-- ------------------------------------------------------------------------------
-- 3. Notifications Indexes (Fast Badges & Paginated Center)
-- ------------------------------------------------------------------------------

-- Composite index for paginated notifications and unread counts:
-- WHERE user_id = $1 AND is_read = false
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created 
    ON public.notifications (user_id, is_read, created_at DESC);

-- General user notifications pagination
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc 
    ON public.notifications (user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. Friendship & Social Search Indexes
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_friendships_user_status 
    ON public.friendships (user_id, status);

CREATE INDEX IF NOT EXISTS idx_friendships_friend_status 
    ON public.friendships (friend_id, status);

-- Trigram GIN indexes for debounced user search
CREATE INDEX IF NOT EXISTS idx_public_profiles_username_trgm 
    ON public.public_profiles USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_public_profiles_display_name_trgm 
    ON public.public_profiles USING gin (display_name gin_trgm_ops);

-- Lowercase prefix index for B-tree exact/prefix lookups
CREATE INDEX IF NOT EXISTS idx_public_profiles_username_lower 
    ON public.public_profiles (lower(username) varchar_pattern_ops);

-- ------------------------------------------------------------------------------
-- 5. Optimized Stored Procedure: Fetch User Conversations (Zero N+1 Queries)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_conversations_optimized(
    p_limit INT DEFAULT 40,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_result JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN '[]'::JSONB;
    END IF;

    WITH user_memberships AS (
        SELECT 
            cm.conversation_id,
            cm.role,
            cm.is_muted,
            cm.is_pinned,
            cm.is_archived,
            cm.last_read_at,
            cm.is_privacy_mode
        FROM public.conversation_members cm
        WHERE cm.user_id = v_user_id
          AND cm.is_archived = false
    ),
    ordered_conversations AS (
        SELECT 
            c.id AS conv_id,
            c.type AS conv_type,
            c.disappearing_timer,
            c.is_privacy_mode AS conv_privacy_mode,
            c.updated_at,
            um.role AS user_role,
            um.is_muted,
            um.is_pinned,
            um.last_read_at,
            um.is_privacy_mode AS member_privacy_mode
        FROM user_memberships um
        JOIN public.conversations c ON c.id = um.conversation_id
        ORDER BY um.is_pinned DESC, c.updated_at DESC
        LIMIT p_limit OFFSET p_offset
    ),
    group_data AS (
        SELECT 
            g.conversation_id,
            g.name AS group_name,
            g.description AS group_desc,
            g.avatar_url AS group_avatar,
            g.owner_id AS group_owner
        FROM public.groups g
        WHERE g.conversation_id IN (SELECT conv_id FROM ordered_conversations WHERE conv_type = 'group')
    ),
    direct_peers AS (
        SELECT 
            cm.conversation_id,
            p.id AS peer_id,
            p.username AS peer_username,
            p.display_name AS peer_display_name,
            p.avatar_url AS peer_avatar,
            p.last_seen_at AS peer_last_seen
        FROM public.conversation_members cm
        JOIN public.public_profiles p ON p.id = cm.user_id
        WHERE cm.conversation_id IN (SELECT conv_id FROM ordered_conversations WHERE conv_type = 'direct')
          AND cm.user_id != v_user_id
    ),
    latest_messages AS (
        SELECT DISTINCT ON (m.conversation_id)
            m.conversation_id,
            m.id AS last_msg_id,
            m.sender_id AS last_sender_id,
            m.ciphertext AS last_ciphertext,
            COALESCE(m.sent_at, m.created_at) AS last_sent_at
        FROM public.messages m
        WHERE m.conversation_id IN (SELECT conv_id FROM ordered_conversations)
          AND m.is_deleted_for_all = false
        ORDER BY m.conversation_id, m.created_at DESC
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', oc.conv_id,
                'type', oc.conv_type,
                'title', CASE 
                    WHEN oc.conv_type = 'group' THEN COALESCE(gd.group_name, 'Group')
                    ELSE COALESCE(dp.peer_display_name, '@' || dp.peer_username, 'Private Chat')
                END,
                'description', COALESCE(gd.group_desc, ''),
                'ownerId', gd.group_owner,
                'peerUsername', dp.peer_username,
                'avatarUrl', CASE 
                    WHEN oc.conv_type = 'group' THEN COALESCE(gd.group_avatar, '')
                    ELSE COALESCE(dp.peer_avatar, '')
                END,
                'isOnline', CASE 
                    WHEN dp.peer_last_seen IS NOT NULL THEN (EXTRACT(EPOCH FROM (NOW() - dp.peer_last_seen)) < 180)
                    ELSE false 
                END,
                'isMuted', oc.is_muted,
                'isPinned', oc.is_pinned,
                'hasUnread', (
                    lm.last_msg_id IS NOT NULL 
                    AND lm.last_sender_id != v_user_id 
                    AND (oc.last_read_at IS NULL OR lm.last_sent_at > oc.last_read_at)
                ),
                'isPrivacyMode', (oc.conv_privacy_mode OR oc.member_privacy_mode),
                'disappearingTimer', oc.disappearing_timer,
                'userRole', oc.user_role,
                'lastMessage', COALESCE(lm.last_ciphertext, 'No messages yet'),
                'lastMessageTime', CASE 
                    WHEN lm.last_sent_at IS NOT NULL THEN to_char(lm.last_sent_at, 'HH24:MI')
                    ELSE ''
                END,
                'updatedAt', oc.updated_at
            )
        ),
        '[]'::JSONB
    ) INTO v_result
    FROM ordered_conversations oc
    LEFT JOIN group_data gd ON gd.conversation_id = oc.conv_id
    LEFT JOIN direct_peers dp ON dp.conversation_id = oc.conv_id
    LEFT JOIN latest_messages lm ON lm.conversation_id = oc.conv_id;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversations_optimized TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Optimized Group Members Pagination Function
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_group_members_paginated(
    p_group_id UUID,
    p_limit INT DEFAULT 40,
    p_offset INT DEFAULT 0,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Verify caller is a member of the group
    IF NOT EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_id = p_group_id AND user_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    WITH filtered_members AS (
        SELECT 
            gm.user_id,
            gm.role,
            gm.joined_at,
            p.username,
            COALESCE(p.display_name, p.username) AS display_name,
            COALESCE(p.avatar_url, '') AS avatar_url,
            p.last_seen_at
        FROM public.group_members gm
        JOIN public.public_profiles p ON p.id = gm.user_id
        WHERE gm.group_id = p_group_id
          AND (
              p_search IS NULL 
              OR p_search = '' 
              OR p.username ILIKE '%' || p_search || '%' 
              OR p.display_name ILIKE '%' || p_search || '%'
          )
        ORDER BY 
            CASE gm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
            gm.joined_at ASC
        LIMIT p_limit OFFSET p_offset
    ),
    total_count AS (
        SELECT COUNT(*) AS total
        FROM public.group_members gm
        JOIN public.public_profiles p ON p.id = gm.user_id
        WHERE gm.group_id = p_group_id
          AND (
              p_search IS NULL 
              OR p_search = '' 
              OR p.username ILIKE '%' || p_search || '%' 
              OR p.display_name ILIKE '%' || p_search || '%'
          )
    )
    SELECT jsonb_build_object(
        'success', true,
        'total', (SELECT total FROM total_count),
        'members', COALESCE(jsonb_agg(to_jsonb(fm)), '[]'::JSONB)
    ) INTO v_result
    FROM filtered_members fm;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_members_paginated TO authenticated;
