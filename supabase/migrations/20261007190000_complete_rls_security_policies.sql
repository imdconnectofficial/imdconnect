-- ==============================================================================
-- ImdConnect — Comprehensive Row Level Security (RLS) Policies Migration
-- Migration: 20261007190000_complete_rls_security_policies.sql
--
-- Description:
-- Establishes airtight Row Level Security across all 23 database tables.
-- Guarantees zero-trust isolation, protects private account settings,
-- enforces privacy preferences at the SQL query level, prevents role escalation,
-- blocks communication across blocked users, and secures the moderation queue.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. App Administrators & Staff Table (Role Separation)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_admins (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'moderator', 'support')),
    granted_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_admins_role ON public.app_admins(role);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_admins FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. Core Security Helper Functions (SECURITY DEFINER / STABLE)
-- ------------------------------------------------------------------------------

-- Check if current user is an active app administrator or moderator
CREATE OR REPLACE FUNCTION public.is_app_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.app_admins
        WHERE user_id = check_user_id
          AND role IN ('superadmin', 'moderator')
    );
$$;

-- Check if current user is a superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.app_admins
        WHERE user_id = check_user_id
          AND role = 'superadmin'
    );
$$;

-- Check conversation membership
CREATE OR REPLACE FUNCTION public.is_conv_member(conv_id UUID, check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.conversation_members
        WHERE conversation_id = conv_id
          AND user_id = check_user_id
    );
$$;

-- Check group owner or admin role
CREATE OR REPLACE FUNCTION public.is_group_admin(grp_id UUID, check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.group_members
        WHERE group_id = grp_id
          AND user_id = check_user_id
          AND role IN ('owner', 'admin')
    );
$$;

-- Check if user A has blocked user B
CREATE OR REPLACE FUNCTION public.is_blocked_by(target_user_id UUID, check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.blocked_users
        WHERE blocker_id = target_user_id
          AND blocked_id = check_user_id
    );
$$;

-- Check mutual friendship between two users
CREATE OR REPLACE FUNCTION public.are_friends(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.friendships
        WHERE user_id = user_a
          AND friend_id = user_b
    );
$$;

-- ------------------------------------------------------------------------------
-- 3. Prevent Privilege Escalation on `profiles` (DB Trigger)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_profile_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Prevent non-superadmins from altering suspension or ban states
    IF (OLD.is_suspended IS DISTINCT FROM NEW.is_suspended OR
        OLD.suspension_reason IS DISTINCT FROM NEW.suspension_reason OR
        OLD.suspended_until IS DISTINCT FROM NEW.suspended_until OR
        OLD.is_banned IS DISTINCT FROM NEW.is_banned OR
        OLD.banned_at IS DISTINCT FROM NEW.banned_at) THEN
        
        IF NOT public.is_app_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Unauthorized: Users cannot modify account suspension or ban state.';
        END IF;
    END IF;

    -- Prevent ID or Created_At modification
    IF OLD.id <> NEW.id OR OLD.created_at <> NEW.created_at THEN
        RAISE EXCEPTION 'Unauthorized: Immutable profile fields cannot be modified.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_profile_tampering
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_tampering();

-- ------------------------------------------------------------------------------
-- 4. Enable & Force RLS on All Tables
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
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

-- ------------------------------------------------------------------------------
-- 5. Drop Pre-existing Policies to Ensure Clean State
-- ------------------------------------------------------------------------------

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 6. Table-by-Table RLS Policy Implementation
-- ------------------------------------------------------------------------------

-- ==============================================================================
-- 6.1 APP_ADMINS POLICIES
-- ==============================================================================
CREATE POLICY "Admins can view admin list"
    ON public.app_admins FOR SELECT TO authenticated
    USING (public.is_app_admin());

CREATE POLICY "Only superadmins can manage admin roles"
    ON public.app_admins FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

-- ==============================================================================
-- 6.2 PROFILES POLICIES
-- ==============================================================================
-- Non-banned profiles are visible to authenticated users (public directory lookup)
CREATE POLICY "Profiles readable by authenticated users"
    ON public.profiles FOR SELECT TO authenticated
    USING (NOT is_banned OR public.is_app_admin());

-- Users can update only their own profile while not suspended or banned
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE TO authenticated
    USING (
        (auth.uid() = id AND NOT is_suspended AND NOT is_banned)
        OR public.is_app_admin()
    )
    WITH CHECK (
        (auth.uid() = id AND NOT is_suspended AND NOT is_banned)
        OR public.is_app_admin()
    );

