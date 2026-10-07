-- ==============================================================================
-- ImdConnect — Production Security Audit Hardening Migration
-- Migration: 20261007330000_production_security_audit_hardening.sql
--
-- Security Audit Remediations:
-- 1. Brute Force Protection: Failed login tracking & 15-minute lockout on profiles.
-- 2. Friend Request Abuse Mitigation: Target privacy permission check & rate limiting.
-- 3. Messages Authorization: Strict block on message insertion into suspended groups.
-- 4. Privacy Settings Leak Remediation: public.public_profiles dynamic masking.
-- 5. User Search Privacy: Respect privacy_settings.who_can_find_me in search_users_social.
-- 6. Session Invalidation: revoke_all_user_sessions RPC.
-- 7. Account Deletion Hardening: Group ownership succession before auth.users deletion.
-- 8. Realtime Replication: REPLICA IDENTITY FULL on subscribed tables.
-- 9. Compound Security Indexes on sessions, profiles, and messages.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Brute Force Protection: Add Lockout Columns to Profiles
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'failed_login_attempts'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'locked_until'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN locked_until TIMESTAMPTZ DEFAULT NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Hardened authenticate_with_username with Brute Force Lockout
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.authenticate_with_username(
    p_username TEXT,
    p_password TEXT
)
RETURNS TABLE (
    email TEXT,
    is_deactivated BOOLEAN,
    is_suspended BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    target_user_id UUID;
    target_email TEXT;
    target_hash TEXT;
    target_deactivated BOOLEAN;
    target_suspended BOOLEAN;
    target_banned BOOLEAN;
    target_failed_attempts INT;
    target_locked_until TIMESTAMPTZ;
    dummy_hash TEXT := '$2a$10$7EqJtq98hPqEX7fNZaFWoO.8/q.v6d.Y8c1.P.y4m3g0H/u0w.iG.';
    password_valid BOOLEAN := FALSE;
BEGIN
    -- 1. Lookup user by sanitized username
    SELECT 
        p.id,
        p.is_deactivated,
        p.is_suspended,
        p.is_banned,
        p.failed_login_attempts,
        p.locked_until,
        u.email,
        u.encrypted_password
    INTO 
        target_user_id,
        target_deactivated,
        target_suspended,
        target_banned,
        target_failed_attempts,
        target_locked_until,
        target_email,
        target_hash
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.username = LOWER(TRIM(p_username));

    -- 2. Check if account is temporarily locked due to brute force
    IF target_user_id IS NOT NULL AND target_locked_until IS NOT NULL AND target_locked_until > NOW() THEN
        -- Run dummy crypt to maintain constant response timing
        PERFORM crypt(p_password, dummy_hash);
        RETURN;
    END IF;

    -- 3. Verify password with timing attack mitigation
    IF target_user_id IS NOT NULL AND target_hash IS NOT NULL THEN
        password_valid := (target_hash = crypt(p_password, target_hash));
    ELSE
        -- Account does not exist: run dummy crypt to prevent timing enumeration
        PERFORM crypt(p_password, dummy_hash);
        password_valid := FALSE;
    END IF;

    -- 4. Process outcome and manage lockout counter
    IF target_user_id IS NOT NULL THEN
        IF password_valid = TRUE AND target_banned = FALSE THEN
            -- Reset failed attempts on success
            UPDATE public.profiles
            SET failed_login_attempts = 0,
                locked_until = NULL
            WHERE id = target_user_id;

            RETURN QUERY SELECT target_email, target_deactivated, target_suspended;
        ELSE
            -- Increment failed attempt counter
            IF target_failed_attempts + 1 >= 5 THEN
                UPDATE public.profiles
                SET failed_login_attempts = target_failed_attempts + 1,
                    locked_until = NOW() + INTERVAL '15 minutes'
                WHERE id = target_user_id;
            ELSE
                UPDATE public.profiles
                SET failed_login_attempts = target_failed_attempts + 1
                WHERE id = target_user_id;
            END IF;
            RETURN;
        END IF;
    ELSE
        RETURN;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.authenticate_with_username(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. Hardened send_friend_request with Privacy Permissions & Rate Limiting
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_friend_request(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_existing RECORD;
    v_mutual RECORD;
    v_target_permission VARCHAR(20);
    v_recent_request_count INT;
    v_has_mutual_friends BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF v_caller_id = p_target_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'You cannot send a friend request to yourself.');
    END IF;

    -- Verify target user exists and is active
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_id AND NOT is_banned AND NOT is_deactivated) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'User not found or unavailable.');
    END IF;

    -- Block check: Block rules override everything
    IF public.is_blocked_by(v_caller_id, p_target_id) OR public.is_blocked_by(p_target_id, v_caller_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot send friend request to this user.');
    END IF;

    -- Already mutual friends check
    IF public.are_friends(v_caller_id, p_target_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'You are already friends with this user.', 'status', 'already_friends');
    END IF;

    -- Rate limiting check: Max 30 requests per hour to prevent spam/abuse
    SELECT COUNT(*) INTO v_recent_request_count
    FROM public.friend_requests
    WHERE sender_id = v_caller_id
      AND created_at >= NOW() - INTERVAL '1 hour';

    IF v_recent_request_count >= 30 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Friend request rate limit reached. Please try again later.');
    END IF;

    -- Target privacy permission check: 'everyone', 'friends_of_friends', 'nobody'
    SELECT COALESCE(friend_request_permissions, 'everyone') INTO v_target_permission
    FROM public.privacy_settings
    WHERE user_id = p_target_id;

    IF v_target_permission = 'nobody' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'This user does not accept friend requests.');
    ELSIF v_target_permission = 'friends_of_friends' THEN
        SELECT EXISTS (
            SELECT 1 
            FROM public.friendships f1
            JOIN public.friendships f2 ON f1.friend_id = f2.friend_id
            WHERE f1.user_id = v_caller_id AND f2.user_id = p_target_id
        ) INTO v_has_mutual_friends;

        IF NOT v_has_mutual_friends THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'This user only accepts friend requests from friends of friends.');
        END IF;
    END IF;

    -- Race condition / Mutual interest check: Did target already send a pending request to caller?
    SELECT * INTO v_mutual 
    FROM public.friend_requests 
    WHERE sender_id = p_target_id AND receiver_id = v_caller_id AND status = 'pending'
    FOR UPDATE;

    IF v_mutual IS NOT NULL THEN
        -- Auto-accept target's request!
        UPDATE public.friend_requests
        SET status = 'accepted', updated_at = NOW()
        WHERE id = v_mutual.id;

        RETURN jsonb_build_object(
            'success', TRUE, 
            'status', 'accepted', 
            'message', 'Mutual request detected! You are now friends.'
        );
    END IF;

    -- Outgoing request check: Was there an existing request from caller to target?
    SELECT * INTO v_existing 
    FROM public.friend_requests 
    WHERE sender_id = v_caller_id AND receiver_id = p_target_id
    FOR UPDATE;

    IF v_existing IS NOT NULL THEN
        IF v_existing.status = 'pending' THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Friend request is already pending.', 'status', 'pending');
        END IF;

        -- Re-open rejected or cancelled request
        UPDATE public.friend_requests
        SET status = 'pending', updated_at = NOW()
        WHERE id = v_existing.id;

        RETURN jsonb_build_object('success', TRUE, 'status', 'pending', 'message', 'Friend request sent.');
    END IF;

    -- Insert new request
    INSERT INTO public.friend_requests (sender_id, receiver_id, status)
    VALUES (v_caller_id, p_target_id, 'pending');

    RETURN jsonb_build_object('success', TRUE, 'status', 'pending', 'message', 'Friend request sent.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. Messages RLS Hardening: Reject Posting to Suspended Groups
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authorized members send text messages" ON public.messages;

CREATE POLICY "Authorized members send text messages"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND message_type = 'text'
        AND public.is_conv_member(conversation_id)
        -- Sender cannot be suspended or banned
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.is_suspended OR p.is_banned)
        )
        -- DIRECT CHATS: Must be mutual accepted friends, neither blocked, messaging not disabled
        AND (
            -- Group conversation
            EXISTS (
                SELECT 1 FROM public.conversations c
                WHERE c.id = messages.conversation_id AND c.type = 'group'
            )
            OR
            -- Direct conversation where friendship is ACCEPTED & mutual
            (
                EXISTS (
                    SELECT 1 FROM public.conversations c
                    JOIN public.conversation_members cm ON cm.conversation_id = c.id
                    WHERE c.id = messages.conversation_id
                      AND c.type = 'direct'
                      AND cm.user_id <> auth.uid()
                      AND public.are_friends(auth.uid(), cm.user_id)
                      AND NOT public.is_blocked_by(auth.uid(), cm.user_id)
                      AND NOT public.is_blocked_by(cm.user_id, auth.uid())
                      AND NOT EXISTS (
                          SELECT 1 FROM public.privacy_settings ps
                          WHERE ps.user_id = cm.user_id
                            AND ps.who_can_message_me = 'nobody'
                      )
                )
            )
        )
        -- GROUP CHATS: Group posting permissions check & NOT suspended
        AND NOT EXISTS (
            SELECT 1 FROM public.group_settings gs
            WHERE gs.group_id = messages.conversation_id
              AND gs.who_can_send_messages = 'admins_only'
              AND NOT public.is_group_admin(messages.conversation_id)
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.conversation_id = messages.conversation_id
              AND g.is_suspended = TRUE
        )
    );

