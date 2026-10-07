-- ==============================================================================
-- ImdConnect — Complete Notification Center Migration
-- Migration: 20261007300000_complete_notification_center.sql
--
-- Supported Types:
-- 1.  NEW_FRIEND_REQUEST
-- 2.  FRIEND_REQUEST_ACCEPTED
-- 3.  NEW_MESSAGE
-- 4.  GROUP_INVITATION
-- 5.  ADDED_TO_GROUP
-- 6.  REMOVED_FROM_GROUP
-- 7.  MADE_ADMIN
-- 8.  REMOVED_AS_ADMIN
-- 9.  SCREENSHOT_ATTEMPT
-- 10. SECURITY_ALERT
--
-- Features:
-- - Schema constraint expansion supporting all 10 types
-- - Supabase Realtime publication registration
-- - Atomic RPCs: mark read, mark all read, get unread count, dispatch, record screenshot attempt, send group invite
-- - Database triggers for automatic lifecycle events (friend requests, messages, group actions)
-- - Strict RLS policies enforcing tenant data isolation
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema Extensions & Type Constraints
-- ------------------------------------------------------------------------------

-- Ensure type column length allows all uppercase type identifiers
ALTER TABLE public.notifications ALTER COLUMN type TYPE VARCHAR(50);

-- Drop previous check constraint if present and install complete type constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'NEW_FRIEND_REQUEST',
    'FRIEND_REQUEST_ACCEPTED',
    'NEW_MESSAGE',
    'GROUP_INVITATION',
    'ADDED_TO_GROUP',
    'REMOVED_FROM_GROUP',
    'MADE_ADMIN',
    'REMOVED_AS_ADMIN',
    'SCREENSHOT_ATTEMPT',
    'SECURITY_ALERT',
    -- Legacy backwards compatibility
    'friend_request',
    'friend_accepted',
    'group_invite',
    'group_mention',
    'system_alert',
    'moderation_notice'
));

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_type ON public.notifications(user_id, type);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 2. Enable Supabase Realtime for Notifications Table
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
EXCEPTION
    WHEN undefined_object THEN
        NULL;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Row-Level Security (RLS) Policies
-- ------------------------------------------------------------------------------

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Select: users can view only their own notifications
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications"
    ON public.notifications FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Update: users can update only their own notifications (e.g. is_read, read_at)
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
    ON public.notifications FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Delete: users can delete/clear their own notifications
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications"
    ON public.notifications FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Insert: users can insert their own security alerts or trigger via RPCs
DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications"
    ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. Atomic RPC Functions
-- ------------------------------------------------------------------------------

-- 4.1 Mark single notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
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

    UPDATE public.notifications
    SET is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
    WHERE id = p_notification_id
      AND user_id = v_caller_id;

    RETURN FOUND;
END;
$$;

-- 4.2 Mark all notifications as read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_count INTEGER;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    UPDATE public.notifications
    SET is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
    WHERE user_id = v_caller_id
      AND is_read = FALSE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- 4.3 Get unread count
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_count INTEGER;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.notifications
    WHERE user_id = v_caller_id
      AND is_read = FALSE;

    RETURN COALESCE(v_count, 0);
END;
$$;

