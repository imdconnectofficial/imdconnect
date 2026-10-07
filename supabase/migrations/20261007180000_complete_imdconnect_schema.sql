-- ==============================================================================
-- ImdConnect — Comprehensive PostgreSQL Database Schema for Supabase
-- Migration: 20261007180000_complete_imdconnect_schema.sql
-- 
-- Description:
-- Complete production schema for ImdConnect text-only messaging platform.
-- Enforces zero-knowledge privacy, username-based discovery, strict text-only
-- messaging, granular privacy/notification/user settings, groups, friendships,
-- moderation, and 100% PostgreSQL Row Level Security (RLS).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Required Extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ------------------------------------------------------------------------------
-- 1. Helper Functions & Triggers
-- ------------------------------------------------------------------------------

-- Generic updated_at timestamp refresher
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. User Identity & Profiles
-- ------------------------------------------------------------------------------

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(30) NOT NULL,
    display_name VARCHAR(50),
    bio VARCHAR(200),
    avatar_url TEXT,
    banner_url TEXT,
    public_key TEXT NOT NULL,
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    suspension_reason TEXT,
    suspended_until TIMESTAMPTZ,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    banned_at TIMESTAMPTZ,
    last_username_change_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$'),
    CONSTRAINT uq_profiles_username UNIQUE (username)
);

CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_last_seen ON public.profiles(last_seen_at DESC);
CREATE INDEX idx_profiles_suspension ON public.profiles(is_suspended, is_banned);

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. Username Change History & Cooldown Tracking
-- ------------------------------------------------------------------------------

CREATE TABLE public.username_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    old_username VARCHAR(30) NOT NULL,
    new_username VARCHAR(30) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_username_diff CHECK (old_username <> new_username)
);

CREATE INDEX idx_username_history_user ON public.username_history(user_id, changed_at DESC);
CREATE INDEX idx_username_history_old ON public.username_history(old_username);

-- Function & Trigger: Enforce 30-Day Username Change Cooldown
CREATE OR REPLACE FUNCTION public.enforce_username_change_cooldown()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF OLD.username IS DISTINCT FROM NEW.username THEN
        IF OLD.last_username_change_at IS NOT NULL AND 
           OLD.last_username_change_at > (NOW() - INTERVAL '30 days') THEN
            RAISE EXCEPTION 'Username can only be changed once every 30 days. Next change allowed after %', 
                (OLD.last_username_change_at + INTERVAL '30 days');
        END IF;

        -- Record in audit history
        INSERT INTO public.username_history (user_id, old_username, new_username, changed_at)
        VALUES (OLD.id, OLD.username, NEW.username, NOW());

        NEW.last_username_change_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_username_cooldown
    BEFORE UPDATE OF username ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_username_change_cooldown();

-- ------------------------------------------------------------------------------
-- 4. User Preferences & Settings Entities
-- ------------------------------------------------------------------------------

-- 4.1 General User Settings
CREATE TABLE public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    theme VARCHAR(10) NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    sound_effects_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    enter_is_send BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.2 Privacy Settings
CREATE TABLE public.privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    who_can_message_me VARCHAR(15) NOT NULL DEFAULT 'everyone' 
        CHECK (who_can_message_me IN ('everyone', 'friends_only', 'nobody')),
    who_can_add_to_groups VARCHAR(15) NOT NULL DEFAULT 'everyone' 
        CHECK (who_can_add_to_groups IN ('everyone', 'friends_only', 'nobody')),
    read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    online_status_visible BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_visible BOOLEAN NOT NULL DEFAULT TRUE,
    default_disappearing_timer INTEGER NOT NULL DEFAULT 0 
        CHECK (default_disappearing_timer IN (0, 30, 300, 3600, 86400, 604800)), -- 0=off, 30s, 5m, 1h, 24h, 7d
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_privacy_settings_updated_at
    BEFORE UPDATE ON public.privacy_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.3 Notification Settings
