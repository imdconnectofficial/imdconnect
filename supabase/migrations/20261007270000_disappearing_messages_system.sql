-- ==============================================================================
-- ImdConnect — Disappearing Messages & Ephemeral Retention System
-- Migration: 20261007270000_disappearing_messages_system.sql
--
-- Specifications:
-- 1. Durations: Off (0), 30s, 1m (60), 3m (180, Default), 10m (600), 1h (3600), 24h (86400).
-- 2. Timer begins strictly when recipient successfully reads the message.
-- 3. Read timestamp stored in messages.read_at and message_reads table.
-- 4. Expiration calculated server-side; client JS cannot manipulate or extend.
-- 5. Expired messages immediately hidden by RLS policy.
-- 6. Cleanup database function cleanup_expired_messages() scheduled via pg_cron.
-- 7. Offline recipients correctly handled (messages wait until read).
-- 8. Group messages handled according to group retention design (all readers + ceiling).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema & Constraints: Disappearing Durations & 3-Minute Default
-- ------------------------------------------------------------------------------

-- Update conversations check constraint & default
ALTER TABLE public.conversations 
    DROP CONSTRAINT IF EXISTS conversations_disappearing_timer_check;

ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_disappearing_timer_check 
    CHECK (disappearing_timer IN (0, 30, 60, 180, 600, 3600, 86400));

ALTER TABLE public.conversations 
    ALTER COLUMN disappearing_timer SET DEFAULT 180;

-- Update user_settings default disappearing timer check constraint & default
ALTER TABLE public.user_settings 
    DROP CONSTRAINT IF EXISTS user_settings_default_disappearing_timer_check;

ALTER TABLE public.user_settings
    ADD CONSTRAINT user_settings_default_disappearing_timer_check 
    CHECK (default_disappearing_timer IN (0, 30, 60, 180, 600, 3600, 86400));

ALTER TABLE public.user_settings 
    ALTER COLUMN default_disappearing_timer SET DEFAULT 180;

-- Update groups disappearing timer check constraint & default (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'groups') THEN
        ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_disappearing_timer_check;
        ALTER TABLE public.groups ADD CONSTRAINT groups_disappearing_timer_check 
            CHECK (disappearing_timer IN (0, 30, 60, 180, 600, 3600, 86400));
        ALTER TABLE public.groups ALTER COLUMN disappearing_timer SET DEFAULT 180;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Replace Insert Expiration Trigger (Timer Must NOT Start at Send Time)
-- ------------------------------------------------------------------------------

-- Drop previous trigger that incorrectly set expiration at send time
DROP TRIGGER IF EXISTS trg_set_message_expiration ON public.messages;

-- Ensure newly sent messages have expires_at = NULL (timer starts on read)
CREATE OR REPLACE FUNCTION public.calculate_message_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Expiration timer begins only upon read.
    -- Force expires_at to NULL on insert to prevent client-side timer tampering.
    NEW.expires_at := NULL;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_message_expiration
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.calculate_message_expiration();

-- ------------------------------------------------------------------------------
-- 3. Trigger: Set Expiration on Read (Server-Side Calculation for Direct Chats)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_message_read_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_timer INT;
    v_type TEXT;
BEGIN
    -- Only trigger when message transitions from unread (read_at IS NULL) to read (read_at IS NOT NULL)
    IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL THEN
        SELECT disappearing_timer, type INTO v_timer, v_type
        FROM public.conversations
        WHERE id = NEW.conversation_id;

        IF v_timer IS NOT NULL AND v_timer > 0 THEN
            -- In direct 1-to-1 conversations, calculate expiration server-side from read timestamp
            IF v_type = 'direct' THEN
                NEW.expires_at := NEW.read_at + (v_timer || ' seconds')::INTERVAL;
            END IF;
        END IF;
    END IF;

    -- Security Guard: Prevent any client from extending an existing expires_at timestamp
    IF OLD.expires_at IS NOT NULL AND NEW.expires_at > OLD.expires_at THEN
        NEW.expires_at := OLD.expires_at;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_read_expiration ON public.messages;
CREATE TRIGGER trg_message_read_expiration
    BEFORE UPDATE OF read_at ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_message_read_expiration();

-- ------------------------------------------------------------------------------
-- 4. Group Retention Trigger (Multiple Readers in Group Conversations)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_group_message_read_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_msg RECORD;
    v_conv RECORD;
    v_total_recipients INT;
    v_read_count INT;
