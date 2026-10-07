-- ==============================================================================
-- ImdConnect — Complete Group Chat System Migration
-- Migration: 20261007290000_complete_group_chat_system.sql
--
-- Features:
-- 1. Create group (Name, Description, Group Avatar, Disappearing Timer, Privacy Mode)
-- 2. Member Management (Add members, Remove members, Leave group)
-- 3. Strict 3-Tier Roles: OWNER, ADMIN, MEMBER
-- 4. Admin promotion / demotion restricted strictly to OWNER
-- 5. Ownership safeguards:
--    - Owner cannot accidentally be removed
--    - Owner must transfer ownership before leaving if other members exist
--    - Safe group deletion / auto-cleanup when sole owner leaves
-- 6. Group mute, privacy chat mode & disappearing messages
-- 7. Sync triggers between group_members and conversation_members
-- 8. Messages remain strictly text-only
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Synchronize group_members and conversation_members
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_group_and_conv_members()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.conversation_members
        WHERE conversation_id = OLD.group_id AND user_id = OLD.user_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.conversation_members
        SET role = NEW.role
        WHERE conversation_id = NEW.group_id AND user_id = NEW.user_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_group_members_to_conv ON public.group_members;
CREATE TRIGGER trg_sync_group_members_to_conv
    AFTER UPDATE OR DELETE ON public.group_members
    FOR EACH ROW EXECUTE FUNCTION public.sync_group_and_conv_members();

