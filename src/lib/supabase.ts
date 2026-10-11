import { createClient } from '@supabase/supabase-js';

// The publishable key is safe to ship in the client; RLS protects the data.
export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://uhgzeuvybyohdbfuhfil.supabase.co';
export const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_KEY as string | undefined) || 'sb_publishable_F127HhwYm4XDMDLpmOtKIg_erImORLk';

/** localStorage key Supabase keeps the signed-in session under. */
export const AUTH_STORAGE_KEY = 'kcbfbla-auth-v2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

/** Absolute URL to an in-app path, respecting the deploy base path (for auth email redirects). */
export function appUrl(path = '') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/${path.replace(/^\//, '')}`;
}

/** Public URL for a file in the avatars bucket. */
export function avatarPublicUrl(path: string) {
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