-- 4.4 Dispatch Notification RPC (Security Definer with context authorization)
CREATE OR REPLACE FUNCTION public.dispatch_notification(
    p_user_id UUID,
    p_type VARCHAR,
    p_title VARCHAR,
    p_body TEXT,
    p_data JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_new_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Validate type
    IF p_type NOT IN (
        'NEW_FRIEND_REQUEST',
        'FRIEND_REQUEST_ACCEPTED',
        'NEW_MESSAGE',
        'GROUP_INVITATION',
        'ADDED_TO_GROUP',
        'REMOVED_FROM_GROUP',
        'MADE_ADMIN',
        'REMOVED_AS_ADMIN',
        'SCREENSHOT_ATTEMPT',
        'SECURITY_ALERT'
    ) THEN
        RAISE EXCEPTION 'Invalid notification type: %', p_type;
    END IF;

    -- Peer authorization checks:
    -- If notifying someone else for SCREENSHOT_ATTEMPT, caller must be a mutual member of the conversation
    IF p_type = 'SCREENSHOT_ATTEMPT' AND p_user_id != v_caller_id THEN
        IF p_data ? 'conversation_id' THEN
            IF NOT public.is_conv_member((p_data->>'conversation_id')::UUID) THEN
                RAISE EXCEPTION 'Not authorized to send screenshot attempt in this conversation.';
            END IF;
        END IF;
    END IF;

    -- If notifying someone else for SECURITY_ALERT, caller must be app admin
    IF p_type = 'SECURITY_ALERT' AND p_user_id != v_caller_id THEN
        IF NOT public.is_app_admin() THEN
            RAISE EXCEPTION 'Only app administrators can dispatch security alerts to other users.';
        END IF;
    END IF;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
    ) VALUES (
        p_user_id,
        p_type,
        p_title,
        p_body,
        p_data,
        FALSE,
        NOW()
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- 4.5 Record Screenshot Attempt in Conversation
CREATE OR REPLACE FUNCTION public.record_screenshot_attempt(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_name TEXT;
    v_caller_username TEXT;
    v_member RECORD;
    v_count INTEGER := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT public.is_conv_member(p_conversation_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not a member of this conversation.');
    END IF;

    SELECT COALESCE(display_name, username, 'Peer'), username 
    INTO v_caller_name, v_caller_username
    FROM public.profiles
    WHERE id = v_caller_id;

    -- Dispatch SCREENSHOT_ATTEMPT notification to peer conversation members
    FOR v_member IN 
        SELECT cm.user_id 
        FROM public.conversation_members cm
        WHERE cm.conversation_id = p_conversation_id
          AND cm.user_id != v_caller_id
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data,
            is_read,
            created_at
        ) VALUES (
            v_member.user_id,
            'SCREENSHOT_ATTEMPT',
            'Screenshot Attempt Detected',
            'Screenshot shortcut detected by @' || COALESCE(v_caller_username, 'peer') || ' (Best-effort detection).',
            jsonb_build_object(
                'conversation_id', p_conversation_id,
                'actor_id', v_caller_id,
                'actor_username', v_caller_username
            ),
            FALSE,
            NOW()
        );
        v_count := v_count + 1;
    END LOOP;

    -- Also record notification for caller
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
    ) VALUES (
        v_caller_id,
        'SCREENSHOT_ATTEMPT',
        'Screenshot Attempt Notice',
        'Screenshot shortcut detected in chat. Best-effort detection active.',
        jsonb_build_object('conversation_id', p_conversation_id),
        FALSE,
        NOW()
    );

    RETURN jsonb_build_object('success', TRUE, 'notified_count', v_count);
END;
$$;

-- 4.6 Send Group Invitation RPC
CREATE OR REPLACE FUNCTION public.send_group_invitation(p_group_id UUID, p_invitee_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_group_name TEXT;
    v_caller_name TEXT;
    v_notif_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Verify caller is a member of the group
    IF NOT EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_id = p_group_id AND user_id = v_caller_id
    ) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'You must be a member of this group to invite others.');
    END IF;

    -- Verify invitee is not already a member
    IF EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_id = p_group_id AND user_id = p_invitee_id
    ) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'User is already a member of this group.');
    END IF;

    SELECT name INTO v_group_name FROM public.groups WHERE id = p_group_id;
    SELECT COALESCE(display_name, username, 'A friend') INTO v_caller_name FROM public.profiles WHERE id = v_caller_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
    ) VALUES (
        p_invitee_id,
        'GROUP_INVITATION',
        'Group Invitation: ' || COALESCE(v_group_name, 'Group Chat'),
        v_caller_name || ' invited you to join "' || COALESCE(v_group_name, 'Group Chat') || '".',
        jsonb_build_object('group_id', p_group_id, 'invited_by', v_caller_id),
        FALSE,
        NOW()
    )
    RETURNING id INTO v_notif_id;

    RETURN jsonb_build_object('success', TRUE, 'notification_id', v_notif_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Automatic Lifecycle Database Triggers
-- ------------------------------------------------------------------------------

-- 5.1 Friend Request Created -> NEW_FRIEND_REQUEST
CREATE OR REPLACE FUNCTION public.handle_new_friend_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_name TEXT;
    v_sender_username TEXT;
BEGIN
    SELECT COALESCE(display_name, username, 'Someone'), username
    INTO v_sender_name, v_sender_username
    FROM public.profiles
    WHERE id = NEW.sender_id;

    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
    ) VALUES (
        NEW.receiver_id,
        'NEW_FRIEND_REQUEST',
        'New Friend Request',
        v_sender_name || ' (@' || COALESCE(v_sender_username, 'user') || ') sent you a friend request.',
        jsonb_build_object('sender_id', NEW.sender_id, 'request_id', NEW.id),
        FALSE,
        NOW()
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_friend_request_notification ON public.friend_requests;
CREATE TRIGGER trg_new_friend_request_notification
    AFTER INSERT ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_friend_request_notification();

-- 5.2 Friend Request Accepted -> FRIEND_REQUEST_ACCEPTED
CREATE OR REPLACE FUNCTION public.handle_friend_request_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_acceptor_name TEXT;
    v_acceptor_username TEXT;
BEGIN
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
        -- Insert reciprocal friendship rows
        INSERT INTO public.friendships (user_id, friend_id)
        VALUES (NEW.sender_id, NEW.receiver_id)
        ON CONFLICT (user_id, friend_id) DO NOTHING;

        INSERT INTO public.friendships (user_id, friend_id)
        VALUES (NEW.receiver_id, NEW.sender_id)
        ON CONFLICT (user_id, friend_id) DO NOTHING;

        SELECT COALESCE(display_name, username, 'Someone'), username
        INTO v_acceptor_name, v_acceptor_username
        FROM public.profiles
        WHERE id = NEW.receiver_id;

        -- Dispatch in-app notification to sender
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data,
            is_read,
            created_at
        ) VALUES (
            NEW.sender_id,
            'FRIEND_REQUEST_ACCEPTED',
            'Friend Request Accepted',
            v_acceptor_name || ' (@' || COALESCE(v_acceptor_username, 'user') || ') accepted your friend request.',
            jsonb_build_object('friend_id', NEW.receiver_id),
            FALSE,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friend_request_accepted ON public.friend_requests;
CREATE TRIGGER trg_friend_request_accepted
    AFTER UPDATE ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.handle_friend_request_acceptance();

-- 5.3 New Message Inserted -> NEW_MESSAGE (for unmuted peers)
CREATE OR REPLACE FUNCTION public.handle_new_message_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_name TEXT;
    v_sender_username TEXT;
    v_conv_type VARCHAR(20);
    v_group_name TEXT;
    v_member RECORD;
    v_title TEXT;
    v_preview TEXT;
BEGIN
    -- Ignore system messages or empty ciphertext
    IF NEW.sender_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get sender details
    SELECT COALESCE(display_name, username, 'User'), username
    INTO v_sender_name, v_sender_username
    FROM public.profiles
    WHERE id = NEW.sender_id;

    -- Get conversation type
    SELECT type INTO v_conv_type FROM public.conversations WHERE id = NEW.conversation_id;

    IF v_conv_type = 'group' THEN
        SELECT name INTO v_group_name FROM public.groups WHERE id = NEW.conversation_id;
        v_title := COALESCE(v_group_name, 'Group Chat');
        v_preview := v_sender_name || ': ' || substr(NEW.ciphertext, 1, 60);
    ELSE
        v_title := v_sender_name;
        v_preview := substr(NEW.ciphertext, 1, 60);
    END IF;

    IF length(NEW.ciphertext) > 60 THEN
        v_preview := v_preview || '...';
    END IF;

    -- For each unmuted member except the sender, dispatch NEW_MESSAGE notification
    FOR v_member IN
        SELECT user_id
        FROM public.conversation_members
        WHERE conversation_id = NEW.conversation_id
          AND user_id != NEW.sender_id
          AND is_muted = FALSE
    LOOP
        INSERT INTO public.notifications (
            user_id,
            type,
            title,
            body,
            data,
            is_read,
            created_at
        ) VALUES (
            v_member.user_id,
            'NEW_MESSAGE',
            v_title,
            v_preview,
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_id', NEW.sender_id
            ),
            FALSE,
            NOW()
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_message_notification();

-- 5.4 Group Membership Lifecycle Triggers:
--     - ADDED_TO_GROUP
--     - REMOVED_FROM_GROUP
--     - MADE_ADMIN
--     - REMOVED_AS_ADMIN

CREATE OR REPLACE FUNCTION public.handle_group_member_lifecycle_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_name TEXT;
    v_group_owner_id UUID;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();

    -- On INSERT: Member added to group
    IF TG_OP = 'INSERT' THEN
        SELECT name, owner_id INTO v_group_name, v_group_owner_id 
        FROM public.groups WHERE id = NEW.group_id;

        -- If added member is not the group creator initializing their own group
        IF NEW.user_id != v_group_owner_id AND (v_caller_id IS NULL OR NEW.user_id != v_caller_id) THEN
            INSERT INTO public.notifications (
                user_id,
                type,
                title,
                body,
                data,
                is_read,
                created_at
            ) VALUES (
                NEW.user_id,
                'ADDED_TO_GROUP',
                'Added to ' || COALESCE(v_group_name, 'Group Chat'),
                'You were added to "' || COALESCE(v_group_name, 'Group Chat') || '".',
                jsonb_build_object('group_id', NEW.group_id),
                FALSE,
                NOW()
            );
        END IF;
        RETURN NEW;

    -- On DELETE: Member removed from group
    ELSIF TG_OP = 'DELETE' THEN
        SELECT name INTO v_group_name FROM public.groups WHERE id = OLD.group_id;

        -- If removed by someone else (not voluntary leave)
        IF v_caller_id IS NOT NULL AND OLD.user_id != v_caller_id THEN
            INSERT INTO public.notifications (
                user_id,
                type,
                title,
                body,
                data,
                is_read,
                created_at
            ) VALUES (
                OLD.user_id,
                'REMOVED_FROM_GROUP',
                'Removed from ' || COALESCE(v_group_name, 'Group Chat'),
                'You were removed from "' || COALESCE(v_group_name, 'Group Chat') || '".',
                jsonb_build_object('group_id', OLD.group_id),
                FALSE,
                NOW()
            );
        END IF;
        RETURN OLD;

    -- On UPDATE: Role changed (MADE_ADMIN / REMOVED_AS_ADMIN)
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT name INTO v_group_name FROM public.groups WHERE id = NEW.group_id;

        -- Promoted to Admin or Owner
        IF OLD.role = 'member' AND NEW.role IN ('admin', 'owner') THEN
            INSERT INTO public.notifications (
                user_id,
                type,
                title,
                body,
                data,
                is_read,
                created_at
            ) VALUES (
                NEW.user_id,
                'MADE_ADMIN',
                'Promoted to Admin',
                'You are now an administrator of "' || COALESCE(v_group_name, 'Group Chat') || '".',
                jsonb_build_object('group_id', NEW.group_id, 'role', NEW.role),
                FALSE,
                NOW()
            );
        -- Demoted from Admin
        ELSIF OLD.role IN ('admin', 'owner') AND NEW.role = 'member' THEN
            INSERT INTO public.notifications (
                user_id,
                type,
                title,
                body,
                data,
                is_read,
                created_at
            ) VALUES (
                NEW.user_id,
                'REMOVED_AS_ADMIN',
                'Admin Role Revoked',
                'You are no longer an administrator of "' || COALESCE(v_group_name, 'Group Chat') || '".',
                jsonb_build_object('group_id', NEW.group_id),
                FALSE,
                NOW()
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_member_lifecycle_notifs ON public.group_members;
CREATE TRIGGER trg_group_member_lifecycle_notifs
    AFTER INSERT OR UPDATE OR DELETE ON public.group_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_group_member_lifecycle_notifications();