-- ------------------------------------------------------------------------------
-- 2. RPC: Create Group Chat
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_group_chat(
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL,
    p_is_public BOOLEAN DEFAULT FALSE,
    p_initial_member_ids UUID[] DEFAULT '{}',
    p_disappearing_timer INTEGER DEFAULT 180,
    p_is_privacy_mode BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_conv_id UUID;
    v_invite_code TEXT;
    v_member_id UUID;
    v_added_count INTEGER := 0;
    v_can_add BOOLEAN;
    v_privacy VARCHAR(15);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    p_name := trim(p_name);
    IF p_name IS NULL OR length(p_name) < 1 OR length(p_name) > 100 THEN
        RAISE EXCEPTION 'Group name must be between 1 and 100 characters.';
    END IF;

    -- Generate random 16-character invite code
    v_invite_code := substr(md5(random()::text || clock_timestamp()::text), 1, 16);

    -- 1. Create conversation container
    INSERT INTO public.conversations (
        type, 
        disappearing_timer, 
        disappearing_timer_set_by,
        disappearing_timer_updated_at,
        is_privacy_mode,
        created_by, 
        created_at, 
        updated_at
    )
    VALUES (
        'group',
        COALESCE(p_disappearing_timer, 180),
        v_caller_id,
        NOW(),
        COALESCE(p_is_privacy_mode, FALSE),
        v_caller_id,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_conv_id;

    -- 2. Create group metadata record
    INSERT INTO public.groups (
        conversation_id,
        name,
        description,
        avatar_url,
        owner_id,
        is_public,
        invite_code,
        created_at,
        updated_at
    )
    VALUES (
        v_conv_id,
        p_name,
        nullif(trim(p_description), ''),
        nullif(trim(p_avatar_url), ''),
        v_caller_id,
        COALESCE(p_is_public, FALSE),
        v_invite_code,
        NOW(),
        NOW()
    );

    -- 3. Add Owner to conversation_members & group_members
    INSERT INTO public.conversation_members (
        conversation_id,
        user_id,
        role,
        is_privacy_mode,
        joined_at
    )
    VALUES (
        v_conv_id,
        v_caller_id,
        'owner',
        COALESCE(p_is_privacy_mode, FALSE),
        NOW()
    );

    INSERT INTO public.group_members (
        group_id,
        user_id,
        role,
        can_invite,
        can_pin_messages,
        can_change_info,
        joined_at
    )
    VALUES (
        v_conv_id,
        v_caller_id,
        'owner',
        TRUE,
        TRUE,
        TRUE,
        NOW()
    );

    -- 4. Create default group settings
    INSERT INTO public.group_settings (
        group_id,
        who_can_send_messages,
        who_can_edit_group_info,
        who_can_invite_members,
        disappearing_messages_enabled,
        disappearing_timer,
        created_at,
        updated_at
    )
    VALUES (
        v_conv_id,
        'everyone',
        'admins_only',
        'everyone',
        (COALESCE(p_disappearing_timer, 180) > 0),
        COALESCE(p_disappearing_timer, 180),
        NOW(),
        NOW()
    );

    -- 5. Add initial members if supplied
    IF p_initial_member_ids IS NOT NULL AND array_length(p_initial_member_ids, 1) > 0 THEN
        FOREACH v_member_id IN ARRAY p_initial_member_ids LOOP
            -- Skip caller
            IF v_member_id = v_caller_id THEN
                CONTINUE;
            END IF;

            -- Check block status
            IF EXISTS (
                SELECT 1 FROM public.blocked_users 
                WHERE (blocker_id = v_caller_id AND blocked_id = v_member_id)
                   OR (blocker_id = v_member_id AND blocked_id = v_caller_id)
            ) THEN
                CONTINUE;
            END IF;

            -- Check user's privacy setting
            SELECT who_can_add_to_groups INTO v_privacy
            FROM public.privacy_settings
            WHERE user_id = v_member_id;

            v_can_add := TRUE;
            IF v_privacy = 'nobody' THEN
                v_can_add := FALSE;
            ELSIF v_privacy = 'friends_only' THEN
                v_can_add := public.are_friends(v_caller_id, v_member_id);
            END IF;

            IF v_can_add THEN
                INSERT INTO public.conversation_members (conversation_id, user_id, role, is_privacy_mode, joined_at)
                VALUES (v_conv_id, v_member_id, 'member', COALESCE(p_is_privacy_mode, FALSE), NOW())
                ON CONFLICT (conversation_id, user_id) DO NOTHING;

                INSERT INTO public.group_members (group_id, user_id, role, can_invite, can_pin_messages, can_change_info, joined_at)
                VALUES (v_conv_id, v_member_id, 'member', TRUE, FALSE, FALSE, NOW())
                ON CONFLICT (group_id, user_id) DO NOTHING;

                v_added_count := v_added_count + 1;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'conversation_id', v_conv_id,
        'name', p_name,
        'initial_members_added', v_added_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_chat(TEXT, TEXT, TEXT, BOOLEAN, UUID[], INTEGER, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC: Add Group Members
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_group_members(
    p_group_id UUID,
    p_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role VARCHAR(10);
    v_who_can_invite VARCHAR(15);
    v_user_id UUID;
    v_added INTEGER := 0;
    v_skipped INTEGER := 0;
    v_privacy VARCHAR(15);
    v_is_privacy_mode BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Check caller membership & role
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'You are not a member of this group.';
    END IF;

    -- Check permission to invite
    SELECT who_can_invite_members INTO v_who_can_invite
    FROM public.group_settings
    WHERE group_id = p_group_id;

    IF v_who_can_invite = 'admins_only' AND v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only group admins can add new members.';
    END IF;

    -- Get conversation privacy mode
    SELECT is_privacy_mode INTO v_is_privacy_mode
    FROM public.conversations
    WHERE id = p_group_id;

    -- Iterate users to add
    FOREACH v_user_id IN ARRAY p_user_ids LOOP
        -- Skip if already a member
        IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_user_id) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Check block status
        IF EXISTS (
            SELECT 1 FROM public.blocked_users 
            WHERE (blocker_id = v_caller_id AND blocked_id = v_user_id)
               OR (blocker_id = v_user_id AND blocked_id = v_caller_id)
        ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Check privacy setting
        SELECT who_can_add_to_groups INTO v_privacy
        FROM public.privacy_settings
        WHERE user_id = v_user_id;

        IF v_privacy = 'nobody' THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        ELSIF v_privacy = 'friends_only' AND NOT public.are_friends(v_caller_id, v_user_id) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Insert member
        INSERT INTO public.conversation_members (
            conversation_id, user_id, role, is_privacy_mode, joined_at
        ) VALUES (
            p_group_id, v_user_id, 'member', COALESCE(v_is_privacy_mode, FALSE), NOW()
        ) ON CONFLICT (conversation_id, user_id) DO NOTHING;

        INSERT INTO public.group_members (
            group_id, user_id, role, can_invite, can_pin_messages, can_change_info, joined_at
        ) VALUES (
            p_group_id, v_user_id, 'member', TRUE, FALSE, FALSE, NOW()
        ) ON CONFLICT (group_id, user_id) DO NOTHING;

        v_added := v_added + 1;
    END LOOP;

    UPDATE public.conversations
    SET updated_at = NOW()
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'added_count', v_added,
        'skipped_count', v_skipped
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_group_members(UUID, UUID[]) TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC: Remove Group Member (Owner & Admin Authorization with Safeguards)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_group_member(
    p_group_id UUID,
    p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role VARCHAR(10);
    v_target_role VARCHAR(10);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Cannot remove self via remove_group_member (must use leave_group)
    IF v_caller_id = p_target_user_id THEN
        RAISE EXCEPTION 'To leave the group, use the Leave Group feature.';
    END IF;

    -- Get caller role
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'You are not a member of this group.';
    END IF;

    -- Get target role
    SELECT role INTO v_target_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_target_user_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Target user is not a member of this group.';
    END IF;

    -- -------------------------------------------------------------
    -- CRITICAL OWNER SAFEGUARD: Owner cannot be removed!
    -- -------------------------------------------------------------
    IF v_target_role = 'owner' THEN
        RAISE EXCEPTION 'The group owner cannot be removed. Ownership must be transferred first.';
    END IF;

    -- Authorization logic:
    -- Regular members cannot remove anyone
    IF v_caller_role = 'member' THEN
        RAISE EXCEPTION 'Members do not have permission to remove users.';
    END IF;

    -- Admins can only remove regular members (cannot remove other admins or owner)
    IF v_caller_role = 'admin' AND v_target_role <> 'member' THEN
        RAISE EXCEPTION 'Group admins cannot remove other admins. Only the owner can remove admins.';
    END IF;

    -- Perform removal
    DELETE FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_target_user_id;

    DELETE FROM public.conversation_members
    WHERE conversation_id = p_group_id AND user_id = p_target_user_id;

    UPDATE public.conversations
    SET updated_at = NOW()
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'removed_user_id', p_target_user_id,
        'removed_role', v_target_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC: Set Member Role (Promote / Demote Admins - Restricted strictly to OWNER)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_group_member_role(
    p_group_id UUID,
    p_target_user_id UUID,
    p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role VARCHAR(10);
    v_target_role VARCHAR(10);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    p_new_role := lower(trim(p_new_role));
    IF p_new_role NOT IN ('admin', 'member') THEN
        RAISE EXCEPTION 'New role must be either "admin" or "member". Use transfer_group_ownership for owner.';
    END IF;

    -- Check caller is OWNER
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    IF v_caller_role <> 'owner' THEN
        RAISE EXCEPTION 'Only the group owner can promote or demote administrators.';
    END IF;

    -- Check target user
    SELECT role INTO v_target_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_target_user_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Target user is not a member of this group.';
    END IF;

    IF v_target_user_id = v_caller_id THEN
        RAISE EXCEPTION 'Cannot alter owner role with this method. Use transfer_group_ownership.';
    END IF;

    -- Update group_members & conversation_members
    UPDATE public.group_members
    SET 
        role = p_new_role,
        can_invite = TRUE,
        can_pin_messages = (p_new_role = 'admin'),
        can_change_info = (p_new_role = 'admin')
    WHERE group_id = p_group_id AND user_id = p_target_user_id;

    UPDATE public.conversation_members
    SET role = p_new_role
    WHERE conversation_id = p_group_id AND user_id = p_target_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'target_user_id', p_target_user_id,
        'new_role', p_new_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_group_member_role(UUID, UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. RPC: Transfer Group Ownership (Owner Safeguard & Transfer Behavior)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transfer_group_ownership(
    p_group_id UUID,
    p_new_owner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role VARCHAR(10);
    v_target_role VARCHAR(10);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF v_caller_id = p_new_owner_id THEN
        RAISE EXCEPTION 'You are already the group owner.';
    END IF;

    -- Verify caller is the current Owner
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    IF v_caller_role <> 'owner' THEN
        RAISE EXCEPTION 'Only the current group owner can transfer ownership.';
    END IF;

    -- Verify target is an active member
    SELECT role INTO v_target_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_new_owner_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Target user must be an active member of the group.';
    END IF;

    -- 1. Update groups table owner_id
    UPDATE public.groups
    SET owner_id = p_new_owner_id, updated_at = NOW()
    WHERE conversation_id = p_group_id;

    -- 2. Elevate new owner
    UPDATE public.group_members
    SET role = 'owner', can_invite = TRUE, can_pin_messages = TRUE, can_change_info = TRUE
    WHERE group_id = p_group_id AND user_id = p_new_owner_id;

    UPDATE public.conversation_members
    SET role = 'owner'
    WHERE conversation_id = p_group_id AND user_id = p_new_owner_id;

    -- 3. Demote old owner to 'admin' (ensuring they remain an admin)
    UPDATE public.group_members
    SET role = 'admin', can_invite = TRUE, can_pin_messages = TRUE, can_change_info = TRUE
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    UPDATE public.conversation_members
    SET role = 'admin'
    WHERE conversation_id = p_group_id AND user_id = v_caller_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'old_owner_id', v_caller_id,
        'new_owner_id', p_new_owner_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. RPC: Leave Group (With Safe Owner Transfer / Cleanup Logic)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_group(
    p_group_id UUID,
    p_transfer_to_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role VARCHAR(10);
    v_member_count INTEGER;
    v_target_role VARCHAR(10);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Get caller's role
    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'You are not a member of this group.';
    END IF;

    -- If caller is regular member or admin: leave freely
    IF v_caller_role <> 'owner' THEN
        DELETE FROM public.group_members
        WHERE group_id = p_group_id AND user_id = v_caller_id;

        DELETE FROM public.conversation_members
        WHERE conversation_id = p_group_id AND user_id = v_caller_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'member_left',
            'group_id', p_group_id
        );
    END IF;

    -- If caller IS OWNER: inspect remaining members
    SELECT COUNT(*) INTO v_member_count
    FROM public.group_members
    WHERE group_id = p_group_id;

    -- Case A: Sole member left -> Safe group deletion
    IF v_member_count <= 1 THEN
        DELETE FROM public.conversations
        WHERE id = p_group_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'group_deleted',
            'message', 'Group had no remaining members and was safely deleted.'
        );
    END IF;

    -- Case B: Other members exist -> Owner MUST transfer ownership
    IF p_transfer_to_user_id IS NULL THEN
        RAISE EXCEPTION 'As the group owner, you must transfer ownership to another member before leaving.';
    END IF;

    -- Verify target is an active member
    SELECT role INTO v_target_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_transfer_to_user_id;

    IF v_target_role IS NULL THEN
        RAISE EXCEPTION 'Designated successor is not a member of this group.';
    END IF;

    -- Transfer ownership to successor
    UPDATE public.groups
    SET owner_id = p_transfer_to_user_id, updated_at = NOW()
    WHERE conversation_id = p_group_id;

    UPDATE public.group_members
    SET role = 'owner', can_invite = TRUE, can_pin_messages = TRUE, can_change_info = TRUE
    WHERE group_id = p_group_id AND user_id = p_transfer_to_user_id;

    UPDATE public.conversation_members
    SET role = 'owner'
    WHERE conversation_id = p_group_id AND user_id = p_transfer_to_user_id;

    -- Remove departing owner
    DELETE FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    DELETE FROM public.conversation_members
    WHERE conversation_id = p_group_id AND user_id = v_caller_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'ownership_transferred_and_left',
        'new_owner_id', p_transfer_to_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_group(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. RPC: Safe Group Deletion (Restricted strictly to OWNER)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_group_safe(
    p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role VARCHAR(10);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    IF v_caller_role <> 'owner' THEN
        RAISE EXCEPTION 'Only the group owner can permanently delete this group.';
    END IF;

    -- Cascading delete from conversations handles groups, members, settings, messages
    DELETE FROM public.conversations
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'deleted_group_id', p_group_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_group_safe(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 9. RPC: Update Group Info & Settings (Owner & Admins)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_group_info_and_settings(
    p_group_id UUID,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL,
    p_is_public BOOLEAN DEFAULT NULL,
    p_disappearing_timer INTEGER DEFAULT NULL,
    p_is_privacy_mode BOOLEAN DEFAULT NULL,
    p_who_can_send TEXT DEFAULT NULL,
    p_who_can_edit TEXT DEFAULT NULL,
    p_who_can_invite TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role VARCHAR(10);
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT role INTO v_caller_role
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id;

    IF v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Only group admins and the owner can update group settings.';
    END IF;

    -- Update groups metadata
    UPDATE public.groups
    SET
        name = COALESCE(nullif(trim(p_name), ''), name),
        description = CASE WHEN p_description IS NOT NULL THEN trim(p_description) ELSE description END,
        avatar_url = CASE WHEN p_avatar_url IS NOT NULL THEN trim(p_avatar_url) ELSE avatar_url END,
        is_public = COALESCE(p_is_public, is_public),
        updated_at = NOW()
    WHERE conversation_id = p_group_id;

    -- Update conversations (disappearing timer, privacy mode)
    UPDATE public.conversations
    SET
        disappearing_timer = COALESCE(p_disappearing_timer, disappearing_timer),
        disappearing_timer_set_by = CASE WHEN p_disappearing_timer IS NOT NULL THEN v_caller_id ELSE disappearing_timer_set_by END,
        disappearing_timer_updated_at = CASE WHEN p_disappearing_timer IS NOT NULL THEN NOW() ELSE disappearing_timer_updated_at END,
        is_privacy_mode = COALESCE(p_is_privacy_mode, is_privacy_mode),
        updated_at = NOW()
    WHERE id = p_group_id;

    -- Update group_settings
    UPDATE public.group_settings
    SET
        who_can_send_messages = COALESCE(p_who_can_send, who_can_send_messages),
        who_can_edit_group_info = COALESCE(p_who_can_edit, who_can_edit_group_info),
        who_can_invite_members = COALESCE(p_who_can_invite, who_can_invite_members),
        disappearing_messages_enabled = CASE WHEN p_disappearing_timer IS NOT NULL THEN (p_disappearing_timer > 0) ELSE disappearing_messages_enabled END,
        disappearing_timer = COALESCE(p_disappearing_timer, disappearing_timer),
        updated_at = NOW()
    WHERE group_id = p_group_id;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_group_info_and_settings(UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 10. RPC: Get Full Group Details with Members
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_group_full_details(
    p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_is_member BOOLEAN;
    v_is_public BOOLEAN;
    v_group JSONB;
    v_settings JSONB;
    v_caller_membership JSONB;
    v_members JSONB;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    -- Check if group exists and visibility
    SELECT g.is_public INTO v_is_public
    FROM public.groups g
    WHERE g.conversation_id = p_group_id;

    IF v_is_public IS NULL THEN
        RAISE EXCEPTION 'Group not found.';
    END IF;

    v_is_member := EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_id = p_group_id AND user_id = v_caller_id
    );

    IF NOT v_is_member AND NOT v_is_public THEN
        RAISE EXCEPTION 'You do not have permission to view this group.';
    END IF;

    -- Group metadata
    SELECT jsonb_build_object(
        'id', g.conversation_id,
        'name', g.name,
        'description', g.description,
        'avatar_url', g.avatar_url,
        'cover_url', g.cover_url,
        'owner_id', g.owner_id,
        'is_public', g.is_public,
        'invite_code', g.invite_code,
        'disappearing_timer', c.disappearing_timer,
        'is_privacy_mode', c.is_privacy_mode,
        'created_at', g.created_at
    ) INTO v_group
    FROM public.groups g
    JOIN public.conversations c ON c.id = g.conversation_id
    WHERE g.conversation_id = p_group_id;

    -- Caller membership
    SELECT jsonb_build_object(
        'role', gm.role,
        'can_invite', gm.can_invite,
        'can_pin_messages', gm.can_pin_messages,
        'can_change_info', gm.can_change_info,
        'is_muted', cm.is_muted,
        'is_privacy_mode', cm.is_privacy_mode
    ) INTO v_caller_membership
    FROM public.group_members gm
    JOIN public.conversation_members cm ON cm.conversation_id = gm.group_id AND cm.user_id = gm.user_id
    WHERE gm.group_id = p_group_id AND gm.user_id = v_caller_id;

    -- Group settings
    SELECT jsonb_build_object(
        'who_can_send_messages', gs.who_can_send_messages,
        'who_can_edit_group_info', gs.who_can_edit_group_info,
        'who_can_invite_members', gs.who_can_invite_members,
        'disappearing_messages_enabled', gs.disappearing_messages_enabled,
        'disappearing_timer', gs.disappearing_timer
    ) INTO v_settings
    FROM public.group_settings gs
    WHERE gs.group_id = p_group_id;

    -- Members list with profiles
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', gm.user_id,
            'role', gm.role,
            'joined_at', gm.joined_at,
            'username', p.username,
            'display_name', p.display_name,
            'avatar_url', p.avatar_url,
            'last_seen_at', p.last_seen_at
        ) ORDER BY 
            CASE gm.role 
                WHEN 'owner' THEN 1 
                WHEN 'admin' THEN 2 
                ELSE 3 
            END,
            gm.joined_at ASC
    ) INTO v_members
    FROM public.group_members gm
    JOIN public.public_profiles p ON p.id = gm.user_id
    WHERE gm.group_id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'group', v_group,
        'caller_membership', v_caller_membership,
        'settings', v_settings,
        'members', COALESCE(v_members, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_full_details(UUID) TO authenticated;
