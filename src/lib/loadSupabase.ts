// The Supabase client, for the modules every page loads (auth, the top bar). supabase-js is about a third of the
// app's own script and no page needs it to paint, so it is a separate chunk fetched on first use: a signed-out visitor
// on a prerendered page (the landing, sign-in, sign-up, the legal pages) sees the page before it arrives. Pages that
// are lazy chunks themselves import ./supabase directly. firstLoad.test.ts fails if a module on the first-load path
// imports the client statically.
type Client = (typeof import('./supabase'))['supabase'];

let pending: Promise<Client> | null = null;

export function loadSupabase(): Promise<Client> {
  pending ??= import('./supabase').then(
    (m) => m.supabase,
    (e: unknown) => {
      // a failed chunk fetch (offline, a deploy replaced the file) is retried on the next call
      pending = null;
      throw e;
    },
  );
  return pending;
}
