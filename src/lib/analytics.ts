// Product analytics, client side (public.fbla_track, supabase/migrations/0101). Privacy rules:
//   * Only a fixed event name, an FBLA event slug and a tiny enum-only metadata object. Never question text,
//     answers, free text, IP, user agent or location. The database refuses anything else; this file drops it first.
//   * Fire and forget: tracking can never break a page. Every failure is swallowed.
//   * Signed-out visitors are not tracked at all.
// Events the database already knows about (attempts, duels, vocab reviews, onboarding, feedback) are recorded by
// server triggers, so the client only reports what only the browser can see.

export type ClientEvent =
  | 'event_selected'
  | 'practice_started'
  | 'resource_opened'
  | 'install_prompt_shown'
  | 'app_installed'
  | 'push_enabled';

type MetaKey = 'mode' | 'source' | 'outcome' | 'step' | 'kind' | 'count';
export type TrackMeta = Partial<Record<MetaKey, string | number>>;

export type TrackRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;

export type TrackerDeps = {
  rpc: TrackRpc;
  signedIn: () => boolean | PromiseLike<boolean>;
  now?: () => number;
};

const META_KEYS = new Set<string>(['mode', 'source', 'outcome', 'step', 'kind', 'count']);
const TOKEN = /^[a-z0-9_:-]{1,32}$/;
const CODE = /^[a-z0-9_-]{1,40}$/;
const REPEAT_WINDOW_MS = 30 * 60 * 1000;

/** Keeps only what fbla_private.fbla_meta_ok accepts: listed keys, short lowercase tokens or whole numbers 0-100000. */
function cleanMeta(meta: TrackMeta | undefined): TrackMeta {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(meta ?? {})) {
    if (!META_KEYS.has(key)) continue;
    if (typeof value === 'string' && TOKEN.test(value)) out[key] = value;
    else if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100000) out[key] = value;
  }
  return out as TrackMeta;
}

/** Builds a track() bound to a Supabase-style rpc. The returned promise always resolves; callers need not await it. */
export function makeTracker({ rpc, signedIn, now = Date.now }: TrackerDeps) {
  const lastSeen = new Map<string, number>();

  return async function track(name: ClientEvent, code?: string | null, meta?: TrackMeta): Promise<void> {
    try {
      const eventCode = code && CODE.test(code) ? code : null;
      if (name === 'event_selected') {
        const key = eventCode ?? '';
        const t = now();
        const prev = lastSeen.get(key);
        if (prev !== undefined && t - prev < REPEAT_WINDOW_MS) return;
        if (!(await signedIn())) return;
        lastSeen.set(key, t);
      } else if (!(await signedIn())) {
        return;
      }
      await rpc('fbla_track', { p_name: name, p_event_code: eventCode, p_meta: cleanMeta(meta) });
    } catch {
      // Analytics must never break the page.
    }
  };
}
