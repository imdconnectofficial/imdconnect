-- ==============================================================================
-- ImdConnect — One-to-One Text Messaging Hardening Migration
-- Migration: 20261007260000_one_to_one_messaging.sql
--
-- Features:
-- 1. Sent, Delivered & Read Timestamps with Read Receipts (✓, ✓✓ gray, ✓✓ blue).
-- 2. Strictly text-only messaging (zero media/audio/attachments).
-- 3. Atomic delivery and read receipt RPCs for conversation recipients.
-- 4. Conversation mute preference toggling.
-- 5. Disappearing messages automated expiration & cleanup.
-- 6. Supabase Realtime publication configuration.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema Enhancements on public.messages
-- ------------------------------------------------------------------------------

-- Ensure direct read_at column exists on messages for ultra-fast receipt indexing
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_delivered_at 
    ON public.messages(delivered_at) 
    WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_read_at 
    ON public.messages(read_at) 
    WHERE read_at IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. RPC: Mark Conversation Messages as Delivered
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_conversation_delivered(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_count INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Caller must be an active member of the conversation
    IF NOT public.is_conv_member(p_conversation_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not a conversation member.');
    END IF;

    -- Update delivered_at for incoming messages sent by other members
    WITH updated AS (
        UPDATE public.messages
        SET delivered_at = NOW()
        WHERE conversation_id = p_conversation_id
          AND sender_id <> v_caller_id
          AND delivered_at IS NULL
          AND NOT is_deleted_for_all
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated;

    RETURN jsonb_build_object(
        'success', TRUE,
        'conversation_id', p_conversation_id,
        'marked_delivered_count', v_count,
        'delivered_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_delivered(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC: Mark Conversation Messages as Read (Read Receipts)
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
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Caller must be an active member of the conversation
    IF NOT public.is_conv_member(p_conversation_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not a conversation member.');
    END IF;

    -- Update messages directly: sets both read_at and delivered_at (if missing)
    WITH updated_msgs AS (
        UPDATE public.messages
        SET 
            read_at = NOW(),
            delivered_at = COALESCE(delivered_at, NOW())
        WHERE conversation_id = p_conversation_id
          AND sender_id <> v_caller_id
          AND read_at IS NULL
          AND NOT is_deleted_for_all
        RETURNING id
    )
    SELECT COUNT(*) INTO v_count FROM updated_msgs;

    -- Populate message_reads table for granular multi-member audit trail
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

    -- Update member's last_read_at timestamp in conversation_members
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
-- 4. RPC: Toggle Conversation Mute Preference
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.toggle_conversation_mute(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_new_status BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    UPDATE public.conversation_members
    SET is_muted = NOT is_muted
    WHERE conversation_id = p_conversation_id
      AND user_id = v_caller_id
    RETURNING is_muted INTO v_new_status;

    IF v_new_status IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Conversation membership not found.');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'conversation_id', p_conversation_id,
        'is_muted', v_new_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_conversation_mute(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC: Purge Expired Disappearing Messages
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    WITH purged AS (
        DELETE FROM public.messages
        WHERE expires_at IS NOT NULL
          AND expires_at <= NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_count FROM purged;

    RETURN jsonb_build_object(
        'success', TRUE,
        'purged_count', v_deleted_count,
        'purged_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_messages() TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. Supabase Realtime Publication Configuration
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN OTHERS THEN 
    NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
EXCEPTION WHEN OTHERS THEN 
    NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
EXCEPTION WHEN OTHERS THEN 
    NULL;
END $$;
