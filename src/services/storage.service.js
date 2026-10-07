// ==============================================================================
// ImdConnect — Identity Media Storage Service
// ==============================================================================
import { supabase } from '../core/supabase.js';
import { authService } from './auth.service.js';

class StorageService {
    constructor() {
        this.ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
        this.LIMITS = {
            avatar: {
                maxSizeBytes: 2 * 1024 * 1024, // 2MB
                maxDimension: 1024,
                bucket: 'avatars'
            },
            cover: {
                maxSizeBytes: 4 * 1024 * 1024, // 4MB
                maxDimension: 2048,
                bucket: 'covers'
            },
            group: {
                maxSizeBytes: 4 * 1024 * 1024, // 4MB
                maxDimension: 1024,
                bucket: 'group_covers'
            }
        };
    }

    /**
     * Inspect file magic bytes to verify true raster image format
     * @param {File} file 
     * @returns {Promise<{ valid: boolean, detectedType?: string }>}
     */
    async verifyMagicBytes(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const arr = new Uint8Array(reader.result).subarray(0, 12);
                let header = '';
                for (let i = 0; i < arr.length; i++) {
                    header += arr[i].toString(16).padStart(2, '0').toUpperCase();
                }

                // Check JPEG (FF D8 FF)
                if (header.startsWith('FFD8FF')) {
                    resolve({ valid: true, detectedType: 'image/jpeg' });
                    return;
                }

                // Check PNG (89 50 4E 47)
                if (header.startsWith('89504E47')) {
                    resolve({ valid: true, detectedType: 'image/png' });
                    return;
                }

                // Check WEBP (52 49 46 46 .... 57 45 42 50)
                if (header.startsWith('52494646') && header.slice(16, 24) === '57454250') {
                    resolve({ valid: true, detectedType: 'image/webp' });
                    return;
                }

                // Invalid / executable / polyglot file
                resolve({ valid: false });
            };
            reader.onerror = () => resolve({ valid: false });
            reader.readAsArrayBuffer(file.slice(0, 12));
        });
    }

    /**
     * Decode image, validate dimensions, strip EXIF metadata, and re-encode to clean WebP
     * @param {File} file 
     * @param {number} maxDimension 
     * @returns {Promise<Blob>}
     */
    async sanitizeAndProcessImage(file, maxDimension) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let { width, height } = img;

                // Scale down if exceeds max allowed resolution
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                // Render into canvas to strip EXIF/GPS metadata and re-encode
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas image conversion failed.'));
                        }
                    },
                    'image/webp',
                    0.88 // 88% quality WebP
                );
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Invalid image file could not be decoded.'));
            };

            img.src = url;
        });
    }

    /**
     * Upload User Avatar (Profile Picture)
     * @param {File} file 
     * @returns {Promise<{ success: boolean, url?: string, error?: string }>}
     */
    async uploadAvatar(file) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'User must be authenticated.' };

        return this._processAndUpload({
            file,
            targetType: 'avatar',
            folderId: user.id,
            onSuccessDbUpdate: async (publicUrl) => {
                const { error } = await supabase
                    .from('profiles')
                    .update({ avatar_url: publicUrl })
                    .eq('id', user.id);
                if (error) throw error;
            }
        });
    }

    /**
     * Upload User Cover Image (Banner)
     * @param {File} file 
     * @returns {Promise<{ success: boolean, url?: string, error?: string }>}
     */
    async uploadCover(file) {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'User must be authenticated.' };

        return this._processAndUpload({
            file,
            targetType: 'cover',
            folderId: user.id,
            onSuccessDbUpdate: async (publicUrl) => {
                const { error } = await supabase
                    .from('profiles')
                    .update({ banner_url: publicUrl })
                    .eq('id', user.id);
                if (error) throw error;
            }
        });
    }

    /**
     * Upload Group Identity Image
     * @param {string} groupId - UUID
     * @param {File} file 
     * @param {'avatar'|'cover'} [aspect='avatar']
     * @returns {Promise<{ success: boolean, url?: string, error?: string }>}
     */
    async uploadGroupImage(groupId, file, aspect = 'avatar') {
        const user = await authService.getUser();
        if (!user) return { success: false, error: 'User must be authenticated.' };

        return this._processAndUpload({
            file,
            targetType: 'group',
            folderId: groupId,
            onSuccessDbUpdate: async (publicUrl) => {
                const updatePayload = aspect === 'cover' ? { cover_url: publicUrl } : { avatar_url: publicUrl };
                const { error } = await supabase
                    .from('groups')
                    .update(updatePayload)
                    .eq('conversation_id', groupId);
                if (error) throw error;
            }
        });
    }

    /**
     * Internal unified sanitization, validation, and upload handler
     */
    async _processAndUpload({ file, targetType, folderId, onSuccessDbUpdate }) {
        const config = this.LIMITS[targetType];

        // 1. Basic Size Pre-Check
        if (!file || file.size > config.maxSizeBytes) {
            const limitMb = Math.round(config.maxSizeBytes / (1024 * 1024));
            return { 
                success: false, 
                error: `File size exceeds the ${limitMb}MB limit for ${targetType} images.` 
            };
        }

        // 2. MIME Type Validation
        if (!this.ALLOWED_MIME_TYPES.includes(file.type)) {
            return { 
                success: false, 
                error: 'Invalid file format. Only JPEG, PNG, and WebP images are permitted.' 
            };
        }

        // 3. Deep Magic Bytes Inspection
        const magic = await this.verifyMagicBytes(file);
        if (!magic.valid) {
            return { 
                success: false, 
                error: 'Security rejection: File header does not match a valid raster image.' 
            };
        }

        // 4. Sanitize, Strip EXIF Metadata & Convert to WebP
        let cleanBlob;
        try {
            cleanBlob = await this.sanitizeAndProcessImage(file, config.maxDimension);
        } catch (procErr) {
            return { success: false, error: procErr.message || 'Image processing failed.' };
        }

        // 5. Generate Safe Storage Path: {folderId}/{timestamp}_{targetType}.webp
        const fileName = `${Date.now()}_${targetType}.webp`;
        const storagePath = `${folderId}/${fileName}`;

        // 6. Upload to Isolated Bucket via Supabase Storage
        try {
            const { data, error } = await supabase.storage
                .from(config.bucket)
                .upload(storagePath, cleanBlob, {
                    contentType: 'image/webp',
                    cacheControl: '3600',
                    upsert: true
                });

            if (error) {
                console.error('[StorageService] Upload error:', error);
                return { success: false, error: error.message || 'Storage upload rejected.' };
            }

            // 7. Retrieve Public Access URL
            const { data: { publicUrl } } = supabase.storage
                .from(config.bucket)
                .getPublicUrl(storagePath);

            // 8. Update Database Reference
            if (typeof onSuccessDbUpdate === 'function') {
                await onSuccessDbUpdate(publicUrl);
            }

            return {
                success: true,
                url: publicUrl,
                path: storagePath
            };
        } catch (err) {
            console.error('[StorageService] Exception:', err);
            return { success: false, error: 'Failed to persist uploaded image.' };
        }
    }
}

export const storageService = new StorageService();
