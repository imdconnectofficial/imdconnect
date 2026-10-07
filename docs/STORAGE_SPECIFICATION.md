# ImdConnect — Supabase Storage Architecture & Identity Media Specification

**System:** ImdConnect  
**Storage Engine:** Supabase Storage (S3-compatible) + PostgreSQL RLS  
**Migration File:** [`supabase/migrations/20261007220000_supabase_storage_identity_media.sql`](file:///c:/xampp/htdocs/ImdConnect/supabase/migrations/20261007220000_supabase_storage_identity_media.sql)  
**Service Implementation:** [`src/services/storage.service.js`](file:///c:/xampp/htdocs/ImdConnect/src/services/storage.service.js)  
**Permanent Governance Reference:** [AGENTS.md](file:///c:/xampp/htdocs/ImdConnect/AGENTS.md) Rules 1, 2, and 3  

---

## 1. Architectural Scope & Invariant Principles

1. **Text-Only Messaging Mandate (Rule 1 & Rule 2):**  
   ImdConnect is strictly a text-only communication platform. **No storage bucket exists or will ever be created for chat attachments.** No image, video, audio, voice message, or document transfer capability is permitted within conversations.
2. **Restricted Identity Media Scope (Rule 3):**  
   Storage is strictly scoped to three isolated identity media buckets:
   - User profile avatars (`avatars`)
   - User cover banners (`covers`)
   - Group identity avatars & banners (`group_covers`)
3. **Multi-Layer Defense Against Executable / Malicious Uploads:**
   - Database-level MIME type whitelist (`image/jpeg`, `image/png`, `image/webp` only).
   - Database-level file size limit enforcement (2MB for avatars, 4MB for covers).
   - Client-side deep Magic Bytes inspection (verifying true file headers).
   - Client-side HTML5 Canvas re-encoding to WebP, stripping all EXIF metadata and GPS coordinates.
   - Path-isolated Row Level Security on `storage.objects`.

---

## 2. Storage Buckets Catalog

| Bucket Name | Purpose | Public Read | Size Limit | Allowed MIME Types | Folder Path Isolation |
|:---|:---|:---:|:---:|:---|:---|
| **`avatars`** | User profile pictures | YES | **2 MB** | `image/jpeg`, `image/png`, `image/webp` | `{user_id}/{timestamp}_avatar.webp` |
| **`covers`** | User profile banner images | YES | **4 MB** | `image/jpeg`, `image/png`, `image/webp` | `{user_id}/{timestamp}_cover.webp` |
| **`group_covers`** | Group identity avatars and banners | YES | **4 MB** | `image/jpeg`, `image/png`, `image/webp` | `{group_id}/{timestamp}_group.webp` |

*Note: SVG (`image/svg+xml`) is explicitly excluded across all buckets to prevent XML/SVG-based Cross-Site Scripting (XSS) attacks.*

---

## 3. Storage Security & Row-Level Security (RLS)

Storage operations on `storage.objects` are governed by PostgreSQL Row Level Security:

### 3.1 `avatars` Bucket Policies
```sql
-- 1. Anyone can view public avatars
CREATE POLICY "Avatars are publicly readable"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'avatars');

-- 2. Authenticated user can only write into their own folder ({user_id}/*)
CREATE POLICY "Users upload own avatar"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 3. Users can only update/overwrite files inside their own folder
CREATE POLICY "Users update own avatar"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 4. Users can only delete files inside their own folder
CREATE POLICY "Users delete own avatar"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
```

### 3.2 `covers` Bucket Policies
Follows the exact same folder-level isolation: uploads are restricted to `covers/{user_id}/*`. Non-owners receive permission denied on any attempt to write or overwrite another user's files.

### 3.3 `group_covers` Bucket Policies
Uploads are restricted to `group_covers/{group_id}/*`.
- **Authorization Check:** Evaluates `public.is_group_admin((storage.foldername(name))[1]::uuid)`.
- **Access Rule:** Only the group owner or designated group admins can upload, replace, or delete group images. Ordinary members or non-members are rejected by RLS.

---

## 4. Deep Inspection & Sanitization Pipeline

```mermaid
flowchart TD
    File[User Selects File] --> SizeCheck[1. File Size Check: < 2MB or < 4MB]
    SizeCheck -- Exceeds Limit --> RejectSize[Reject: File size exceeds limit]
    SizeCheck -- OK --> MimeCheck[2. MIME Whitelist Check: jpeg/png/webp]
    MimeCheck -- Disallowed Type --> RejectMime[Reject: Invalid format]
    MimeCheck -- OK --> MagicCheck[3. Magic Bytes Inspection: Verify file header bytes]
    MagicCheck -- Invalid Header --> RejectMagic[Reject: Executable/Corrupted file detected]
    MagicCheck -- Valid Header --> CanvasProcess[4. Canvas Re-encoding: Scale max dimension & strip EXIF/GPS]
    CanvasProcess --> CleanBlob[5. Produce Clean, Optimized WebP Blob]
    CleanBlob --> Upload[6. Upload to Supabase Storage: {folder_id}/{timestamp}.webp]
    Upload --> UpdateDB[7. Persist publicUrl to profiles or groups table]
```

### 4.1 Magic Bytes Verification Signatures
- **JPEG:** First 3 bytes must match `FF D8 FF`.
- **PNG:** First 4 bytes must match `89 50 4E 47`.
- **WEBP:** Bytes 0-3 match `52 49 46 46` ('RIFF') and bytes 8-11 match `57 45 42 50` ('WEBP').

### 4.2 Privacy Sanitization (EXIF & GPS Stripping)
Before uploading, files are drawn to an off-screen HTML5 `<canvas>` element and exported as `image/webp`. This process:
1. Discards camera make/model, aperture, exposure, and device serial numbers.
2. Removes all embedded GPS latitude and longitude coordinates.
3. Renders embedded malicious scripts or polyglots completely inert.
4. Normalizes aspect ratio and reduces bandwidth usage.

---

## 5. Security & Verification Audit

- [x] Zero chat attachments bucket.
- [x] Chat messages remain strictly text-only.
- [x] File size limits enforced at database and client tiers (2MB / 4MB).
- [x] Allowed MIME types strictly limited to safe raster images (`image/jpeg`, `image/png`, `image/webp`).
- [x] SVGs, HTML, PHP, and executables completely prohibited.
- [x] Storage RLS enforces folder isolation (`{user_id}/*` and `{group_id}/*`).
- [x] Users cannot overwrite or modify other users' files.
- [x] Only group owners/admins can upload group images.