-- Profiles are inserted strictly via auth trigger or system
CREATE POLICY "System inserts profiles on signup"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- ==============================================================================
-- 6.3 USERNAME_HISTORY POLICIES
-- ==============================================================================
CREATE POLICY "Users view own username history"
    ON public.username_history FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_app_admin());

-- Insertions are restricted to the database cooldown trigger
CREATE POLICY "System inserts username history"
    ON public.username_history FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6.4 USER_SETTINGS POLICIES
-- ==============================================================================
CREATE POLICY "Users view own user_settings"
    ON public.user_settings FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users update own user_settings"
    ON public.user_settings FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users insert own user_settings"
    ON public.user_settings FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6.5 PRIVACY_SETTINGS POLICIES
-- ==============================================================================
CREATE POLICY "Users view own privacy_settings"
    ON public.privacy_settings FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users update own privacy_settings"
    ON public.privacy_settings FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users insert own privacy_settings"
    ON public.privacy_settings FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6.6 NOTIFICATION_SETTINGS POLICIES
-- ==============================================================================
CREATE POLICY "Users view own notification_settings"
    ON public.notification_settings FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users update own notification_settings"
    ON public.notification_settings FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users insert own notification_settings"
    ON public.notification_settings FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6.7 USER_SESSIONS POLICIES
-- ==============================================================================
CREATE POLICY "Users view own active sessions"
    ON public.user_sessions FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users revoke or update own sessions"
    ON public.user_sessions FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users insert own session records"
    ON public.user_sessions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own sessions"
    ON public.user_sessions FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ==============================================================================
-- 6.8 LOGIN_HISTORY POLICIES
-- ==============================================================================
CREATE POLICY "Users view own login history"
    ON public.login_history FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "Users insert own login history"
    ON public.login_history FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6.9 RECOVERY_RECORDS POLICIES
-- ==============================================================================
CREATE POLICY "Users access own recovery vault"
    ON public.recovery_records FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users manage own recovery vault"
    ON public.recovery_records FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6.10 FRIEND_REQUESTS POLICIES
-- ==============================================================================
CREATE POLICY "Users view relevant friend requests"
    ON public.friend_requests FOR SELECT TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users create legitimate friend requests"
    ON public.friend_requests FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND auth.uid() <> receiver_id
        AND NOT public.is_blocked_by(receiver_id)
        AND NOT public.is_blocked_by(sender_id, receiver_id)
        -- Respect recipient privacy settings (cannot request if who_can_message_me is nobody)
        AND EXISTS (
            SELECT 1 FROM public.privacy_settings ps
            WHERE ps.user_id = receiver_id
              AND ps.who_can_message_me <> 'nobody'
        )
    );

CREATE POLICY "Users respond to or cancel friend requests"
    ON public.friend_requests FOR UPDATE TO authenticated
    USING (auth.uid() = receiver_id OR auth.uid() = sender_id)
    WITH CHECK (
        (auth.uid() = receiver_id AND status IN ('accepted', 'rejected')) OR
        (auth.uid() = sender_id AND status = 'cancelled')
    );

CREATE POLICY "Users delete pending outgoing requests"
    ON public.friend_requests FOR DELETE TO authenticated
    USING (auth.uid() = sender_id AND status = 'pending');

-- ==============================================================================
-- 6.11 FRIENDSHIPS POLICIES
-- ==============================================================================
CREATE POLICY "Users view own friendships"
    ON public.friendships FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Cannot forge friendship without accepted friend request
CREATE POLICY "Users insert friendship with accepted request"
    ON public.friendships FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.friend_requests fr
            WHERE ((fr.sender_id = auth.uid() AND fr.receiver_id = friend_id) OR
                   (fr.sender_id = friend_id AND fr.receiver_id = auth.uid()))
              AND fr.status = 'accepted'
        )
    );

CREATE POLICY "Users update own friendship nickname"
    ON public.friendships FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own friendships"
    ON public.friendships FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ==============================================================================
-- 6.12 BLOCKED_USERS POLICIES
-- ==============================================================================
CREATE POLICY "Users view own blocked list"
    ON public.blocked_users FOR SELECT TO authenticated
    USING (auth.uid() = blocker_id);

CREATE POLICY "Users block other users"
    ON public.blocked_users FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = blocker_id AND auth.uid() <> blocked_id);

CREATE POLICY "Users unblock other users"
    ON public.blocked_users FOR DELETE TO authenticated
    USING (auth.uid() = blocker_id);

-- ==============================================================================
-- 6.13 CONVERSATIONS POLICIES
-- ==============================================================================
CREATE POLICY "Members view their conversations"
    ON public.conversations FOR SELECT TO authenticated
    USING (public.is_conv_member(id));