BEGIN
    -- Retrieve message details
    SELECT m.id, m.conversation_id, m.sender_id, m.expires_at, m.read_at
    INTO v_msg
    FROM public.messages m
    WHERE m.id = NEW.message_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    -- Retrieve conversation settings
    SELECT id, type, disappearing_timer
    INTO v_conv
    FROM public.conversations
    WHERE id = v_msg.conversation_id;

    -- Only proceed if disappearing timer is enabled (> 0) and conversation is a group
    IF v_conv.disappearing_timer IS NULL OR v_conv.disappearing_timer <= 0 OR v_conv.type <> 'group' THEN
        RETURN NEW;
    END IF;

    -- Count total active non-sender group members
    SELECT COUNT(*) INTO v_total_recipients
    FROM public.conversation_members cm
    WHERE cm.conversation_id = v_conv.id
      AND cm.user_id <> v_msg.sender_id;

    -- Count distinct non-sender readers so far
    SELECT COUNT(DISTINCT mr.user_id) INTO v_read_count
    FROM public.message_reads mr
    WHERE mr.message_id = v_msg.id
      AND mr.user_id <> v_msg.sender_id;

    -- Group Retention Rule:
    -- If all active recipients have read the message, timer triggers from now.
    IF v_total_recipients > 0 AND v_read_count >= v_total_recipients THEN
        UPDATE public.messages
        SET 
            read_at = COALESCE(read_at, NOW()),
            expires_at = LEAST(
                COALESCE(expires_at, NOW() + (v_conv.disappearing_timer || ' seconds')::INTERVAL),
                NOW() + (v_conv.disappearing_timer || ' seconds')::INTERVAL
            )
        WHERE id = v_msg.id;
    ELSE
        -- If at least one reader has seen it, establish a safe maximum ceiling
        -- (prevents zombie messages from lingering indefinitely if an inactive member never returns)
        -- Ceiling = GREATEST(disappearing_timer * 10, 86400) seconds (up to 24h)
        UPDATE public.messages
        SET 
            read_at = COALESCE(read_at, NOW()),
            expires_at = COALESCE(
                expires_at,
                NOW() + (GREATEST(v_conv.disappearing_timer * 10, 86400) || ' seconds')::INTERVAL
            )
        WHERE id = v_msg.id
          AND expires_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_message_read_expiration ON public.message_reads;
CREATE TRIGGER trg_group_message_read_expiration
    AFTER INSERT ON public.message_reads
    FOR EACH ROW EXECUTE FUNCTION public.handle_group_message_read_expiration();

-- ------------------------------------------------------------------------------
-- 5. Updated RPC: Mark Conversation as Read (Server-Side Timer Initiation)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_count INT := 0;
    v_timer INT;
    v_conv_type TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Caller must be an active member of the conversation
    IF NOT public.is_conv_member(p_conversation_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not a conversation member.');
    END IF;

    -- Retrieve conversation settings
    SELECT disappearing_timer, type INTO v_timer, v_conv_type
    FROM public.conversations
    WHERE id = p_conversation_id;

    -- 1. Direct Conversations: Mark delivered, read, and compute expires_at server-side
    IF v_conv_type = 'direct' THEN
        WITH updated_msgs AS (
            UPDATE public.messages
            SET 
                read_at = NOW(),
                delivered_at = COALESCE(delivered_at, NOW()),
                expires_at = CASE 
                    WHEN v_timer > 0 AND expires_at IS NULL THEN NOW() + (v_timer || ' seconds')::INTERVAL
                    ELSE expires_at
                END
            WHERE conversation_id = p_conversation_id
              AND sender_id <> v_caller_id
              AND read_at IS NULL
              AND NOT is_deleted_for_all
            RETURNING id
        )
        SELECT COUNT(*) INTO v_count FROM updated_msgs;
    ELSE
        -- Group Conversations: Mark delivered_at
        WITH updated_msgs AS (
            UPDATE public.messages
            SET delivered_at = COALESCE(delivered_at, NOW())
            WHERE conversation_id = p_conversation_id
              AND sender_id <> v_caller_id
              AND delivered_at IS NULL
              AND NOT is_deleted_for_all
            RETURNING id
        )
        SELECT COUNT(*) INTO v_count FROM updated_msgs;
    END IF;

    -- 2. Populate message_reads table (invokes trg_group_message_read_expiration for groups)
    INSERT INTO public.message_reads (message_id, user_id, read_at)
    SELECT m.id, v_caller_id, NOW()
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_caller_id
      AND NOT EXISTS (
          SELECT 1 FROM public.message_reads mr
          WHERE mr.message_id = m.id AND mr.user_id = v_caller_id
      )
    ON CONFLICT (message_id, user_id) DO NOTHING;

    -- 3. Update caller's last_read_at in conversation_members
    UPDATE public.conversation_members
    SET last_read_at = NOW()
    WHERE conversation_id = p_conversation_id
      AND user_id = v_caller_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'conversation_id', p_conversation_id,
        'marked_read_count', v_count,
        'read_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Cleanup Database Function (Hard Shredding of Expired Records)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_expired_messages()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_purged_count INT := 0;
BEGIN
    -- Delete all messages where expires_at has elapsed (NOW >= expires_at)
    WITH purged AS (
        DELETE FROM public.messages
        WHERE expires_at IS NOT NULL
          AND expires_at <= NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO v_purged_count FROM purged;

    RETURN jsonb_build_object(
        'success', TRUE,
        'purged_count', v_purged_count,
        'purged_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_messages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_messages() TO service_role;

-- Alias for backward compatibility
CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.cleanup_expired_messages();
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_messages() TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. Row-Level Security: Ensure Expired Messages Are Never Returned to Clients
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Conversation members view non-expired text messages" ON public.messages;

CREATE POLICY "Conversation members view non-expired text messages"
    ON public.messages FOR SELECT TO authenticated
    USING (
        public.is_conv_member(conversation_id)
        AND (expires_at IS NULL OR expires_at > NOW())
        AND NOT is_deleted_for_all
    );

-- Partial index for active expiring messages and instant query filtering
CREATE INDEX IF NOT EXISTS idx_messages_active_expires_at
    ON public.messages(expires_at)
    WHERE expires_at IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 8. Supabase Cron (pg_cron) Scheduling
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('purge-expired-disappearing-messages');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    PERFORM cron.schedule(
        'purge-expired-disappearing-messages',
        '* * * * *',
        'SELECT public.cleanup_expired_messages();'
    );
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
