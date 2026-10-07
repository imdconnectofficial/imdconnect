// ==============================================================================
// ImdConnect — Application Configuration
// ==============================================================================

export const CONFIG = {
    // Supabase project endpoints (can be overridden via localStorage for local testing)
    SUPABASE_URL: window.__ENV__?.SUPABASE_URL || 
                  localStorage.getItem('imd_supabase_url') || 
                  'https://your-project.supabase.co',
                  
    SUPABASE_ANON_KEY: window.__ENV__?.SUPABASE_ANON_KEY || 
                       localStorage.getItem('imd_supabase_anon_key') || 
                       'your-anon-key-placeholder',

    // App identity
    APP_NAME: 'ImdConnect',
    APP_VERSION: '1.0.0',
    
    // Security & Compliance
    MIN_AGE_YEARS: 13,
    USERNAME_REGEX: /^[a-z0-9_]{3,30}$/,
    PASSWORD_MIN_LENGTH: 8,
    
    // Auth Rate Limiting & Cooldowns
    RESEND_COOLDOWN_SECONDS: 60,
    PASSWORD_RESET_COOLDOWN_SECONDS: 60,
    REGISTRATION_COOLDOWN_SECONDS: 5,
};
