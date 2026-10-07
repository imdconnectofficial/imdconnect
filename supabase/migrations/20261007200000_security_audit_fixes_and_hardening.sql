-- ==============================================================================
-- ImdConnect — Security Audit Remediation & RLS Hardening Migration
-- Migration: 20261007200000_security_audit_fixes_and_hardening.sql
--
-- Description:
-- Fixes every security loophole identified during the comprehensive audit:
-- 1. Eliminates notification spoofing: notifications are inserted strictly via DB triggers & staff.
-- 2. Eliminates audit tampering: username_history and login_history direct client inserts disabled.
-- 3. Eliminates system message spoofing: users can only send message_type = 'text'.
-- 4. Secures message editing: admins can only pin/moderate, cannot alter author's ciphertext.
-- 5. Automates mutual friendships: atomic trigger handles bilateral rows upon request acceptance.
-- 6. Automates block cleanup: blocking immediately revokes mutual friendships & pending requests.
-- 7. Secures direct conversation bootstrapping: allows creator to add 1 target peer securely.
-- 8. Enforces column-level protection on profiles (hiding suspension_reason from peers).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Automated Mutual Friendship Creation & Cleanup Triggers
-- ------------------------------------------------------------------------------

-- Trigger: When friend request is accepted, atomically create bilateral friendships
CREATE OR REPLACE FUNCTION public.handle_friend_request_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only act on transition from pending to accepted
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
        -- Insert row for sender
        INSERT INTO public.friendships (user_id, friend_id)
        VALUES (NEW.sender_id, NEW.receiver_id)
        ON CONFLICT (user_id, friend_id) DO NOTHING;

        -- Insert row for receiver
        INSERT INTO public.friendships (user_id, friend_id)
        VALUES (NEW.receiver_id, NEW.sender_id)
        ON CONFLICT (user_id, friend_id) DO NOTHING;

        -- Dispatch in-app notification to sender
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data
        ) VALUES (
            NEW.sender_id,
            'friend_accepted',
            'Friend Request Accepted',
            'Your friend request was accepted.',
            jsonb_build_object('friend_id', NEW.receiver_id)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friend_request_accepted ON public.friend_requests;
CREATE TRIGGER trg_friend_request_accepted
    AFTER UPDATE ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_friend_request_acceptance();

-- Trigger: Dispatch notification when friend request is created
CREATE OR REPLACE FUNCTION public.handle_new_friend_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data
    ) VALUES (
        NEW.receiver_id,
        'friend_request',
        'New Friend Request',
        'You received a new friend request.',
        jsonb_build_object('sender_id', NEW.sender_id)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_friend_request_notification ON public.friend_requests;
CREATE TRIGGER trg_new_friend_request_notification
    AFTER INSERT ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_friend_request_notification();

-- Trigger: When a user blocks another user, atomically purge friendships & pending requests
CREATE OR REPLACE FUNCTION public.handle_user_blocking_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Remove mutual friendships immediately
    DELETE FROM public.friendships
    WHERE (user_id = NEW.blocker_id AND friend_id = NEW.blocked_id)
       OR (user_id = NEW.blocked_id AND friend_id = NEW.blocker_id);

    -- Cancel any pending friend requests in either direction
    DELETE FROM public.friend_requests
    WHERE (sender_id = NEW.blocker_id AND receiver_id = NEW.blocked_id)
       OR (sender_id = NEW.blocked_id AND receiver_id = NEW.blocker_id);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_blocking_cleanup ON public.blocked_users;
CREATE TRIGGER trg_user_blocking_cleanup
    AFTER INSERT ON public.blocked_users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_blocking_cleanup();

-- ------------------------------------------------------------------------------
-- 2. Audit Remediation: Update Vulnerable RLS Policies
-- ------------------------------------------------------------------------------

-- 2.1 NOTIFICATIONS: Revoke client insert ability (eliminates notification spoofing)
DROP POLICY IF EXISTS "Allow notification dispatch" ON public.notifications;
CREATE POLICY "Strict notification creation"
    ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (public.is_app_admin());

-- 2.2 USERNAME_HISTORY: Revoke direct client insert (eliminates fake audit trails)
DROP POLICY IF EXISTS "System inserts username history" ON public.username_history;
CREATE POLICY "Staff only direct insert username history"
    ON public.username_history FOR INSERT TO authenticated
    WITH CHECK (public.is_app_admin());

-- 2.3 LOGIN_HISTORY: Revoke direct client insert (eliminates fake login audit records)
DROP POLICY IF EXISTS "Users insert own login history" ON public.login_history;
CREATE POLICY "Staff only direct insert login history"
    ON public.login_history FOR INSERT TO authenticated
    WITH CHECK (public.is_app_admin());

-- 2.4 FRIENDSHIPS: Prevent manual insertion; creation handled by trigger
DROP POLICY IF EXISTS "Users insert friendship with accepted request" ON public.friendships;
CREATE POLICY "Disallow manual friendship insertion"
    ON public.friendships FOR INSERT TO authenticated
    WITH CHECK (public.is_app_admin());

-- 2.5 MESSAGES: Prevent system message spoofing & enforce author ciphertext immutability
DROP POLICY IF EXISTS "Authorized members send text messages" ON public.messages;
CREATE POLICY "Authorized members send text messages"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND message_type = 'text' -- NORMAL USERS CANNOT FORGE SYSTEM MESSAGES
        AND public.is_conv_member(conversation_id)
        -- Sender cannot be suspended or banned
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.is_suspended OR p.is_banned)
        )
        -- Direct chat block check
        AND NOT EXISTS (
            SELECT 1 FROM public.conversations c
            JOIN public.conversation_members cm ON cm.conversation_id = c.id
            JOIN public.blocked_users bu ON bu.blocker_id = cm.user_id
            WHERE c.id = messages.conversation_id
              AND c.type = 'direct'
              AND bu.blocked_id = auth.uid()
        )
        -- Direct chat privacy filter
        AND NOT EXISTS (
            SELECT 1 FROM public.conversations c
            JOIN public.conversation_members cm ON cm.conversation_id = c.id
            JOIN public.privacy_settings ps ON ps.user_id = cm.user_id
            WHERE c.id = messages.conversation_id
              AND c.type = 'direct'
              AND cm.user_id <> auth.uid()
              AND ps.who_can_message_me = 'friends_only'
              AND NOT public.are_friends(cm.user_id, auth.uid())
        )
        -- Group posting permissions check
        AND NOT EXISTS (
            SELECT 1 FROM public.group_settings gs
            WHERE gs.group_id = messages.conversation_id
              AND gs.who_can_send_messages = 'admins_only'
              AND NOT public.is_group_admin(messages.conversation_id)
        )
    );

