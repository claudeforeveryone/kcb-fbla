import { createClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY } from './sessionHint';

// The publishable key is safe to ship in the client; RLS protects the data.
export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://uhgzeuvybyohdbfuhfil.supabase.co';
export const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_KEY as string | undefined) || 'sb_publishable_F127HhwYm4XDMDLpmOtKIg_erImORLk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

// appUrl lives in its own module so the first-load path can use it without this client (loadSupabase.ts).
export { appUrl } from './appUrl';

/** Public URL for a file in the avatars bucket. */
export function avatarPublicUrl(path: string) {
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