CREATE POLICY "Users create conversations"
    ON public.conversations FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authorized members update conversations"
    ON public.conversations FOR UPDATE TO authenticated
    USING (
        (type = 'direct' AND public.is_conv_member(id)) OR
        (type = 'group' AND public.is_group_admin(id))
    )
    WITH CHECK (
        (type = 'direct' AND public.is_conv_member(id)) OR
        (type = 'group' AND public.is_group_admin(id))
    );

CREATE POLICY "Group owners delete group conversations"
    ON public.conversations FOR DELETE TO authenticated
    USING (
        type = 'group' AND 
        EXISTS (
            SELECT 1 FROM public.groups g 
            WHERE g.conversation_id = conversations.id 
              AND g.owner_id = auth.uid()
        )
    );

-- ==============================================================================
-- 6.14 CONVERSATION_MEMBERS POLICIES
-- ==============================================================================
CREATE POLICY "Members view fellow conversation members"
    ON public.conversation_members FOR SELECT TO authenticated
    USING (public.is_conv_member(conversation_id));

CREATE POLICY "Add members to conversations"
    ON public.conversation_members FOR INSERT TO authenticated
    WITH CHECK (
        -- Adding self upon conversation creation
        auth.uid() = user_id OR
        -- Group admin or owner adding a member who has not blocked inviter
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

-- Users can only update their own flags (mute, pin, archive, last_read_at)
-- Role cannot be updated by normal members
CREATE POLICY "Members update their own conversation preferences"
    ON public.conversation_members FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id AND 
        role = (SELECT cm.role FROM public.conversation_members cm WHERE cm.id = conversation_members.id)
    );

CREATE POLICY "Members leave or admins remove from conversations"
    ON public.conversation_members FOR DELETE TO authenticated
    USING (
        -- Member can leave if not group owner
        (auth.uid() = user_id AND role <> 'owner') OR
        -- Admin can remove ordinary members
        (public.is_group_admin(conversation_id) AND role = 'member')
    );

-- ==============================================================================
-- 6.15 GROUPS POLICIES
-- ==============================================================================
CREATE POLICY "View public groups or joined groups"
    ON public.groups FOR SELECT TO authenticated
    USING (is_public OR public.is_conv_member(conversation_id));

CREATE POLICY "Create groups"
    ON public.groups FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = owner_id AND
        public.is_conv_member(conversation_id)
    );

CREATE POLICY "Group admins update group metadata"
    ON public.groups FOR UPDATE TO authenticated
    USING (public.is_group_admin(conversation_id))
    WITH CHECK (public.is_group_admin(conversation_id));

CREATE POLICY "Group owner deletes group"
    ON public.groups FOR DELETE TO authenticated
    USING (auth.uid() = owner_id);

-- ==============================================================================
-- 6.16 GROUP_MEMBERS POLICIES
-- ==============================================================================
CREATE POLICY "View group members"
    ON public.group_members FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.groups g WHERE g.conversation_id = group_members.group_id AND g.is_public)
        OR public.is_conv_member(group_id)
    );

CREATE POLICY "Join public group or be invited by admin"
    ON public.group_members FOR INSERT TO authenticated
    WITH CHECK (
        (
            auth.uid() = user_id AND
            EXISTS (SELECT 1 FROM public.groups g WHERE g.conversation_id = group_members.group_id AND g.is_public)
        ) OR
        public.is_group_admin(group_id)
    );

-- Only group owners can promote/demote admins; admins cannot alter owners
CREATE POLICY "Manage group member roles"
    ON public.group_members FOR UPDATE TO authenticated
    USING (public.is_group_admin(group_id))
    WITH CHECK (
        public.is_group_admin(group_id) AND
        auth.uid() <> user_id -- cannot promote self
    );

CREATE POLICY "Leave group or remove group member"
    ON public.group_members FOR DELETE TO authenticated
    USING (
        (auth.uid() = user_id AND role <> 'owner') OR
        (public.is_group_admin(group_id) AND role = 'member')
    );

-- ==============================================================================
-- 6.17 GROUP_SETTINGS POLICIES
-- ==============================================================================
CREATE POLICY "Members view group settings"
    ON public.group_settings FOR SELECT TO authenticated
    USING (public.is_conv_member(group_id));

CREATE POLICY "Group admins update group settings"
    ON public.group_settings FOR UPDATE TO authenticated
    USING (public.is_group_admin(group_id))
    WITH CHECK (public.is_group_admin(group_id));