CREATE TABLE public.notification_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    direct_messages_notify BOOLEAN NOT NULL DEFAULT TRUE,
    group_messages_notify BOOLEAN NOT NULL DEFAULT TRUE,
    friend_requests_notify BOOLEAN NOT NULL DEFAULT TRUE,
    in_app_sounds BOOLEAN NOT NULL DEFAULT TRUE,
    preview_message_text BOOLEAN NOT NULL DEFAULT FALSE, -- Privacy shield on lock screen
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_notification_settings_updated_at
    BEFORE UPDATE ON public.notification_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 5. Sessions, Login History & Recovery Records
-- ------------------------------------------------------------------------------

-- 5.1 Active User Sessions
CREATE TABLE public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL,
    client_device_info TEXT,
    ip_address_hash TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user ON public.user_sessions(user_id, is_revoked);
CREATE INDEX idx_user_sessions_active ON public.user_sessions(last_active_at DESC);

-- 5.2 Login History (Audit Log)
CREATE TABLE public.login_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    success BOOLEAN NOT NULL,
    ip_address_hash TEXT,
    user_agent TEXT,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_history_user ON public.login_history(user_id, created_at DESC);

-- 5.3 Cryptographic Recovery Records (Zero-Knowledge Passphrase Vault)
-- NOTE: Plaintext passwords are NEVER stored; Supabase Auth manages authentication.
CREATE TABLE public.recovery_records (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    recovery_hash TEXT NOT NULL,
    encrypted_key_vault TEXT NOT NULL,
    vault_nonce_iv TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. Social Relationships: Friend Requests, Friendships & Blocks
-- ------------------------------------------------------------------------------

-- 6.1 Friend Requests
CREATE TABLE public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status VARCHAR(15) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_friend_req_no_self CHECK (sender_id <> receiver_id),
    CONSTRAINT uq_friend_requests UNIQUE (sender_id, receiver_id)
);

CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id, status);
CREATE INDEX idx_friend_requests_sender ON public.friend_requests(sender_id, status);

CREATE TRIGGER trg_friend_requests_updated_at
    BEFORE UPDATE ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6.2 Friendships (Mutual Contacts)
CREATE TABLE public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    custom_nickname VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_friendship_no_self CHECK (user_id <> friend_id),
    CONSTRAINT uq_friendships UNIQUE (user_id, friend_id)
);

CREATE INDEX idx_friendships_user ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend ON public.friendships(friend_id);

-- 6.3 Blocked Users
CREATE TABLE public.blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_block_no_self CHECK (blocker_id <> blocked_id),
    CONSTRAINT uq_blocked_users UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX idx_blocked_users_blocker ON public.blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked ON public.blocked_users(blocked_id);

-- ------------------------------------------------------------------------------
-- 7. Conversations, Members & Groups
-- ------------------------------------------------------------------------------

-- 7.1 Conversations Table
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(10) NOT NULL CHECK (type IN ('direct', 'group')),
    disappearing_timer INTEGER NOT NULL DEFAULT 0 
        CHECK (disappearing_timer IN (0, 30, 300, 3600, 86400, 604800)), -- 0=disabled
    disappearing_timer_set_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    disappearing_timer_updated_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_updated ON public.conversations(updated_at DESC);
CREATE INDEX idx_conversations_type ON public.conversations(type);

CREATE TRIGGER trg_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7.2 Conversation Members Table
CREATE TABLE public.conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    encrypted_conversation_key TEXT, -- E2EE group/direct symmetric key encrypted with user's ECDH public key
    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    CONSTRAINT uq_conversation_members UNIQUE (conversation_id, user_id)
);

CREATE INDEX idx_conv_members_user_conv ON public.conversation_members(user_id, conversation_id);
CREATE INDEX idx_conv_members_conv ON public.conversation_members(conversation_id);

