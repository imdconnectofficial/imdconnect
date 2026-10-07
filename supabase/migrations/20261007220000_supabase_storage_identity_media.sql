-- ==============================================================================
-- ImdConnect — Supabase Storage Configuration & Identity Media Policies
-- Migration: 20261007220000_supabase_storage_identity_media.sql
--
-- Description:
-- Provisions restricted identity storage buckets: 'avatars', 'covers', 'group_covers'.
-- Strictly enforces:
-- 1. MIME restrictions (image/jpeg, image/png, image/webp ONLY - no SVG/scripts/executables).
-- 2. Size limits (2MB for avatars, 4MB for covers).
-- 3. Path isolation: users can upload/update only within their own folder ({user_id}/*).
-- 4. Group authorization: group images can only be uploaded by group owners/admins ({group_id}/*).
-- 5. Zero chat attachments bucket (chat remains 100% text-only).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Provision Restricted Identity Storage Buckets
-- ------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    (
        'avatars', 
        'avatars', 
        true, 
        2097152, -- 2MB
        ARRAY['image/jpeg', 'image/png', 'image/webp']
    ),
    (
        'covers', 
        'covers', 
        true, 
        4194304, -- 4MB
        ARRAY['image/jpeg', 'image/png', 'image/webp']
    ),
    (
        'group_covers', 
        'group_covers', 
        true, 
        4194304, -- 4MB
        ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------------------------
-- 2. Enable Row Level Security on storage.objects
-- ------------------------------------------------------------------------------

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Storage Policies: 'avatars' Bucket
-- ------------------------------------------------------------------------------

-- Public read access to avatars
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'avatars');

-- Users can only upload into their own folder: avatars/{user_id}/*
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can update/replace only their own avatar
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can delete only their own avatar
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- ------------------------------------------------------------------------------
-- 4. Storage Policies: 'covers' Bucket (User Banners)
-- ------------------------------------------------------------------------------

-- Public read access to cover images
DROP POLICY IF EXISTS "Covers are publicly readable" ON storage.objects;
CREATE POLICY "Covers are publicly readable"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'covers');

-- Users upload only to their own folder: covers/{user_id}/*
DROP POLICY IF EXISTS "Users upload own cover" ON storage.objects;
CREATE POLICY "Users upload own cover"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'covers'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users update only their own cover
DROP POLICY IF EXISTS "Users update own cover" ON storage.objects;
CREATE POLICY "Users update own cover"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'covers'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'covers'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users delete only their own cover
DROP POLICY IF EXISTS "Users delete own cover" ON storage.objects;
CREATE POLICY "Users delete own cover"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'covers'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- ------------------------------------------------------------------------------
-- 5. Storage Policies: 'group_covers' Bucket (Group Avatars & Banners)
-- ------------------------------------------------------------------------------

-- Public or members read access to group covers
DROP POLICY IF EXISTS "Group covers are publicly readable" ON storage.objects;
CREATE POLICY "Group covers are publicly readable"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'group_covers');

-- Only group owners or admins can upload into: group_covers/{group_id}/*
DROP POLICY IF EXISTS "Group admins upload group cover" ON storage.objects;
CREATE POLICY "Group admins upload group cover"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'group_covers'
        AND public.is_group_admin((storage.foldername(name))[1]::uuid)
    );

-- Only group owners or admins can update group covers
DROP POLICY IF EXISTS "Group admins update group cover" ON storage.objects;
CREATE POLICY "Group admins update group cover"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'group_covers'
        AND public.is_group_admin((storage.foldername(name))[1]::uuid)
    )
    WITH CHECK (
        bucket_id = 'group_covers'
        AND public.is_group_admin((storage.foldername(name))[1]::uuid)
    );

-- Only group owners or admins can delete group covers
DROP POLICY IF EXISTS "Group admins delete group cover" ON storage.objects;
CREATE POLICY "Group admins delete group cover"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'group_covers'
        AND public.is_group_admin((storage.foldername(name))[1]::uuid)
    );
