-- ==============================================================================
-- ImdConnect — Supabase Authentication & Account Management Migration
-- Migration: 20261007210000_supabase_authentication_system.sql
--
-- Description:
-- Extends profiles with birth_date and deactivation flags.
-- Implements secure, zero-knowledge username authentication lookup via pgcrypto,
-- username availability verification, secure account deactivation, reactivation,
-- and cascade account deletion.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend profiles with birth_date & deactivation state
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS birth_date DATE,
    ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

-- Minimum age check constraint (13+ years of age for compliance)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_profiles_min_age'
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT chk_profiles_min_age 
            CHECK (birth_date IS NULL OR birth_date <= (CURRENT_DATE - INTERVAL '13 years'));
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Update Public Profiles View to Ensure birth_date & email privacy
-- ------------------------------------------------------------------------------

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
    -- birth_date is strictly visible ONLY to account owner or staff
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
-- 3. Update User Bootstrap Trigger to handle birth_date & display_name
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    extracted_username VARCHAR(30);
    raw_username TEXT;
    raw_dob TEXT;
    parsed_dob DATE;
BEGIN
    -- Extract username from raw_user_meta_data or email prefix
    raw_username := NEW.raw_user_meta_data->>'username';
    IF raw_username IS NULL OR raw_username = '' THEN
        raw_username := split_part(NEW.email, '@', 1);
    END IF;

    extracted_username := LOWER(TRIM(raw_username));

    -- Extract birth date if provided
    raw_dob := NEW.raw_user_meta_data->>'birth_date';
    IF raw_dob IS NOT NULL AND raw_dob <> '' THEN
        BEGIN
            parsed_dob := raw_dob::DATE;
        EXCEPTION WHEN OTHERS THEN
            parsed_dob := NULL;
        END;
    END IF;

    -- Create Profile
    INSERT INTO public.profiles (
        id,
        username,
        display_name,
        birth_date,
        public_key
    ) VALUES (
        NEW.id,
        extracted_username,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), extracted_username),
        parsed_dob,
        COALESCE(NEW.raw_user_meta_data->>'public_key', '')
    );

    -- Create Default User Settings
    INSERT INTO public.user_settings (user_id) 
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Create Default Privacy Settings
    INSERT INTO public.privacy_settings (user_id) 
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Create Default Notification Settings
    INSERT INTO public.notification_settings (user_id) 
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Check Username Availability (Public / Pre-Registration Lookup)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_username_availability(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    cleaned_username TEXT;
BEGIN
    cleaned_username := LOWER(TRIM(p_username));
    
    -- Check format
    IF cleaned_username !~ '^[a-z0-9_]{3,30}$' THEN
        RETURN FALSE;
    END IF;

    -- Return true if available (no existing profile with this handle)
    RETURN NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE username = cleaned_username
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_username_availability(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. Secure Username Authentication Lookup (Zero Plaintext Password Storage)
-- ------------------------------------------------------------------------------
-- Securely verifies credentials against auth.users.encrypted_password via pgcrypto.
-- ONLY returns the registered email if the password crypt match succeeds!
-- If invalid, executes a dummy crypt calculation to mitigate timing analysis.

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
    dummy_hash TEXT := '$2a$10$7EqJtq98hPqEX7fNZaFWoO.8/q.v6d.Y8c1.P.y4m3g0H/u0w.iG.'; -- standard dummy bcrypt
    password_valid BOOLEAN := FALSE;
BEGIN
    -- 1. Lookup user by sanitized username
    SELECT 
        p.id,
        p.is_deactivated,
        p.is_suspended,
        p.is_banned,
        u.email,
        u.encrypted_password
    INTO 
        target_user_id,
        target_deactivated,
        target_suspended,
        target_banned,
        target_email,
        target_hash
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.username = LOWER(TRIM(p_username));

    -- 2. Verify password with timing attack mitigation
    IF target_user_id IS NOT NULL AND target_hash IS NOT NULL THEN
        password_valid := (target_hash = crypt(p_password, target_hash));
    ELSE
        -- Run dummy crypt to prevent timing differentiation between existing and non-existing accounts
        PERFORM crypt(p_password, dummy_hash);
        password_valid := FALSE;
    END IF;

    -- 3. Return result strictly upon valid match
    IF password_valid = TRUE AND target_banned = FALSE THEN
        RETURN QUERY SELECT target_email, target_deactivated, target_suspended;
    ELSE
        -- Generic failure: return nothing
        RETURN;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.authenticate_with_username(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. Account Lifecycle RPCs: Deactivate, Reactivate & Delete
-- ------------------------------------------------------------------------------

-- 6.1 Account Deactivation (Soft state)
CREATE OR REPLACE FUNCTION public.deactivate_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated.';
    END IF;

    UPDATE public.profiles
    SET is_deactivated = TRUE,
        deactivated_at = NOW()
    WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.deactivate_account() TO authenticated;

-- 6.2 Account Reactivation
CREATE OR REPLACE FUNCTION public.reactivate_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated.';
    END IF;

    UPDATE public.profiles
    SET is_deactivated = FALSE,
        deactivated_at = NULL
    WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.reactivate_account() TO authenticated;

-- 6.3 Complete Account Deletion (GDPR / Privacy Purge)
CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User not authenticated.';
    END IF;

    -- Deleting from auth.users cascades to profiles, conversations, messages, sessions, etc.
    DELETE FROM auth.users
    WHERE id = current_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;