-- ------------------------------------------------------------------------------
-- 5. Hardened public.public_profiles View: Dynamic Privacy Masking
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    p.id,
    p.username,
    p.display_name,
    -- Bio: visible if owner, admin, or permitted by profile_visibility
    CASE 
        WHEN p.id = auth.uid() OR public.is_app_admin() THEN p.bio
        WHEN public.is_blocked_by(p.id, auth.uid()) OR public.is_blocked_by(auth.uid(), p.id) THEN NULL
        WHEN COALESCE(ps.profile_visibility, 'everyone') = 'everyone' THEN p.bio
        WHEN ps.profile_visibility = 'friends_only' AND public.are_friends(p.id, auth.uid()) THEN p.bio
        ELSE NULL
    END AS bio,
    -- Avatar URL: visible if owner, admin, or permitted by avatar_visibility
    CASE 
        WHEN p.id = auth.uid() OR public.is_app_admin() THEN p.avatar_url
        WHEN public.is_blocked_by(p.id, auth.uid()) OR public.is_blocked_by(auth.uid(), p.id) THEN NULL
        WHEN COALESCE(ps.avatar_visibility, 'everyone') = 'everyone' THEN p.avatar_url
        WHEN ps.avatar_visibility = 'friends_only' AND public.are_friends(p.id, auth.uid()) THEN p.avatar_url
        ELSE NULL
    END AS avatar_url,
    -- Banner URL: follows profile_visibility
    CASE 
        WHEN p.id = auth.uid() OR public.is_app_admin() THEN p.banner_url
        WHEN public.is_blocked_by(p.id, auth.uid()) OR public.is_blocked_by(auth.uid(), p.id) THEN NULL
        WHEN COALESCE(ps.profile_visibility, 'everyone') = 'everyone' THEN p.banner_url
        WHEN ps.profile_visibility = 'friends_only' AND public.are_friends(p.id, auth.uid()) THEN p.banner_url
        ELSE NULL
    END AS banner_url,
    p.public_key,
    -- Last seen: visible if owner, admin, or permitted by last_seen
    CASE 
        WHEN p.id = auth.uid() OR public.is_app_admin() THEN p.last_seen_at
        WHEN public.is_blocked_by(p.id, auth.uid()) OR public.is_blocked_by(auth.uid(), p.id) THEN NULL
        WHEN COALESCE(ps.last_seen, 'everyone') = 'everyone' THEN p.last_seen_at
        WHEN ps.last_seen = 'friends_only' AND public.are_friends(p.id, auth.uid()) THEN p.last_seen_at
        ELSE NULL 
    END AS last_seen_at,
    -- Birth date: strictly visible ONLY to account owner or staff
    CASE
        WHEN p.id = auth.uid() OR public.is_app_admin() THEN p.birth_date
        ELSE NULL
    END AS birth_date,
    p.created_at
