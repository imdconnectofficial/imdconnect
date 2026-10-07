-- ==============================================================================
-- ImdConnect — Complete Social Friend System Migration
-- Migration: 20261007250000_complete_friend_system.sql
--
-- Features:
-- 1. Strict messaging policy: No direct messages before mutual friendship is accepted.
-- 2. Block rules override all messaging and friend permissions.
-- 3. Atomic friend requests: mutual collision auto-acceptance & race-condition resilience.
-- 4. Bilateral friendship removal and block cascades.
-- 5. Safe social search by username or display name with zero DOB exposure.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Harden Message RLS: Direct Messages Strictly Require Accepted Friendship
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authorized members send text messages" ON public.messages;

CREATE POLICY "Authorized members send text messages"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND message_type = 'text' -- Normal users can only send text
        AND public.is_conv_member(conversation_id)
        -- Sender cannot be suspended or banned
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.is_suspended OR p.is_banned)
        )
        -- DIRECT CHATS: Must be mutual accepted friends, neither blocked, messaging not disabled
        AND (
            -- Either it's a group conversation
            EXISTS (
                SELECT 1 FROM public.conversations c
                WHERE c.id = messages.conversation_id AND c.type = 'group'
            )
            OR
            -- Or it's a direct conversation where friendship is ACCEPTED & mutual
            (
                EXISTS (
                    SELECT 1 FROM public.conversations c
                    JOIN public.conversation_members cm ON cm.conversation_id = c.id
                    WHERE c.id = messages.conversation_id
                      AND c.type = 'direct'
                      AND cm.user_id <> auth.uid()
                      -- Must be mutual friends
                      AND public.are_friends(auth.uid(), cm.user_id)
                      -- Block rules override messaging
                      AND NOT public.is_blocked_by(auth.uid(), cm.user_id)
                      AND NOT public.is_blocked_by(cm.user_id, auth.uid())
                      -- Peer privacy filter
                      AND NOT EXISTS (
                          SELECT 1 FROM public.privacy_settings ps
                          WHERE ps.user_id = cm.user_id
                            AND ps.who_can_message_me = 'nobody'
                      )
                )
            )
        )
        -- GROUP CHATS: Group posting permissions check
        AND NOT EXISTS (
            SELECT 1 FROM public.group_settings gs
            WHERE gs.group_id = messages.conversation_id
              AND gs.who_can_send_messages = 'admins_only'
              AND NOT public.is_group_admin(messages.conversation_id)
        )
    );

