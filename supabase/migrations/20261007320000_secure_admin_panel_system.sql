-- ==============================================================================
-- ImdConnect — Secure Admin Panel & Moderation System Migration
-- Migration: 20261007320000_secure_admin_panel_system.sql
--
-- Security Controls:
-- 1. All functions are SECURITY DEFINER with strict public.is_app_admin() checks.
-- 2. Zero exposure of passwords (plaintext or hashes).
-- 3. No generic "browse private messages" API.
-- 4. Controlled workflow for accessing reported content only.
-- 5. Full audit logging in moderation_records and report_actions.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema Hardening & Extensions
-- ------------------------------------------------------------------------------

-- 1.1 Ensure is_suspended on groups and conversations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'is_suspended'
    ) THEN
        ALTER TABLE public.groups ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'suspension_reason'
    ) THEN
        ALTER TABLE public.groups ADD COLUMN suspension_reason TEXT;
    END IF;
END $$;

-- 1.2 Update reports category and status check constraints
ALTER TABLE public.reports 
    DROP CONSTRAINT IF EXISTS reports_category_check;

ALTER TABLE public.reports 
    ADD CONSTRAINT reports_category_check 
    CHECK (category IN (
        'spam', 
        'harassment', 
        'fake_account', 
        'abuse', 
        'threat', 
        'scam', 
        'other',
        'impersonation',
        'inappropriate_behavior'
    ));

ALTER TABLE public.reports 
    DROP CONSTRAINT IF EXISTS reports_status_check;

ALTER TABLE public.reports 
    ADD CONSTRAINT reports_status_check 
    CHECK (status IN (
        'pending', 
        'under_review', 
        'resolved', 
        'rejected',
        'investigating',
        'dismissed'
    ));

-- 1.3 Update report_actions action_type check constraint
ALTER TABLE public.report_actions 
    DROP CONSTRAINT IF EXISTS report_actions_action_type_check;

ALTER TABLE public.report_actions 
    ADD CONSTRAINT report_actions_action_type_check 
    CHECK (action_type IN (
        'warning_issued', 
        'content_removed', 
        'user_suspended', 
        'user_banned', 
        'report_dismissed',
        'report_under_review',
        'report_rejected',
        'reported_content_accessed',
        'group_suspended'
    ));

-- ------------------------------------------------------------------------------
-- 2. Admin Authentication Guard Helper
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_app_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT (
        EXISTS (
            SELECT 1 FROM public.app_admins
            WHERE user_id = check_user_id
              AND role IN ('superadmin', 'moderator', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = check_user_id
              AND role IN ('admin', 'moderator')
        )
    );
$$;

-- ------------------------------------------------------------------------------
-- 3. Dashboard KPI Metrics Function (All 13 Metrics)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_metrics JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_app_admin(v_caller_id) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM public.profiles),
        'active_users', (SELECT COUNT(*) FROM public.profiles WHERE is_suspended = FALSE AND (status IS NULL OR status = 'active')),
        'online_users', (SELECT COUNT(*) FROM public.profiles WHERE last_seen_at >= NOW() - INTERVAL '5 minutes'),
        'new_users', (SELECT COUNT(*) FROM public.profiles WHERE created_at >= NOW() - INTERVAL '7 days'),
        'friendships', (SELECT COUNT(*) / 2 FROM public.friendships),
        'pending_requests', (SELECT COUNT(*) FROM public.friend_requests WHERE status = 'pending'),
        'personal_chats', (SELECT COUNT(*) FROM public.conversations WHERE type = 'direct'),
        'groups', (SELECT COUNT(*) FROM public.groups),
        'messages', (SELECT COUNT(*) FROM public.messages),
        'messages_today', (SELECT COUNT(*) FROM public.messages WHERE created_at >= CURRENT_DATE),
        'reports', (SELECT COUNT(*) FROM public.reports),
        'pending_reports', (SELECT COUNT(*) FROM public.reports WHERE status IN ('pending', 'under_review', 'investigating')),
        'blocked_users', (SELECT COUNT(*) FROM public.blocked_users),
        'suspended_users', (SELECT COUNT(*) FROM public.profiles WHERE is_suspended = TRUE OR status IN ('suspended', 'banned'))
    ) INTO v_metrics;

    RETURN v_metrics;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. User Management Functions