-- 7.3 Groups Table (Linked 1:1 with conversations where type = 'group')
CREATE TABLE public.groups (
    conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(300),
    avatar_url TEXT, -- Group identity avatar only (no chat attachments)
    cover_url TEXT,  -- Group identity cover/banner only
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    invite_code VARCHAR(32) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groups_owner ON public.groups(owner_id);
CREATE INDEX idx_groups_invite_code ON public.groups(invite_code);

CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7.4 Group Members Entity (Detailed group role & permission flags)
CREATE TABLE public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(conversation_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    can_invite BOOLEAN NOT NULL DEFAULT TRUE,
    can_pin_messages BOOLEAN NOT NULL DEFAULT FALSE,
    can_change_info BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_group_members UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_group ON public.group_members(group_id, user_id);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);

-- 7.5 Group Settings Table
CREATE TABLE public.group_settings (
    group_id UUID PRIMARY KEY REFERENCES public.groups(conversation_id) ON DELETE CASCADE,
    who_can_send_messages VARCHAR(15) NOT NULL DEFAULT 'everyone' 
        CHECK (who_can_send_messages IN ('everyone', 'admins_only')),
    who_can_edit_group_info VARCHAR(15) NOT NULL DEFAULT 'admins_only' 
        CHECK (who_can_edit_group_info IN ('everyone', 'admins_only')),
    who_can_invite_members VARCHAR(15) NOT NULL DEFAULT 'everyone' 
        CHECK (who_can_invite_members IN ('everyone', 'admins_only')),
    disappearing_messages_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    disappearing_timer INTEGER NOT NULL DEFAULT 0 
        CHECK (disappearing_timer IN (0, 30, 300, 3600, 86400, 604800)),
    allow_member_list_visibility BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_group_settings_updated_at
    BEFORE UPDATE ON public.group_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 8. Messages & Message Reads (STRICTLY TEXT-ONLY)
-- ------------------------------------------------------------------------------

-- 8.1 Messages Table
-- NOTE: In strict accordance with AGENTS.md Rule 1 and Rule 2, chat is text-only.
-- Zero media/attachment/file/voice-message columns exist in this schema.
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    ciphertext TEXT NOT NULL,
    nonce_iv TEXT NOT NULL,
    message_type VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system')),
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_deleted_for_all BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conv_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_reply ON public.messages(reply_to_id);
CREATE INDEX idx_messages_expires_at ON public.messages(expires_at) WHERE expires_at IS NOT NULL;

CREATE TRIGGER trg_messages_updated_at
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8.2 Trigger: Automatically calculate expires_at based on conversation timer
CREATE OR REPLACE FUNCTION public.calculate_message_expiration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    conv_timer INTEGER;
BEGIN
    -- Only calculate if not already explicitly set
    IF NEW.expires_at IS NULL THEN
        SELECT disappearing_timer INTO conv_timer
        FROM public.conversations
        WHERE id = NEW.conversation_id;

        IF conv_timer IS NOT NULL AND conv_timer > 0 THEN
            NEW.expires_at = NEW.sent_at + (conv_timer || ' seconds')::INTERVAL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_message_expiration
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.calculate_message_expiration();

-- 8.3 Message Reads (Read Receipts)
CREATE TABLE public.message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_message_reads UNIQUE (message_id, user_id)
);

CREATE INDEX idx_message_reads_msg ON public.message_reads(message_id);
CREATE INDEX idx_message_reads_user ON public.message_reads(user_id);

-- ------------------------------------------------------------------------------
-- 9. Notifications
-- ------------------------------------------------------------------------------

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'friend_request', 
        'friend_accepted', 
        'group_invite', 
        'group_mention', 
        'system_alert', 
        'moderation_notice'
    )),
    title VARCHAR(100) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

-- ------------------------------------------------------------------------------
-- 10. Reports, Report Actions & Moderation Records
-- ------------------------------------------------------------------------------

-- 10.1 Reports Table
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    reported_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN (
        'harassment', 
        'spam', 
        'impersonation', 
        'inappropriate_behavior', 
        'other'
    )),
    reason TEXT NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
    resolution_notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON public.reports(status, created_at DESC);
CREATE INDEX idx_reports_reported_user ON public.reports(reported_user_id);
CREATE INDEX idx_reports_reporter ON public.reports(reporter_id);

CREATE TRIGGER trg_reports_updated_at
    BEFORE UPDATE ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10.2 Report Actions Table
CREATE TABLE public.report_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
    moderator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
        'warning_issued', 
        'content_removed', 
        'user_suspended', 
        'user_banned', 
        'report_dismissed'
    )),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_actions_report ON public.report_actions(report_id);
CREATE INDEX idx_report_actions_moderator ON public.report_actions(moderator_id);

