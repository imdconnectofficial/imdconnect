// ==============================================================================
// ImdConnect — Supabase Client Singleton
// ==============================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from '../config.js';

let supabaseClient = null;

export function getSupabase() {
    if (!supabaseClient) {
        supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storage: window.localStorage,
                flowType: 'pkce'
            }
        });
    }
    return supabaseClient;
}

export const supabase = getSupabase();