FROM public.profiles p
LEFT JOIN public.privacy_settings ps ON ps.user_id = p.id
WHERE (NOT p.is_banned OR public.is_app_admin())
  AND (NOT p.is_deactivated OR p.id = auth.uid() OR public.is_app_admin());

GRANT SELECT ON public.public_profiles TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Hardened search_users_social: Respect who_can_find_me Privacy
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_users_social(
    p_query TEXT,
    p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_cleaned TEXT;
    v_results JSONB;
BEGIN
    v_caller_id := auth.uid();
    v_cleaned := LOWER(TRIM(p_query));
    v_cleaned := REGEXP_REPLACE(v_cleaned, '^@', '');

    IF LENGTH(v_cleaned) < 1 THEN
        RETURN jsonb_build_array();
    END IF;

    SELECT jsonb_agg(sub) INTO v_results
    FROM (
        SELECT 
            p.id,
            p.username,
            p.display_name,
            -- Mask avatar according to avatar_visibility
            CASE 
                WHEN COALESCE(ps.avatar_visibility, 'everyone') = 'everyone' THEN p.avatar_url
                WHEN ps.avatar_visibility = 'friends_only' AND public.are_friends(v_caller_id, p.id) THEN p.avatar_url
                ELSE NULL
            END AS avatar_url,
            -- Mask bio according to profile_visibility
            CASE 
                WHEN COALESCE(ps.profile_visibility, 'everyone') = 'everyone' THEN p.bio
                WHEN ps.profile_visibility = 'friends_only' AND public.are_friends(v_caller_id, p.id) THEN p.bio
                ELSE NULL
            END AS bio,
            -- Mutual friendship status
            public.are_friends(v_caller_id, p.id) AS is_friend,
            -- Pending request status
            (
                SELECT 
                    CASE 
                        WHEN fr.sender_id = v_caller_id THEN 'pending_outgoing'
                        WHEN fr.receiver_id = v_caller_id THEN 'pending_incoming'
                        ELSE 'none'
                    END
                FROM public.friend_requests fr
                WHERE ((fr.sender_id = v_caller_id AND fr.receiver_id = p.id)
                    OR (fr.sender_id = p.id AND fr.receiver_id = v_caller_id))
                  AND fr.status = 'pending'
                LIMIT 1
            ) AS request_status,
            -- Blocking status
            EXISTS (
                SELECT 1 FROM public.blocked_users bu
                WHERE bu.blocker_id = v_caller_id AND bu.blocked_id = p.id
            ) AS is_blocked_by_me,
            -- Can message
            (
                public.are_friends(v_caller_id, p.id) 
                AND NOT public.is_blocked_by(v_caller_id, p.id)
                AND NOT public.is_blocked_by(p.id, v_caller_id)
            ) AS can_message
        FROM public.profiles p
        LEFT JOIN public.privacy_settings ps ON ps.user_id = p.id
        WHERE p.id <> v_caller_id
          AND NOT p.is_banned
          AND NOT p.is_deactivated
          -- Exclude if blocked in either direction
          AND NOT public.is_blocked_by(v_caller_id, p.id)
          AND NOT public.is_blocked_by(p.id, v_caller_id)
          -- Respect who_can_find_me privacy setting
          AND (
              COALESCE(ps.who_can_find_me, 'everyone') = 'everyone'
              OR (ps.who_can_find_me = 'friends_only' AND public.are_friends(v_caller_id, p.id))
          )
          -- Match username or display name
          AND (
              p.username ILIKE v_cleaned || '%' 
              OR p.display_name ILIKE '%' || v_cleaned || '%'
          )
        LIMIT p_limit
    ) sub;

    RETURN COALESCE(v_results, jsonb_build_array());
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users_social(TEXT, INT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. Revoke All User Sessions RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_all_user_sessions(p_except_session_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_revoked_count INT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_except_session_id IS NOT NULL THEN
        UPDATE public.user_sessions
        SET is_revoked = TRUE
        WHERE user_id = v_caller_id
          AND id <> p_except_session_id
          AND is_revoked = FALSE;
    ELSE
        UPDATE public.user_sessions
        SET is_revoked = TRUE
        WHERE user_id = v_caller_id
          AND is_revoked = FALSE;
    END IF;

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;
    RETURN v_revoked_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_all_user_sessions(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. Hardened delete_account with Group Ownership Succession (GDPR Safe)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    current_user_id UUID;
    grp_rec RECORD;
    v_successor_id UUID;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated.';
    END IF;

    -- Safeguard for groups owned by user:
    -- Transfer ownership to senior-most admin/member, or delete group if sole member
    FOR grp_rec IN (SELECT conversation_id FROM public.groups WHERE owner_id = current_user_id) LOOP
        SELECT user_id INTO v_successor_id 
        FROM public.group_members 
        WHERE group_id = grp_rec.conversation_id AND user_id <> current_user_id 
        ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, joined_at ASC 
        LIMIT 1;

        IF v_successor_id IS NOT NULL THEN
            UPDATE public.groups 
            SET owner_id = v_successor_id, updated_at = NOW() 
            WHERE conversation_id = grp_rec.conversation_id;

            UPDATE public.group_members 
            SET role = 'owner' 
            WHERE group_id = grp_rec.conversation_id AND user_id = v_successor_id;

            UPDATE public.conversation_members 
            SET role = 'owner' 
            WHERE conversation_id = grp_rec.conversation_id AND user_id = v_successor_id;
        ELSE
            -- Sole member: delete group and associated conversation cascade
            DELETE FROM public.conversations WHERE id = grp_rec.conversation_id;
        END IF;
    END LOOP;

    -- Deleting from auth.users cascades to profiles, conversation_members, messages, sessions, etc.
    DELETE FROM auth.users
    WHERE id = current_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;

-- ------------------------------------------------------------------------------
-- 9. Realtime Replication: Full Replica Identity for Subscribers
-- ------------------------------------------------------------------------------

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_reads REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;

-- ------------------------------------------------------------------------------
-- 10. Performance & Security Compound Indexes
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_revoked 
    ON public.user_sessions(user_id, is_revoked);

CREATE INDEX IF NOT EXISTS idx_profiles_suspended_banned 
    ON public.profiles(is_suspended, is_banned);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
    ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_created 
    ON public.friend_requests(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_settings_user_find 
    ON public.privacy_settings(user_id, who_can_find_me);