-- 10.3 Moderation Records (Suspensions, Bans & History)
CREATE TABLE public.moderation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    moderator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(25) NOT NULL CHECK (action IN (
        'warning', 
        'temporary_suspension', 
        'permanent_ban', 
        'unban', 
        'unsuspend'
    )),
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_records_user ON public.moderation_records(user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 11. Automated Profile & Default Settings Bootstrap (Supabase Auth Trigger)
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
BEGIN
    -- Extract username from raw_user_meta_data or email prefix (<username>@auth.imdconnect.local)
    raw_username := NEW.raw_user_meta_data->>'username';
    IF raw_username IS NULL OR raw_username = '' THEN
        raw_username := split_part(NEW.email, '@', 1);
    END IF;

    extracted_username := LOWER(TRIM(raw_username));

    -- Create Profile
    INSERT INTO public.profiles (
        id,
        username,
        display_name,
        public_key
    ) VALUES (
        NEW.id,
        extracted_username,
        COALESCE(NEW.raw_user_meta_data->>'display_name', extracted_username),
        COALESCE(NEW.raw_user_meta_data->>'public_key', '')
    );

    -- Create Default User Settings
    INSERT INTO public.user_settings (user_id) VALUES (NEW.id);

    -- Create Default Privacy Settings
    INSERT INTO public.privacy_settings (user_id) VALUES (NEW.id);

    -- Create Default Notification Settings
    INSERT INTO public.notification_settings (user_id) VALUES (NEW.id);

    RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 12. Automated Ephemeral Message Shredding (pg_cron)
-- ------------------------------------------------------------------------------

SELECT cron.schedule(
    'shred-expired-text-messages',
    '* * * * *',
    $$
    DELETE FROM public.messages
    WHERE expires_at IS NOT NULL 
      AND expires_at <= NOW();
    $$
);

-- ------------------------------------------------------------------------------
-- 13. PostgreSQL Row Level Security (RLS) Policies
-- ------------------------------------------------------------------------------

-- Enable RLS on every user-accessible table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_records ENABLE ROW LEVEL SECURITY;

-- 13.1 Helper Security Functions for RLS Policies
CREATE OR REPLACE FUNCTION public.is_conv_member(conv_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.conversation_members
        WHERE conversation_id = conv_id
          AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(grp_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = grp_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_blocked_by(target_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.blocked_users
        WHERE blocker_id = target_user_id
          AND blocked_id = auth.uid()
    );
$$;

-- 13.2 PROFILES POLICIES
CREATE POLICY "Public profiles are readable by authenticated users"
    ON public.profiles FOR SELECT TO authenticated
    USING (NOT is_banned);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING (auth.uid() = id AND NOT is_suspended AND NOT is_banned)
    WITH CHECK (auth.uid() = id);

-- 13.3 USERNAME HISTORY POLICIES
CREATE POLICY "Users can view their own username history"
    ON public.username_history FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- 13.4 SETTINGS POLICIES (user_settings, privacy_settings, notification_settings)
CREATE POLICY "Users manage their own user_settings"
    ON public.user_settings FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own privacy_settings"
    ON public.privacy_settings FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their own notification_settings"
    ON public.notification_settings FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 13.5 SESSIONS & LOGIN HISTORY POLICIES
CREATE POLICY "Users view and revoke their own sessions"
    ON public.user_sessions FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their own login history"
    ON public.login_history FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- 13.6 RECOVERY RECORDS POLICIES
CREATE POLICY "Users manage their own recovery records"
    ON public.recovery_records FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 13.7 SOCIAL POLICIES (friend_requests, friendships, blocked_users)
CREATE POLICY "Users view their own friend requests"
    ON public.friend_requests FOR SELECT TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users create friend requests"
    ON public.friend_requests FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND NOT public.is_blocked_by(receiver_id)
    );

CREATE POLICY "Users update received friend requests"
    ON public.friend_requests FOR UPDATE TO authenticated
    USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE POLICY "Users view their friendships"
    ON public.friendships FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users manage their friendships"
    ON public.friendships FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their blocked list"
    ON public.blocked_users FOR ALL TO authenticated
    USING (auth.uid() = blocker_id)
    WITH CHECK (auth.uid() = blocker_id);

-- 13.8 CONVERSATIONS & CONVERSATION MEMBERS POLICIES
CREATE POLICY "Members can select conversations"
    ON public.conversations FOR SELECT TO authenticated
    USING (public.is_conv_member(id));

CREATE POLICY "Authenticated users can create conversations"
    ON public.conversations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Conversation members can update conversation settings"
    ON public.conversations FOR UPDATE TO authenticated
    USING (public.is_conv_member(id));

CREATE POLICY "Members can select conversation member lists"
    ON public.conversation_members FOR SELECT TO authenticated
    USING (public.is_conv_member(conversation_id));

CREATE POLICY "Users can insert members if creator or admin"
    ON public.conversation_members FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = conversation_members.conversation_id
              AND cm.user_id = auth.uid()
              AND cm.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Users can update their own membership status"
    ON public.conversation_members FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Owners and admins can remove members or members can leave"
    ON public.conversation_members FOR DELETE TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = conversation_members.conversation_id
              AND cm.user_id = auth.uid()
              AND cm.role IN ('owner', 'admin')
        )
    );

