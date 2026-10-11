// The app's analytics tracker: src/lib/analytics.ts bound to the Supabase client. Fire and forget, never throws.
import { supabase } from '../lib/supabase';
import { makeTracker } from '../lib/analytics';

export const track = makeTracker({
  rpc: (fn, args) => supabase.rpc(fn, args),
  signedIn: async () => {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  },
});
