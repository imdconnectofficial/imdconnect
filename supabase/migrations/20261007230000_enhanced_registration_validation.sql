-- ==============================================================================
-- ImdConnect — Enhanced Registration Flow & Server-Side Validation Migration
-- Migration: 20261007230000_enhanced_registration_validation.sql
--
-- Description:
-- 1. Enforces strict birth_date and minimum age constraints on public.profiles.
-- 2. Hardens handle_new_user() trigger with strict server-side username & age validation.
-- 3. Ensures profile and settings rows are created safely and idempotently on registration.
-- 4. Exposes helper function to derive age on-the-fly without storing static age data.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Harden Profiles Age Constraint
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_min_age;

-- Enforce birth_date must be present and user must be at least 13 years old
ALTER TABLE public.profiles
    ADD CONSTRAINT chk_profiles_min_age 
    CHECK (birth_date IS NOT NULL AND birth_date <= (CURRENT_DATE - INTERVAL '13 years'));

-- Enforce username format constraint on profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_username_format;

ALTER TABLE public.profiles
    ADD CONSTRAINT chk_profiles_username_format
    CHECK (username ~ '^[a-z0-9_]{3,30}$');

-- ------------------------------------------------------------------------------
-- 2. Hardened User Bootstrap Trigger Function (handle_new_user)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    raw_username TEXT;
    sanitized_username VARCHAR(30);
    raw_dob TEXT;
    parsed_dob DATE;
    calculated_age INT;
    raw_display_name TEXT;
    sanitized_display_name VARCHAR(100);
BEGIN
    -- 1. Extract and sanitize username
    raw_username := NEW.raw_user_meta_data->>'username';
    IF raw_username IS NULL OR TRIM(raw_username) = '' THEN
        raw_username := split_part(NEW.email, '@', 1);
    END IF;

    sanitized_username := LOWER(TRIM(raw_username));
    -- Remove leading @ if user typed it
    sanitized_username := REGEXP_REPLACE(sanitized_username, '^@', '');

    -- Server-side username validation
    IF sanitized_username !~ '^[a-z0-9_]{3,30}$' THEN
        RAISE EXCEPTION 'Registration failed: Username must be 3-30 lowercase alphanumeric characters or underscores.';
    END IF;

    -- Verify username uniqueness
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = sanitized_username AND id <> NEW.id) THEN
        RAISE EXCEPTION 'Registration failed: The username "%" is already registered.', sanitized_username;
    END IF;

    -- 2. Extract and validate birth_date
    raw_dob := NEW.raw_user_meta_data->>'birth_date';
    IF raw_dob IS NULL OR TRIM(raw_dob) = '' THEN
        RAISE EXCEPTION 'Registration failed: Date of birth is required.';
    END IF;

    BEGIN
        parsed_dob := raw_dob::DATE;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Registration failed: Invalid date of birth format. Use YYYY-MM-DD.';
    END;

    -- Server-side Age Validation (Minimum 13 years old)
    calculated_age := DATE_PART('year', AGE(CURRENT_DATE, parsed_dob));
    IF calculated_age < 13 OR parsed_dob > (CURRENT_DATE - INTERVAL '13 years') THEN
        RAISE EXCEPTION 'Registration failed: You must be at least 13 years old to join ImdConnect.';
    END IF;

    -- Future date protection
    IF parsed_dob > CURRENT_DATE THEN
        RAISE EXCEPTION 'Registration failed: Date of birth cannot be in the future.';
    END IF;

    -- 3. Extract and sanitize display name
    raw_display_name := NEW.raw_user_meta_data->>'display_name';
    IF raw_display_name IS NULL OR TRIM(raw_display_name) = '' THEN
        sanitized_display_name := sanitized_username;
    ELSE
        sanitized_display_name := SUBSTRING(TRIM(raw_display_name) FROM 1 FOR 100);
    END IF;

    -- 4. Create Profile row safely
    INSERT INTO public.profiles (
        id,
        username,
        display_name,
        birth_date,
        public_key
    ) VALUES (
        NEW.id,
        sanitized_username,
        sanitized_display_name,
        parsed_dob,
        COALESCE(NEW.raw_user_meta_data->>'public_key', '')
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        birth_date = EXCLUDED.birth_date,
        updated_at = NOW();

    -- 5. Create Default User Settings safely
    INSERT INTO public.user_settings (user_id) 
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    -- 6. Create Default Privacy Settings safely
    INSERT INTO public.privacy_settings (user_id) 
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    -- 7. Create Default Notification Settings safely
    INSERT INTO public.notification_settings (user_id) 
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Ensure trigger is active on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 3. Helper Function to Derive Age on the Fly (Non-Authoritative)
-- ------------------------------------------------------------------------------
-- Calculates current age dynamically from birth_date without storing static age column

CREATE OR REPLACE FUNCTION public.get_user_age(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    user_dob DATE;
BEGIN
    SELECT birth_date INTO user_dob
    FROM public.profiles
    WHERE id = p_user_id;

    IF user_dob IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN DATE_PART('year', AGE(CURRENT_DATE, user_dob))::INT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_age(UUID) TO authenticated;
