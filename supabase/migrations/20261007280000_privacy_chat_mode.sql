-- ==============================================================================
-- ImdConnect — Privacy Chat Mode Migration
-- Migration: 20261007280000_privacy_chat_mode.sql
--
-- Features:
-- 1. Conversation and member level Privacy Chat Mode flags.
-- 2. Atomic RPC toggle_conversation_privacy_mode() with membership authorization.
-- 3. Ephemeral privacy events & alerts support in publication.
-- 4. Strictly preserves all existing security rules & text-only platform constraints.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema Extensions
-- ------------------------------------------------------------------------------

ALTER TABLE public.conversations 
    ADD COLUMN IF NOT EXISTS is_privacy_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.conversation_members 
    ADD COLUMN IF NOT EXISTS is_privacy_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- ------------------------------------------------------------------------------
-- 2. RPC: Toggle Conversation Privacy Mode
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.toggle_conversation_privacy_mode(p_conversation_id UUID)
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

    -- Verify caller is an active member of this conversation
    IF NOT public.is_conv_member(p_conversation_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not a conversation member.');
    END IF;

    -- Toggle privacy mode for the conversation
    UPDATE public.conversations
    SET 
        is_privacy_mode = NOT is_privacy_mode,
        updated_at = NOW()
    WHERE id = p_conversation_id
    RETURNING is_privacy_mode INTO v_new_status;

    -- Sync caller member preference
    UPDATE public.conversation_members
    SET is_privacy_mode = v_new_status
    WHERE conversation_id = p_conversation_id
      AND user_id = v_caller_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'conversation_id', p_conversation_id,
        'is_privacy_mode', v_new_status,
        'toggled_by', v_caller_id,
        'toggled_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_conversation_privacy_mode(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. Ensure publication includes conversations for Realtime broadcasts
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN OTHERS THEN 
    NULL;
END $$;