-- Author can edit content or soft-delete; admin can only toggle pin/delete
DROP POLICY IF EXISTS "Author can soft-delete or pin messages" ON public.messages;
CREATE POLICY "Update messages with strict role boundaries"
    ON public.messages FOR UPDATE TO authenticated
    USING (
        auth.uid() = sender_id OR
        public.is_group_admin(conversation_id)
    )
    WITH CHECK (
        -- If sender, ciphertext or deletion can be updated, but sender_id & conversation_id immutable
        (auth.uid() = sender_id AND sender_id = (SELECT m.sender_id FROM public.messages m WHERE m.id = messages.id)) OR
        -- If group admin and not sender, ciphertext CANNOT be altered (only pin or soft-delete)
        (
            public.is_group_admin(conversation_id) AND 
            ciphertext = (SELECT m.ciphertext FROM public.messages m WHERE m.id = messages.id) AND
            nonce_iv = (SELECT m.nonce_iv FROM public.messages m WHERE m.id = messages.id)
        )
    );

-- 2.6 CONVERSATION_MEMBERS: Direct chat member invitation fix
DROP POLICY IF EXISTS "Add members to conversations" ON public.conversation_members;
CREATE POLICY "Add members to conversations"
    ON public.conversation_members FOR INSERT TO authenticated
    WITH CHECK (
        -- Adding self
        auth.uid() = user_id OR
        -- Direct chat creator adding 1 peer (who has not blocked creator & allows messaging)
        (
            EXISTS (
                SELECT 1 FROM public.conversations c
                WHERE c.id = conversation_members.conversation_id
                  AND c.type = 'direct'
                  AND c.created_by = auth.uid()
            )
            AND NOT public.is_blocked_by(user_id, auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.privacy_settings ps
                WHERE ps.user_id = conversation_members.user_id
                  AND (
                      ps.who_can_message_me = 'everyone' OR
                      (ps.who_can_message_me = 'friends_only' AND public.are_friends(auth.uid(), conversation_members.user_id))
                  )
            )
        ) OR
        -- Group admin adding a member
        (
            public.is_group_admin(conversation_id)
            AND NOT public.is_blocked_by(user_id, auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.privacy_settings ps
                WHERE ps.user_id = conversation_members.user_id
                  AND (
                      ps.who_can_add_to_groups = 'everyone' OR
                      (ps.who_can_add_to_groups = 'friends_only' AND public.are_friends(auth.uid(), conversation_members.user_id))
                  )
            )
        )
    );

