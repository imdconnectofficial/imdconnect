-- ==============================================================================
-- ImdConnect — Complete Settings System Migration
-- Migration: 20261007310000_complete_settings_system.sql
--
-- Features:
-- 1. Privacy Settings extensions:
--    - profile_visibility ('everyone', 'friends_only', 'nobody')
--    - avatar_visibility ('everyone', 'friends_only', 'nobody')
--    - last_seen ('everyone', 'friends_only', 'nobody')
--    - online_status ('everyone', 'friends_only', 'nobody')
--    - read_receipts_enabled (BOOLEAN)
--    - friend_request_permissions ('everyone', 'friends_of_friends', 'nobody')
--    - who_can_find_me ('everyone', 'friends_only', 'nobody')
--    - privacy_chat_mode_default (BOOLEAN)
--    - default_disappearing_timer (INTEGER)
-- 2. Notification Settings extensions:
--    - direct_messages_notify (BOOLEAN)
--    - friend_requests_notify (BOOLEAN)
--    - group_messages_notify (BOOLEAN)
--    - security_alerts_notify (BOOLEAN)
--    - in_app_sounds (BOOLEAN)
--    - preview_message_text (BOOLEAN)
-- 3. Sessions & Login History RPCs:
--    - get_user_sessions()
--    - revoke_user_session(p_session_id)
--    - get_login_history()
--    - record_login_audit(p_success, p_failure_reason)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Privacy Settings Extensions
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    -- avatar_visibility
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'privacy_settings' AND column_name = 'avatar_visibility'
    ) THEN
        ALTER TABLE public.privacy_settings 
            ADD COLUMN avatar_visibility VARCHAR(15) NOT NULL DEFAULT 'everyone' 
            CHECK (avatar_visibility IN ('everyone', 'friends_only', 'nobody'));
    END IF;

    -- last_seen
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'privacy_settings' AND column_name = 'last_seen'
    ) THEN
        ALTER TABLE public.privacy_settings 
            ADD COLUMN last_seen VARCHAR(15) NOT NULL DEFAULT 'everyone' 
            CHECK (last_seen IN ('everyone', 'friends_only', 'nobody'));
    END IF;

    -- online_status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'privacy_settings' AND column_name = 'online_status'
    ) THEN
        ALTER TABLE public.privacy_settings 
            ADD COLUMN online_status VARCHAR(15) NOT NULL DEFAULT 'everyone' 
            CHECK (online_status IN ('everyone', 'friends_only', 'nobody'));
    END IF;

    -- friend_request_permissions
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'privacy_settings' AND column_name = 'friend_request_permissions'
    ) THEN
        ALTER TABLE public.privacy_settings 
            ADD COLUMN friend_request_permissions VARCHAR(20) NOT NULL DEFAULT 'everyone' 
            CHECK (friend_request_permissions IN ('everyone', 'friends_of_friends', 'nobody'));
    END IF;

    -- who_can_find_me
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'privacy_settings' AND column_name = 'who_can_find_me'
    ) THEN
        ALTER TABLE public.privacy_settings 
            ADD COLUMN who_can_find_me VARCHAR(15) NOT NULL DEFAULT 'everyone' 
            CHECK (who_can_find_me IN ('everyone', 'friends_only', 'nobody'));
    END IF;

    -- privacy_chat_mode_default
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'privacy_settings' AND column_name = 'privacy_chat_mode_default'
    ) THEN
        ALTER TABLE public.privacy_settings 
            ADD COLUMN privacy_chat_mode_default BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Notification Settings Extensions
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    -- security_alerts_notify
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'notification_settings' AND column_name = 'security_alerts_notify'
    ) THEN
        ALTER TABLE public.notification_settings 
            ADD COLUMN security_alerts_notify BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Sessions & Login History RPC Functions
-- ------------------------------------------------------------------------------

-- 3.1 Get active sessions for caller
CREATE OR REPLACE FUNCTION public.get_user_sessions()
RETURNS TABLE (
    id UUID,
    client_device_info TEXT,
    ip_address_hash TEXT,
    is_revoked BOOLEAN,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
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

    RETURN QUERY
    SELECT 
        s.id,
        s.client_device_info,
        s.ip_address_hash,
        s.is_revoked,
        s.last_active_at,
        s.created_at
    FROM public.user_sessions s
    WHERE s.user_id = v_caller_id
      AND s.is_revoked = FALSE
    ORDER BY s.last_active_at DESC;
END;
$$;

-- 3.2 Revoke specific session
CREATE OR REPLACE FUNCTION public.revoke_user_session(p_session_id UUID)
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

    UPDATE public.user_sessions
    SET is_revoked = TRUE
    WHERE id = p_session_id
      AND user_id = v_caller_id;

    RETURN FOUND;
END;
$$;

-- 3.3 Get login history audit log
CREATE OR REPLACE FUNCTION public.get_login_history(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
    id UUID,
    success BOOLEAN,
    ip_address_hash TEXT,
    user_agent TEXT,
    failure_reason TEXT,
    created_at TIMESTAMPTZ
)
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

    RETURN QUERY
    SELECT 
        lh.id,
        lh.success,
        lh.ip_address_hash,
        lh.user_agent,
        lh.failure_reason,
        lh.created_at
    FROM public.login_history lh
    WHERE lh.user_id = v_caller_id
    ORDER BY lh.created_at DESC
    LIMIT LEAST(p_limit, 50);
END;
$$;

-- 3.4 Record login history entry (Security Definer)
CREATE OR REPLACE FUNCTION public.record_login_audit(
    p_success BOOLEAN,
    p_failure_reason TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
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
        RETURN NULL;
    END IF;

    INSERT INTO public.login_history (
        user_id,
        success,
        ip_address_hash,
        user_agent,
        failure_reason,
        created_at
    ) VALUES (
        v_caller_id,
        p_success,
        'client-verified',
        COALESCE(p_user_agent, 'Browser Web Client'),
        p_failure_reason,
        NOW()
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Ensure RLS on public.privacy_settings & public.notification_settings
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own privacy settings" ON public.privacy_settings;
CREATE POLICY "Users view own privacy settings"
    ON public.privacy_settings FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own privacy settings" ON public.privacy_settings;
CREATE POLICY "Users update own privacy settings"
    ON public.privacy_settings FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own privacy settings" ON public.privacy_settings;
CREATE POLICY "Users insert own privacy settings"
    ON public.privacy_settings FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own notification settings" ON public.notification_settings;
CREATE POLICY "Users view own notification settings"
    ON public.notification_settings FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notification settings" ON public.notification_settings;
CREATE POLICY "Users update own notification settings"
    ON public.notification_settings FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own notification settings" ON public.notification_settings;
CREATE POLICY "Users insert own notification settings"
    ON public.notification_settings FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