-- 13.9 GROUPS, GROUP MEMBERS & GROUP SETTINGS POLICIES
CREATE POLICY "Public groups or joined groups are readable"
    ON public.groups FOR SELECT TO authenticated
    USING (is_public OR public.is_conv_member(conversation_id));

CREATE POLICY "Users can create groups"
    ON public.groups FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Group admins can update group metadata"
    ON public.groups FOR UPDATE TO authenticated
    USING (public.is_group_admin(conversation_id));

CREATE POLICY "Members can view group members"
    ON public.group_members FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.groups g WHERE g.conversation_id = group_members.group_id AND g.is_public
        ) OR public.is_conv_member(group_id)
    );

CREATE POLICY "Group admins can manage group members"
    ON public.group_members FOR ALL TO authenticated
    USING (auth.uid() = user_id OR public.is_group_admin(group_id))
    WITH CHECK (auth.uid() = user_id OR public.is_group_admin(group_id));

CREATE POLICY "Members can view group settings"
    ON public.group_settings FOR SELECT TO authenticated
    USING (public.is_conv_member(group_id));

CREATE POLICY "Group admins can update group settings"
    ON public.group_settings FOR UPDATE TO authenticated
    USING (public.is_group_admin(group_id));

-- 13.10 MESSAGES POLICIES (STRICTLY TEXT-ONLY)
CREATE POLICY "Members can view active text messages"
    ON public.messages FOR SELECT TO authenticated
    USING (
        public.is_conv_member(conversation_id)
        AND (expires_at IS NULL OR expires_at > NOW())
        AND NOT is_deleted_for_all
    );

CREATE POLICY "Members can insert text messages if not blocked"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND public.is_conv_member(conversation_id)
        AND NOT EXISTS (
            -- Ensure sender is not suspended or banned
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND (p.is_suspended OR p.is_banned)
        )
        AND NOT EXISTS (
            -- Ensure no participant in direct chat has blocked sender
            SELECT 1 FROM public.conversation_members cm
            JOIN public.blocked_users bu ON bu.blocker_id = cm.user_id
            WHERE cm.conversation_id = messages.conversation_id
              AND bu.blocked_id = auth.uid()
        )
    );

CREATE POLICY "Senders can soft-delete their own messages"
    ON public.messages FOR UPDATE TO authenticated
    USING (auth.uid() = sender_id)
    WITH CHECK (auth.uid() = sender_id);

-- 13.11 MESSAGE READS POLICIES
CREATE POLICY "Members can view read markers"
    ON public.message_reads FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_reads.message_id
              AND public.is_conv_member(m.conversation_id)
        )
    );

CREATE POLICY "Users can record their own message read receipts"
    ON public.message_reads FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 13.12 NOTIFICATIONS POLICIES
CREATE POLICY "Users view and manage their own notifications"
    ON public.notifications FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 13.13 REPORTS POLICIES
CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view reports they filed"
    ON public.reports FOR SELECT TO authenticated
    USING (auth.uid() = reporter_id);

-- 13.14 MODERATION & REPORT ACTIONS POLICIES (Read-only for affected user, manageable by staff)
CREATE POLICY "Users can view warnings/actions against their account"
    ON public.moderation_records FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