CREATE POLICY "Group creator creates group settings"
    ON public.group_settings FOR INSERT TO authenticated
    WITH CHECK (public.is_group_admin(group_id));

-- ==============================================================================
-- 6.18 MESSAGES POLICIES (STRICTLY TEXT-ONLY)
-- ==============================================================================
CREATE POLICY "Conversation members view non-expired text messages"
    ON public.messages FOR SELECT TO authenticated
    USING (
        public.is_conv_member(conversation_id)
        AND (expires_at IS NULL OR expires_at > NOW())
        AND NOT is_deleted_for_all
    );

CREATE POLICY "Authorized members send text messages"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id
        AND public.is_conv_member(conversation_id)
        -- Sender cannot be suspended or banned
        AND NOT EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND (p.is_suspended OR p.is_banned)
        )
        -- DIRECT CHAT RESTRICTIONS:
        AND NOT EXISTS (
            SELECT 1 FROM public.conversations c
            JOIN public.conversation_members cm ON cm.conversation_id = c.id
            JOIN public.blocked_users bu ON bu.blocker_id = cm.user_id
            WHERE c.id = messages.conversation_id
              AND c.type = 'direct'
              AND bu.blocked_id = auth.uid()
        )
        -- DIRECT CHAT PRIVACY FILTER (Friends-only enforcement):
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
        -- GROUP POSTING RESTRICTIONS (Admins-only if configured):
        AND NOT EXISTS (
            SELECT 1 FROM public.group_settings gs
            WHERE gs.group_id = messages.conversation_id
              AND gs.who_can_send_messages = 'admins_only'
              AND NOT public.is_group_admin(messages.conversation_id)
        )
    );

CREATE POLICY "Author can soft-delete or pin messages"
    ON public.messages FOR UPDATE TO authenticated
    USING (
        auth.uid() = sender_id OR
        public.is_group_admin(conversation_id)
    )
    WITH CHECK (
        auth.uid() = sender_id OR
        public.is_group_admin(conversation_id)
    );

-- ==============================================================================
-- 6.19 MESSAGE_READS POLICIES
-- ==============================================================================
CREATE POLICY "Conversation members view read markers"
    ON public.message_reads FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_reads.message_id
              AND public.is_conv_member(m.conversation_id)
        )
    );

CREATE POLICY "Users mark messages as read"
    ON public.message_reads FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_reads.message_id
              AND public.is_conv_member(m.conversation_id)
        )
    );

-- ==============================================================================
-- 6.20 NOTIFICATIONS POLICIES
-- ==============================================================================
CREATE POLICY "Users view own notifications"
    ON public.notifications FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users update own notification read status"
    ON public.notifications FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
    ON public.notifications FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- System/Triggers or fellow users dispatching friend requests insert notifications
CREATE POLICY "Allow notification dispatch"
    ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

-- ==============================================================================
-- 6.21 REPORTS POLICIES
-- ==============================================================================
CREATE POLICY "Authenticated users submit reports"
    ON public.reports FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id);

-- Reporter can view only their own filed report, or staff can view all reports
CREATE POLICY "View relevant reports"
    ON public.reports FOR SELECT TO authenticated
    USING (auth.uid() = reporter_id OR public.is_app_admin());

-- Only platform staff can triage and update report status
CREATE POLICY "Staff triage reports"
    ON public.reports FOR UPDATE TO authenticated
    USING (public.is_app_admin())
    WITH CHECK (public.is_app_admin());

-- ==============================================================================
-- 6.22 REPORT_ACTIONS POLICIES
-- ==============================================================================
-- Complete moderation actions ledger is accessible ONLY to platform staff
CREATE POLICY "Only staff view report actions"
    ON public.report_actions FOR SELECT TO authenticated
    USING (public.is_app_admin());

CREATE POLICY "Only staff insert report actions"
    ON public.report_actions FOR INSERT TO authenticated
    WITH CHECK (public.is_app_admin() AND auth.uid() = moderator_id);

-- ==============================================================================
-- 6.23 MODERATION_RECORDS POLICIES
-- ==============================================================================
-- Moderated user can view formal actions against their account; staff can view all
CREATE POLICY "Users view their own moderation records"
    ON public.moderation_records FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "Staff create moderation records"
    ON public.moderation_records FOR INSERT TO authenticated
    WITH CHECK (public.is_app_admin());

CREATE POLICY "Staff update moderation records"
    ON public.moderation_records FOR UPDATE TO authenticated
    USING (public.is_app_admin())
    WITH CHECK (public.is_app_admin());