-- ------------------------------------------------------------------------------
-- 2. RPC: Atomic Send Friend Request (Handles Collisions & Auto-Accepts Mutual)
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

        -- Mutual friendships are created by trigger trg_friend_request_accepted
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

    -- Insert brand new friend request
    INSERT INTO public.friend_requests (sender_id, receiver_id, status)
    VALUES (v_caller_id, p_target_id, 'pending');

    RETURN jsonb_build_object('success', TRUE, 'status', 'pending', 'message', 'Friend request sent.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC: Respond to Friend Request (Accept, Reject, Cancel)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_friend_request(
    p_request_id UUID,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_req RECORD;
    v_action TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_action := LOWER(TRIM(p_action));
    IF v_action NOT IN ('accept', 'reject', 'cancel') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid action. Must be accept, reject, or cancel.');
    END IF;

    SELECT * INTO v_req 
    FROM public.friend_requests 
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_req IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Friend request not found.');
    END IF;

    IF v_req.status <> 'pending' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'This request is no longer pending.');
    END IF;

    -- Handle Cancel (by sender)
    IF v_action = 'cancel' THEN
        IF v_req.sender_id <> v_caller_id THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Only the sender can cancel this request.');
        END IF;

        UPDATE public.friend_requests
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', TRUE, 'status', 'cancelled', 'message', 'Friend request cancelled.');
    END IF;

    -- Handle Accept or Reject (by receiver)
    IF v_req.receiver_id <> v_caller_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Only the recipient can accept or reject this request.');
    END IF;

    -- Check if sender is blocked
    IF public.is_blocked_by(v_caller_id, v_req.sender_id) OR public.is_blocked_by(v_req.sender_id, v_caller_id) THEN
        UPDATE public.friend_requests SET status = 'rejected', updated_at = NOW() WHERE id = p_request_id;
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot accept request from a blocked user.');
    END IF;

    IF v_action = 'accept' THEN
        UPDATE public.friend_requests
        SET status = 'accepted', updated_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', TRUE, 'status', 'accepted', 'message', 'Friend request accepted.');
    ELSE
        UPDATE public.friend_requests
        SET status = 'rejected', updated_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', TRUE, 'status', 'rejected', 'message', 'Friend request declined.');
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_friend_request(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC: Remove Friend (Atomically Removes Bilateral Friendships)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Delete bilateral friendships
    DELETE FROM public.friendships
    WHERE (user_id = v_caller_id AND friend_id = p_friend_id)
       OR (user_id = p_friend_id AND friend_id = v_caller_id);

    -- Clean up associated requests
    DELETE FROM public.friend_requests
    WHERE (sender_id = v_caller_id AND receiver_id = p_friend_id)
       OR (sender_id = p_friend_id AND receiver_id = v_caller_id);

    RETURN jsonb_build_object('success', TRUE, 'message', 'Friend removed successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_friend(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC: Block and Unblock User Procedures
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.block_user_safe(p_target_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF v_caller_id = p_target_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'You cannot block yourself.');
    END IF;

    INSERT INTO public.blocked_users (blocker_id, blocked_id, reason)
    VALUES (v_caller_id, p_target_id, p_reason)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

    -- Trigger trg_user_blocking_cleanup automatically purges friendships & pending requests

    RETURN jsonb_build_object('success', TRUE, 'message', 'User blocked successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user_safe(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_user_safe(p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    DELETE FROM public.blocked_users
    WHERE blocker_id = v_caller_id AND blocked_id = p_target_id;

    RETURN jsonb_build_object('success', TRUE, 'message', 'User unblocked successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.unblock_user_safe(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: Social User Search (Respects Blocks, Privacy, Zero DOB Disclosure)
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
            p.avatar_url,
            p.bio,
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
            -- Can message (STRICT RULE: Only if mutual accepted friends and not blocked)
            (
                public.are_friends(v_caller_id, p.id) 
                AND NOT public.is_blocked_by(v_caller_id, p.id)
                AND NOT public.is_blocked_by(p.id, v_caller_id)
            ) AS can_message
        FROM public.profiles p
        WHERE p.id <> v_caller_id
          AND NOT p.is_banned
          AND NOT p.is_deactivated
          -- Exclude if blocked by target user
          AND NOT EXISTS (
              SELECT 1 FROM public.blocked_users bu
              WHERE bu.blocker_id = p.id AND bu.blocked_id = v_caller_id
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
-- 7. RPC: Get Complete Social Overview (Friends, Incoming, Outgoing, Blocked)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_social_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_friends JSONB;
    v_incoming JSONB;
    v_outgoing JSONB;
    v_blocked JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- 1. Friends list
    SELECT jsonb_agg(f_sub) INTO v_friends
    FROM (
        SELECT 
            p.id,
            p.username,
            p.display_name,
            p.avatar_url,
            p.bio,
            f.created_at AS friendship_since,
            p.last_seen_at
        FROM public.friendships f
        JOIN public.profiles p ON p.id = f.friend_id
        WHERE f.user_id = v_caller_id
          AND NOT p.is_banned
          AND NOT p.is_deactivated
        ORDER BY p.display_name ASC
    ) f_sub;

    -- 2. Pending Incoming Requests
    SELECT jsonb_agg(in_sub) INTO v_incoming
    FROM (
        SELECT 
            fr.id AS request_id,
            p.id AS sender_id,
            p.username,
            p.display_name,
            p.avatar_url,
            p.bio,
            fr.created_at
        FROM public.friend_requests fr
        JOIN public.profiles p ON p.id = fr.sender_id
        WHERE fr.receiver_id = v_caller_id
          AND fr.status = 'pending'
          AND NOT p.is_banned
          AND NOT p.is_deactivated
        ORDER BY fr.created_at DESC
    ) in_sub;

    -- 3. Pending Outgoing Requests
    SELECT jsonb_agg(out_sub) INTO v_outgoing
    FROM (
        SELECT 
            fr.id AS request_id,
            p.id AS receiver_id,
            p.username,
            p.display_name,
            p.avatar_url,
            p.bio,
            fr.created_at
        FROM public.friend_requests fr
        JOIN public.profiles p ON p.id = fr.receiver_id
        WHERE fr.sender_id = v_caller_id
          AND fr.status = 'pending'
          AND NOT p.is_banned
          AND NOT p.is_deactivated
        ORDER BY fr.created_at DESC
    ) out_sub;

    -- 4. Blocked Users
    SELECT jsonb_agg(blk_sub) INTO v_blocked
    FROM (
        SELECT 
            p.id AS blocked_id,
            p.username,
            p.display_name,
            p.avatar_url,
            bu.reason,
            bu.created_at AS blocked_at
        FROM public.blocked_users bu
        JOIN public.profiles p ON p.id = bu.blocked_id
        WHERE bu.blocker_id = v_caller_id
        ORDER BY bu.created_at DESC
    ) blk_sub;

    RETURN jsonb_build_object(
        'friends', COALESCE(v_friends, jsonb_build_array()),
        'pending_incoming', COALESCE(v_incoming, jsonb_build_array()),
        'pending_outgoing', COALESCE(v_outgoing, jsonb_build_array()),
        'blocked', COALESCE(v_blocked, jsonb_build_array())
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_social_overview() TO authenticated;