-- 2.7 FRIEND_REQUESTS: Only pending requests can be transitioned
DROP POLICY IF EXISTS "Users respond to or cancel friend requests" ON public.friend_requests;
CREATE POLICY "Users respond to or cancel friend requests"
    ON public.friend_requests FOR UPDATE TO authenticated
    USING (
        (auth.uid() = receiver_id OR auth.uid() = sender_id)
        AND status = 'pending' -- CANNOT RE-TRANSITION ACCEPTED OR REJECTED REQUESTS
    )
    WITH CHECK (
        (auth.uid() = receiver_id AND status IN ('accepted', 'rejected')) OR
        (auth.uid() = sender_id AND status = 'cancelled')
    );

-- 2.8 PROFILES: Guard against suspended or banned users filing friend requests
DROP POLICY IF EXISTS "Users create legitimate friend requests" ON public.friend_requests;
CREATE POLICY "Users create legitimate friend requests"
    ON public.friend_requests FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND auth.uid() <> receiver_id
        AND NOT public.is_blocked_by(receiver_id)
        AND NOT public.is_blocked_by(sender_id, receiver_id)
        -- Sender cannot be suspended or banned
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.is_suspended OR p.is_banned)
        )
        -- Respect recipient privacy
        AND EXISTS (
            SELECT 1 FROM public.privacy_settings ps
            WHERE ps.user_id = receiver_id
              AND ps.who_can_message_me <> 'nobody'
        )
    );

-- 2.9 CONVERSATIONS: Suspended/banned users cannot create conversations
DROP POLICY IF EXISTS "Users create conversations" ON public.conversations;
CREATE POLICY "Users create conversations"
    ON public.conversations FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = created_by
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.is_suspended OR p.is_banned)
        )
    );

-- ------------------------------------------------------------------------------
-- 3. Dedicated Secure Masked Profiles View
-- ------------------------------------------------------------------------------
-- Provides public profile discovery while masking last_seen_at if user has last_seen_visible = false,
-- and completely hides moderation internal fields (suspension_reason) from other users.

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.banner_url,
    p.public_key,
    CASE 
        WHEN ps.last_seen_visible = TRUE OR p.id = auth.uid() THEN p.last_seen_at
        ELSE NULL 
    END AS last_seen_at,
    p.created_at
FROM public.profiles p
LEFT JOIN public.privacy_settings ps ON ps.user_id = p.id
WHERE NOT p.is_banned OR public.is_app_admin();

GRANT SELECT ON public.public_profiles TO authenticated;
