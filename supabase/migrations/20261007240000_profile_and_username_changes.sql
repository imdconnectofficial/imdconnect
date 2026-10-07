-- ==============================================================================
-- ImdConnect — Profile Management, 7-Day Username Cooldown & Privacy Controls
-- Migration: 20261007240000_profile_and_username_changes.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Ensure profile_visibility column on public.privacy_settings
-- ------------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'privacy_settings' 
          AND column_name = 'profile_visibility'
    ) THEN
        ALTER TABLE public.privacy_settings 
            ADD COLUMN profile_visibility VARCHAR(15) NOT NULL DEFAULT 'everyone' 
            CHECK (profile_visibility IN ('everyone', 'friends_only', 'nobody'));
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Enforce 7-Day Username Change Cooldown & Audit Trigger
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_username_change_cooldown()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    sanitized_new_username VARCHAR(30);
    cooldown_cutoff TIMESTAMPTZ;
BEGIN
    -- Only trigger if username has changed
    IF OLD.username IS DISTINCT FROM NEW.username THEN
        sanitized_new_username := LOWER(TRIM(NEW.username));
        sanitized_new_username := REGEXP_REPLACE(sanitized_new_username, '^@', '');

        -- Validate format
        IF sanitized_new_username !~ '^[a-z0-9_]{3,30}$' THEN
            RAISE EXCEPTION 'Username must be 3-30 lowercase characters (letters, numbers, and underscores only).';
        END IF;

        -- Validate uniqueness
        IF EXISTS (SELECT 1 FROM public.profiles WHERE username = sanitized_new_username AND id <> NEW.id) THEN
            RAISE EXCEPTION 'The username "%" is already taken. Please choose another.', sanitized_new_username;
        END IF;

        -- Enforce 7-Day Cooldown (Reject early changes server-side)
        IF OLD.last_username_change_at IS NOT NULL THEN
            cooldown_cutoff := OLD.last_username_change_at + INTERVAL '7 days';
            IF NOW() < cooldown_cutoff THEN
                RAISE EXCEPTION 'Username can only be changed once every 7 days. Next available change date: %', 
                    TO_CHAR(cooldown_cutoff AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
            END IF;
        END IF;

        -- Record in audit history table
        INSERT INTO public.username_history (
            user_id,
            old_username,
            new_username,
            changed_at
        ) VALUES (
            OLD.id,
            OLD.username,
            sanitized_new_username,
            NOW()
        );

        -- Apply sanitized username and record change timestamp
        NEW.username := sanitized_new_username;
        NEW.last_username_change_at := NOW();
        NEW.updated_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

-- Ensure trigger is bound on public.profiles
DROP TRIGGER IF EXISTS trg_enforce_username_cooldown ON public.profiles;

CREATE TRIGGER trg_enforce_username_cooldown
    BEFORE UPDATE OF username ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_username_change_cooldown();

-- ------------------------------------------------------------------------------
-- 3. RPC: Check Username Change Eligibility & Next Available Date
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_username_change_eligibility()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    user_record RECORD;
    v_last_changed TIMESTAMPTZ;
    v_next_available TIMESTAMPTZ;
    v_can_change BOOLEAN;
    v_seconds_remaining INT;
    v_days_remaining INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT username, last_username_change_at INTO user_record
    FROM public.profiles
    WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found.';
    END IF;

    v_last_changed := user_record.last_username_change_at;

    IF v_last_changed IS NULL THEN
        v_can_change := TRUE;
        v_next_available := NOW();
        v_seconds_remaining := 0;
        v_days_remaining := 0;
    ELSE
        v_next_available := v_last_changed + INTERVAL '7 days';
        IF NOW() >= v_next_available THEN
            v_can_change := TRUE;
            v_seconds_remaining := 0;
            v_days_remaining := 0;
        ELSE
            v_can_change := FALSE;
            v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_next_available - NOW()))::INT);
            v_days_remaining := CEIL(v_seconds_remaining / 86400.0)::INT;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'can_change', v_can_change,
        'current_username', user_record.username,
        'last_username_change_at', v_last_changed,
        'next_available_at', v_next_available,
        'seconds_remaining', v_seconds_remaining,
        'days_remaining', v_days_remaining
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_username_change_eligibility() TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC: Secure Username Update Procedure (Atomic & Validated)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_username(p_new_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_current_username VARCHAR(30);
    v_last_changed TIMESTAMPTZ;
    v_next_available TIMESTAMPTZ;
    v_cleaned_username VARCHAR(30);
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Clean input
    v_cleaned_username := LOWER(TRIM(p_new_username));
    v_cleaned_username := REGEXP_REPLACE(v_cleaned_username, '^@', '');

    -- Validate format
    IF v_cleaned_username !~ '^[a-z0-9_]{3,30}$' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Username must be 3-30 lowercase characters (letters, numbers, and underscores only).'
        );
    END IF;

    -- Check current profile
    SELECT username, last_username_change_at 
    INTO v_current_username, v_last_changed
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_current_username = v_cleaned_username THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'New username is identical to current username.'
        );
    END IF;

    -- Server-side Cooldown Check (7 Days)
    IF v_last_changed IS NOT NULL THEN
        v_next_available := v_last_changed + INTERVAL '7 days';
        IF NOW() < v_next_available THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', format('Username can only be changed once every 7 days. Next change available after %s.', TO_CHAR(v_next_available AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS UTC')),
                'next_available_at', v_next_available,
                'days_remaining', CEIL(EXTRACT(EPOCH FROM (v_next_available - NOW())) / 86400.0)::INT
            );
        END IF;
    END IF;

    -- Server-side Uniqueness Check
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_cleaned_username AND id <> v_user_id) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('The username "%s" is already taken. Please choose another.', v_cleaned_username)
        );
    END IF;

    -- Execute profile update (triggers trg_enforce_username_cooldown to record audit)
    UPDATE public.profiles
    SET username = v_cleaned_username
    WHERE id = v_user_id;

    -- Synchronize Supabase Auth user_metadata
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::JSONB) || jsonb_build_object('username', v_cleaned_username)
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_username', v_cleaned_username,
        'last_username_change_at', NOW(),
        'next_available_at', NOW() + INTERVAL '7 days'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_username(TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC: Get User Profile with Privacy Visibility Checks (Zero DOB Exposure)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_profile_safe(
    p_user_id UUID DEFAULT NULL,
    p_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_target RECORD;
    v_privacy RECORD;
    v_friends_count INT;
    v_groups_count INT;
    v_is_self BOOLEAN;
    v_is_friend BOOLEAN := FALSE;
    v_is_admin BOOLEAN := FALSE;
    v_visibility VARCHAR(15);
    v_friend_req_status VARCHAR(15) := NULL;
BEGIN
    v_caller_id := auth.uid();

    -- Locate target profile
    IF p_user_id IS NOT NULL THEN
        SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id;
    ELSIF p_username IS NOT NULL THEN
        SELECT * INTO v_target FROM public.profiles WHERE username = LOWER(TRIM(p_username));
    ELSE
        SELECT * INTO v_target FROM public.profiles WHERE id = v_caller_id;
    END IF;

    IF v_target IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'User profile not found.');
    END IF;

    v_is_self := (v_caller_id IS NOT NULL AND v_caller_id = v_target.id);
    v_is_admin := public.is_app_admin();

    -- Query friends count
    SELECT COUNT(*) INTO v_friends_count
    FROM public.friendships
    WHERE user_id = v_target.id;

    -- Query groups count
    SELECT COUNT(*) INTO v_groups_count
    FROM public.group_members
    WHERE user_id = v_target.id;

    -- Self lookup: return all stats and private metadata (never expose passwords)
    IF v_is_self THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'is_self', TRUE,
            'is_restricted', FALSE,
            'id', v_target.id,
            'username', v_target.username,
            'display_name', v_target.display_name,
            'bio', v_target.bio,
            'avatar_url', v_target.avatar_url,
            'banner_url', v_target.banner_url,
            'friends_count', v_friends_count,
            'groups_count', v_groups_count,
            'created_at', v_target.created_at,
            'last_username_change_at', v_target.last_username_change_at,
            -- DOB is ONLY exposed to self
            'birth_date', v_target.birth_date
        );
    END IF;

    -- Peer lookup: fetch privacy settings
    SELECT profile_visibility, online_status_visible, last_seen_visible
    INTO v_privacy
    FROM public.privacy_settings
    WHERE user_id = v_target.id;

    v_visibility := COALESCE(v_privacy.profile_visibility, 'everyone');

    -- Check friendship status
    IF v_caller_id IS NOT NULL THEN
        v_is_friend := public.are_friends(v_caller_id, v_target.id);
        
        -- Check pending friend request status
        SELECT status INTO v_friend_req_status
        FROM public.friend_requests
        WHERE (sender_id = v_caller_id AND receiver_id = v_target.id)
           OR (sender_id = v_target.id AND receiver_id = v_caller_id)
        LIMIT 1;
    END IF;

    -- Enforce Privacy Visibility Boundary
    -- Case 1: Private profile (nobody)
    IF v_visibility = 'nobody' AND NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'is_self', FALSE,
            'is_restricted', TRUE,
            'restricted_reason', 'This user has set their profile to private.',
            'id', v_target.id,
            'username', v_target.username,
            'display_name', v_target.display_name,
            'avatar_url', v_target.avatar_url,
            'banner_url', NULL,
            'bio', NULL,
            'friends_count', 0,
            'groups_count', 0,
            'created_at', v_target.created_at,
            'birth_date', NULL, -- Never expose DOB
            'is_friend', v_is_friend,
            'friend_request_status', v_friend_req_status
        );
    END IF;

    -- Case 2: Friends only profile
    IF v_visibility = 'friends_only' AND NOT v_is_friend AND NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'is_self', FALSE,
            'is_restricted', TRUE,
            'restricted_reason', 'This profile is visible to friends only.',
            'id', v_target.id,
            'username', v_target.username,
            'display_name', v_target.display_name,
            'avatar_url', v_target.avatar_url,
            'banner_url', NULL,
            'bio', NULL,
            'friends_count', 0,
            'groups_count', 0,
            'created_at', v_target.created_at,
            'birth_date', NULL, -- Never expose DOB
            'is_friend', FALSE,
            'friend_request_status', v_friend_req_status
        );
    END IF;

    -- Case 3: Public profile or caller is friend / admin
    RETURN jsonb_build_object(
        'success', TRUE,
        'is_self', FALSE,
        'is_restricted', FALSE,
        'id', v_target.id,
        'username', v_target.username,
        'display_name', v_target.display_name,
        'bio', v_target.bio,
        'avatar_url', v_target.avatar_url,
        'banner_url', v_target.banner_url,
        'friends_count', v_friends_count,
        'groups_count', v_groups_count,
        'created_at', v_target.created_at,
        'birth_date', NULL, -- Never expose DOB publicly
        'is_friend', v_is_friend,
        'friend_request_status', v_friend_req_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_profile_safe(UUID, TEXT) TO anon, authenticated;