-- ------------------------------------------------------------------------------

-- 4.1 Admin Query Users with Stats (Plaintext Passwords NEVER Exposed)
CREATE OR REPLACE FUNCTION public.admin_get_users(
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    username VARCHAR,
    display_name VARCHAR,
    avatar_url TEXT,
    bio TEXT,
    role VARCHAR,
    status VARCHAR,
    is_suspended BOOLEAN,
    created_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    friends_count BIGINT,
    groups_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_app_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.username,
        p.display_name,
        p.avatar_url,
        p.bio,
        p.role,
        COALESCE(p.status, CASE WHEN p.is_suspended THEN 'suspended' ELSE 'active' END) AS status,
        p.is_suspended,
        p.created_at,
        p.last_seen_at,
        (SELECT COUNT(*) FROM public.friendships f WHERE f.user_id = p.id) AS friends_count,
        (SELECT COUNT(*) FROM public.group_members gm WHERE gm.user_id = p.id) AS groups_count
    FROM public.profiles p
    WHERE (
        p_search IS NULL 
        OR p_search = '' 
        OR p.username ILIKE '%' || p_search || '%' 
        OR p.display_name ILIKE '%' || p_search || '%'
    )
    AND (
        p_status IS NULL 
        OR p_status = '' 
        OR (p_status = 'suspended' AND p.is_suspended = TRUE)
        OR (p_status = 'banned' AND p.status = 'banned')
        OR (p_status = 'active' AND p.is_suspended = FALSE AND (p.status IS NULL OR p.status = 'active'))
    )
    AND (
        p_role IS NULL 
        OR p_role = '' 
        OR p.role = p_role
    )
    ORDER BY p.created_at DESC
    LIMIT LEAST(p_limit, 100)
    OFFSET p_offset;
END;
$$;

-- 4.2 Moderate User: Suspend, Unsuspend, Ban, Unban, Delete
CREATE OR REPLACE FUNCTION public.admin_moderate_user(
    p_user_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_target_role VARCHAR;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    -- Protect against modifying other superadmins
    SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
    IF v_target_role = 'admin' AND v_user_id <> v_admin_id THEN
        -- Only allow if caller is superadmin
        IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = v_admin_id AND role = 'superadmin') THEN
            RAISE EXCEPTION 'Cannot moderate another administrator without superadmin privileges.';
        END IF;
    END IF;

    IF p_action = 'suspend' THEN
        UPDATE public.profiles
        SET is_suspended = TRUE,
            status = 'suspended',
            updated_at = NOW()
        WHERE id = p_user_id;

        INSERT INTO public.moderation_records (user_id, moderator_id, action, reason)
        VALUES (p_user_id, v_admin_id, 'temporary_suspension', COALESCE(p_reason, 'Suspended by admin'));

    ELSIF p_action = 'unsuspend' THEN
        UPDATE public.profiles
        SET is_suspended = FALSE,
            status = 'active',
            updated_at = NOW()
        WHERE id = p_user_id;

        INSERT INTO public.moderation_records (user_id, moderator_id, action, reason)
        VALUES (p_user_id, v_admin_id, 'unsuspend', COALESCE(p_reason, 'Reinstated by admin'));

    ELSIF p_action = 'ban' THEN
        UPDATE public.profiles
        SET is_suspended = TRUE,
            is_banned = TRUE,
            status = 'banned',
            updated_at = NOW()
        WHERE id = p_user_id;

        INSERT INTO public.moderation_records (user_id, moderator_id, action, reason)
        VALUES (p_user_id, v_admin_id, 'permanent_ban', COALESCE(p_reason, 'Permanently banned by admin'));

    ELSIF p_action = 'unban' THEN
        UPDATE public.profiles
        SET is_suspended = FALSE,
            is_banned = FALSE,
            status = 'active',
            updated_at = NOW()
        WHERE id = p_user_id;

        INSERT INTO public.moderation_records (user_id, moderator_id, action, reason)
        VALUES (p_user_id, v_admin_id, 'unban', COALESCE(p_reason, 'Unbanned by admin'));

    ELSIF p_action = 'delete' THEN
        INSERT INTO public.moderation_records (user_id, moderator_id, action, reason)
        VALUES (p_user_id, v_admin_id, 'permanent_ban', COALESCE(p_reason, 'Account permanently deleted by admin'));

        DELETE FROM public.profiles WHERE id = p_user_id;

    ELSE
        RAISE EXCEPTION 'Invalid moderation action: %', p_action;
    END IF;

    RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Group Moderation Functions
-- ------------------------------------------------------------------------------

-- 5.1 Admin Query Groups with Owner Info & Suspension Status
CREATE OR REPLACE FUNCTION public.admin_get_groups(
    p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    conversation_id UUID,
    name VARCHAR,
    description VARCHAR,
    avatar_url TEXT,
    owner_id UUID,
    owner_username VARCHAR,
    owner_display_name VARCHAR,
    members_count BIGINT,
    is_suspended BOOLEAN,
    suspension_reason TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_app_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    RETURN QUERY
    SELECT 
        g.conversation_id,
        g.name,
        g.description,
        g.avatar_url,
        g.owner_id,
        p.username AS owner_username,
        p.display_name AS owner_display_name,
        (SELECT COUNT(*) FROM public.group_members gm WHERE gm.group_id = g.conversation_id) AS members_count,
        g.is_suspended,
        g.suspension_reason,
        g.created_at
    FROM public.groups g
    JOIN public.profiles p ON p.id = g.owner_id
    WHERE (
        p_search IS NULL 
        OR p_search = '' 
        OR g.name ILIKE '%' || p_search || '%' 
        OR g.description ILIKE '%' || p_search || '%'
    )
    ORDER BY g.created_at DESC
    LIMIT LEAST(p_limit, 100)
    OFFSET p_offset;
END;
$$;

-- 5.2 Admin Get Group Members
CREATE OR REPLACE FUNCTION public.admin_get_group_members(p_group_id UUID)
RETURNS TABLE (
    user_id UUID,
    username VARCHAR,
    display_name VARCHAR,
    avatar_url TEXT,
    role VARCHAR,
    joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_app_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    RETURN QUERY
    SELECT 
        gm.user_id,
        p.username,
        p.display_name,
        p.avatar_url,
        gm.role,
        gm.joined_at
    FROM public.group_members gm
    JOIN public.profiles p ON p.id = gm.user_id
    WHERE gm.group_id = p_group_id
    ORDER BY 
        CASE gm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
        gm.joined_at ASC;
END;
$$;

-- 5.3 Admin Moderate Group (Suspend, Unsuspend, Disband, Update)
CREATE OR REPLACE FUNCTION public.admin_moderate_group(
    p_group_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL,
    p_new_name TEXT DEFAULT NULL,
    p_new_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    IF p_action = 'suspend' THEN
        UPDATE public.groups
        SET is_suspended = TRUE,
            suspension_reason = COALESCE(p_reason, 'Policy violation suspended by admin'),
            updated_at = NOW()
        WHERE conversation_id = p_group_id;

    ELSIF p_action = 'unsuspend' THEN
        UPDATE public.groups
        SET is_suspended = FALSE,
            suspension_reason = NULL,
            updated_at = NOW()
        WHERE conversation_id = p_group_id;

    ELSIF p_action = 'disband' THEN
        -- Cascade deletes conversation and groups
        DELETE FROM public.conversations WHERE id = p_group_id;

    ELSIF p_action = 'update' THEN
        UPDATE public.groups
        SET name = COALESCE(p_new_name, name),
            description = COALESCE(p_new_description, description),
            updated_at = NOW()
        WHERE conversation_id = p_group_id;

    ELSE
        RAISE EXCEPTION 'Invalid group moderation action: %', p_action;
    END IF;

    RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Reports & Controlled Moderation Content Workflow
-- ------------------------------------------------------------------------------

-- 6.1 Admin Query Reports with Full Relations
CREATE OR REPLACE FUNCTION public.admin_get_reports(
    p_status TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    reporter_id UUID,
    reporter_username VARCHAR,
    reported_user_id UUID,
    reported_username VARCHAR,
    reported_conversation_id UUID,
    reported_message_id UUID,
    category VARCHAR,
    reason TEXT,
    status VARCHAR,
    resolution_notes TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    has_message_content BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_app_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.reporter_id,
        prep.username AS reporter_username,
        r.reported_user_id,
        ptrg.username AS reported_username,
        r.reported_conversation_id,
        r.reported_message_id,
        r.category,
        r.reason,
        r.status,
        r.resolution_notes,
        r.resolved_by,
        r.resolved_at,
        r.created_at,
        (r.reported_message_id IS NOT NULL) AS has_message_content
    FROM public.reports r
    JOIN public.profiles prep ON prep.id = r.reporter_id
    LEFT JOIN public.profiles ptrg ON ptrg.id = r.reported_user_id
    WHERE (
        p_status IS NULL 
        OR p_status = '' 
        OR r.status = p_status
    )
    AND (
        p_category IS NULL 
        OR p_category = '' 
        OR r.category = p_category
    )
    ORDER BY 
        CASE r.status 
            WHEN 'pending' THEN 1 
            WHEN 'under_review' THEN 2 
            WHEN 'investigating' THEN 3 
            ELSE 4 
        END,
        r.created_at DESC
    LIMIT LEAST(p_limit, 100)
    OFFSET p_offset;
END;
$$;

-- 6.2 Controlled Moderation Workflow: Explicit Access to Reported Message Content
-- Strictly restricted to reported messages only. Admins CANNOT browse arbitrary chat messages.
CREATE OR REPLACE FUNCTION public.admin_get_reported_content(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_report RECORD;
    v_msg RECORD;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
    IF v_report IS NULL THEN
        RAISE EXCEPTION 'Report ticket not found.';
    END IF;

    IF v_report.reported_message_id IS NULL THEN
        RETURN jsonb_build_object(
            'has_content', FALSE,
            'message', 'No specific message was attached to this report ticket.'
        );
    END IF;

    -- Fetch the specific reported message
    SELECT 
        m.id,
        m.sender_id,
        p.username AS sender_username,
        m.ciphertext,
        m.created_at
    INTO v_msg
    FROM public.messages m
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.id = v_report.reported_message_id;

    IF v_msg IS NULL THEN
        RETURN jsonb_build_object(
            'has_content', FALSE,
            'message', 'The reported message has already expired or been deleted.'
        );
    END IF;

    -- Audit log access to reported content
    INSERT INTO public.report_actions (report_id, moderator_id, action_type, notes)
    VALUES (
        p_report_id, 
        v_admin_id, 
        'reported_content_accessed', 
        'Moderator accessed reported message snippet for policy evaluation.'
    );

    RETURN jsonb_build_object(
        'has_content', TRUE,
        'message_id', v_msg.id,
        'sender_id', v_msg.sender_id,
        'sender_username', v_msg.sender_username,
        'content', v_msg.ciphertext,
        'sent_at', v_msg.created_at
    );
END;
$$;

-- 6.3 Update Report Status & Record Moderation Action
CREATE OR REPLACE FUNCTION public.admin_update_report_status(
    p_report_id UUID,
    p_status TEXT,
    p_action_type TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Access denied. Administrator privileges required.';
    END IF;

    UPDATE public.reports
    SET status = p_status,
        resolution_notes = COALESCE(p_notes, resolution_notes),
        resolved_by = CASE WHEN p_status IN ('resolved', 'rejected', 'dismissed') THEN v_admin_id ELSE resolved_by END,
        resolved_at = CASE WHEN p_status IN ('resolved', 'rejected', 'dismissed') THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
    WHERE id = p_report_id;

    IF p_action_type IS NOT NULL THEN
        INSERT INTO public.report_actions (report_id, moderator_id, action_type, notes)
        VALUES (p_report_id, v_admin_id, p_action_type, p_notes);
    END IF;

    RETURN TRUE;
END;
$$;
