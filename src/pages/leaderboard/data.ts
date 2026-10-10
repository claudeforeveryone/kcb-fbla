// Data hooks for the leaderboard: paged player and chapter rankings, plus "where am I" lookups.
import { useCallback, useEffect, useRef, useState } from 'react';
import { chapterLeaderboard, playerLeaderboard } from '../../api/core';
import { supabase } from '../../lib/supabase';
import type { ChapterLeaderboardRow, PlayerLeaderboardRow } from '../../lib/types';

export const PAGE_SIZE = 50;
/** Search and "jump to me" load at most this many rows (the RPC caps a page at 200). */
export const SCAN_CAP = 1000;
const SCAN_PAGE = 200;

type Paged<T> = {
  rows: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  done: boolean;
};

const initial = <T,>(): Paged<T> => ({ rows: [], total: 0, loading: true, loadingMore: false, error: null, done: false });

/**
 * Generic paged list. `fetchPage` must be stable for a given `key`; changing `key` resets the list.
 * `loadMore` fetches the next page, `loadUntil` keeps paging (in bigger pages) until a predicate holds or the cap.
 */
function usePaged<T>(key: string, fetchPage: (offset: number, limit: number) => Promise<T[]>, idOf: (row: T) => string, totalOf: (row: T) => number) {
  const [state, setState] = useState<Paged<T>>(initial);
  const token = useRef(0);
  const stateRef = useRef(state);

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const busy = useRef<Promise<void> | null>(null);

  const merge = (prev: T[], next: T[]) => {
    const seen = new Set(prev.map(idOf));
    return prev.concat(next.filter((r) => !seen.has(idOf(r))));
  };

  const load = useCallback(() => {
    const t = ++token.current;
    busy.current = null;
    const put = (s: Paged<T>) => {
      stateRef.current = s;
      setState(s);
    };
    put(initial());
    fetchRef
      .current(0, PAGE_SIZE)
      .then((rows) => {
        if (t !== token.current) return;
        put({
          rows,
          total: rows[0] ? totalOf(rows[0]) : 0,
          loading: false,
          loadingMore: false,
          error: null,
          done: rows.length < PAGE_SIZE,
        });
      })
      .catch((error) => {
        if (t !== token.current) return;
        put({ ...initial<T>(), loading: false, error });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [key, load]);

  const fetchMore = useCallback(async (limit: number) => {
    const s = stateRef.current;
    if (s.loading || s.done || s.error) return;
    const t = token.current;
    stateRef.current = { ...s, loadingMore: true };
    setState(stateRef.current);
    try {
      const rows = await fetchRef.current(stateRef.current.rows.length, limit);
      if (t !== token.current) return;
      // Update the ref synchronously so loadUntil sees the new rows before React re-renders.
      const cur = stateRef.current;
      const merged = merge(cur.rows, rows);
      const total = rows[0] ? totalOf(rows[0]) : cur.total;
      const next = { ...cur, rows: merged, total, loadingMore: false, done: rows.length < limit || merged.length >= total };
      stateRef.current = next;
      setState(next);
    } catch (error) {
      if (t !== token.current) return;
      stateRef.current = { ...stateRef.current, loadingMore: false };
      setState(stateRef.current);
      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(() => {
    if (busy.current) return busy.current;
    const p = fetchMore(PAGE_SIZE).finally(() => {
      busy.current = null;
    });
    busy.current = p;
    return p;
  }, [fetchMore]);

  /** Keep loading until `until(rows)` is true, everything is loaded, or SCAN_CAP rows are in. */
  const loadUntil = useCallback(
    async (until: (rows: T[]) => boolean) => {
      while (busy.current) await busy.current.catch(() => undefined);
      for (let guard = 0; guard < 20; guard++) {
        const s = stateRef.current;
        if (s.loading) {
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }
        if (s.error || s.done || until(s.rows) || s.rows.length >= SCAN_CAP) return;
        const p = fetchMore(SCAN_PAGE);
        busy.current = p.finally(() => {
          busy.current = null;
        });
        await busy.current;
      }
    },
    [fetchMore],
  );

  return { ...state, reload: load, loadMore, loadUntil };
}

export function usePlayerBoard(event: string | null, chapterId: string | null) {
  const fetchPage = useCallback(
    (offset: number, limit: number) => playerLeaderboard({ offset, limit, event, chapterId }),
    [event, chapterId],
  );
  return usePaged<PlayerLeaderboardRow>(
    `${event ?? ''}|${chapterId ?? ''}`,
    fetchPage,
    (r) => r.user_id,
    (r) => r.total_count,
  );
}

export function useChapterBoard() {
  const fetchPage = useCallback((offset: number, limit: number) => chapterLeaderboard({ offset, limit }), []);
  return usePaged<ChapterLeaderboardRow>('chapters', fetchPage, (r) => r.chapter_id, (r) => r.total_count);
}

export type MyStanding =
  | { status: 'loading' }
  | { status: 'ranked'; row: PlayerLeaderboardRow }
  | { status: 'unranked' }
  | { status: 'unknown' };

/**
 * The signed-in player's own row for a ranking, even when it is far below the loaded page.
 * Overall rankings (optionally per chapter) count the players ahead and fetch a small window around that rank;
 * per-event rankings scan pages (Elo per event is only computed by the RPC).
 */
export function useMyStanding(event: string | null, chapterId: string | null, me: { id: string } | null, refreshKey = 0) {
  const [standing, setStanding] = useState<MyStanding>({ status: 'loading' });

  useEffect(() => {
    if (!me) {
      setStanding({ status: 'unknown' });
      return;
    }
    let alive = true;
    setStanding({ status: 'loading' });

    const scan = async (): Promise<PlayerLeaderboardRow | null | 'capped'> => {
      for (let offset = 0; offset < SCAN_CAP; offset += SCAN_PAGE) {
        const rows = await playerLeaderboard({ offset, limit: SCAN_PAGE, event, chapterId });
        const mine = rows.find((r) => r.is_me);
        if (mine) return mine;
        if (rows.length < SCAN_PAGE) return null;
      }
      return 'capped';
    };

    const run = async () => {
      if (!event) {
        // Fresh numbers, not the possibly stale auth profile.
        const { data: p, error } = await supabase
          .from('fbla_profiles')
          .select('elo,questions_answered')
          .eq('id', me.id)
          .maybeSingle();
        if (error) throw error;
        if (p) {
          let q = supabase
            .from('fbla_profiles')
            .select('id', { count: 'exact', head: true })
            .or(`elo.gt.${p.elo},and(elo.eq.${p.elo},questions_answered.gt.${p.questions_answered})`);
          if (chapterId) q = q.eq('chapter_id', chapterId);
          const { count, error: e2 } = await q;
          if (e2) throw e2;
          const ahead = count ?? 0;
          const rows = await playerLeaderboard({ offset: Math.max(0, ahead - 2), limit: 25, event, chapterId });
          const mine = rows.find((r) => r.is_me);
          if (mine) return mine;
        }
      }
      return scan();
    };

    run()
      .then((r) => {
        if (!alive) return;
        if (r === 'capped') setStanding({ status: 'unknown' });
        else if (r) setStanding({ status: 'ranked', row: r });
        else setStanding({ status: 'unranked' });
      })
      .catch(() => alive && setStanding({ status: 'unknown' }));
    return () => {
      alive = false;
    };
  }, [event, chapterId, me?.id, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return standing;
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function normalize(s: string | null | undefined) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export const fmt = new Intl.NumberFormat('en-CA');
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "1st", "2nd", "23rd" */
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
