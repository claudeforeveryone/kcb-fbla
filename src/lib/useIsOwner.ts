// Is the signed-in user a platform owner? Asked of the server (public.is_platform_owner, keyed on auth uid in
// private.platform_owners). This only decides what to show: every owner RPC checks again on the server, so a
// tampered client gets 42501, not data. Fails closed: errors, a missing function or no session all mean "no".
import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { loadSupabase } from './loadSupabase';
import { ownerGate } from './owner';

export type OwnerState = 'loading' | 'owner' | 'denied';

const confirmed = new Set<string>();

export async function checkIsOwner(): Promise<boolean> {
  try {
    // loadSupabase: the top bar asks this on every page, and the first-load chunk stays without the client
    const supabase = await loadSupabase();
    return ownerGate(await supabase.rpc('is_platform_owner')) === 'owner';
  } catch {
    return false;
  }
}

export function useIsOwner(): OwnerState {
  const { user, loading } = useAuth();
  const uid = user?.id ?? null;
  const [state, setState] = useState<{ uid: string | null; value: OwnerState }>({ uid: null, value: 'loading' });

  useEffect(() => {
    if (loading || !uid) return;
    if (confirmed.has(uid)) {
      setState({ uid, value: 'owner' });
      return;
    }
    let live = true;
    void checkIsOwner().then((ok) => {
      if (ok) confirmed.add(uid);
      if (live) setState({ uid, value: ok ? 'owner' : 'denied' });
    });
    return () => {
      live = false;
    };
  }, [uid, loading]);

  if (loading) return 'loading';
  if (!uid) return 'denied';
  if (confirmed.has(uid)) return 'owner';
  return state.uid === uid ? state.value : 'loading';
}
