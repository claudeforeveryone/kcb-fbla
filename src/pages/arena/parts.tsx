// Shared Arena UI: player lines, duel cards, outcome badges, the players cache.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, RotateCcw, X } from 'lucide-react';
import { Avatar, Badge, Button, ButtonLink, EloBadge, cn, formatUntil } from '../../components/ui';
import { eventInfo, eventName, type ProfileCard } from '../../lib/types';
import {
  duelBucket,
  duelOutcome,
  duelSide,
  getPlayerCards,
  type DuelOutcome,
  type DuelRow,
} from '../../api/arena';

// ------------------------------------------------------------------------------------------------ players cache

/** Loads and caches profile cards by id; call `ensure(ids)` whenever new ids show up. */
export function usePlayers() {
  const [players, setPlayers] = useState<Record<string, ProfileCard>>({});
  const asked = useRef(new Set<string>());
  const ensure = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => id && !asked.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => asked.current.add(id));
    try {
      const cards = await getPlayerCards(missing);
      setPlayers((p) => {
        const next = { ...p };
        for (const c of cards) next[c.id] = c;
        return next;
      });
    } catch {
      missing.forEach((id) => asked.current.delete(id));
    }
  }, []);
  const put = useCallback((c: ProfileCard) => {
    asked.current.add(c.id);
    setPlayers((p) => ({ ...p, [c.id]: c }));
  }, []);
  return { players, ensure, put };
}

// ------------------------------------------------------------------------------------------------ labels

export function arenaEventName(e: string) {
  return e === 'mixed' ? 'Mixed events' : eventName(e);
}
export function arenaEventShort(e: string) {
  return e === 'mixed' ? 'MIXED' : (eventInfo(e)?.short ?? e);
}

export function clockLabel(sec: number) {
  return `${Math.round(sec / 60)} min`;
}

export function displayName(p?: ProfileCard | null) {
  return p?.display_name || (p ? `@${p.username}` : 'Player');
}

// ------------------------------------------------------------------------------------------------ small pieces

export function PlayerLine({
  player,
  size = 'md',
  sub,
  link = true,
  className,
}: {
  player?: ProfileCard | null;
  size?: 'sm' | 'md';
  sub?: ReactNode;
  link?: boolean;
  className?: string;
}) {
  if (!player)
    return (
      <div className={cn('flex min-w-0 items-center gap-3', className)}>
        <span className={cn('shrink-0 animate-pulse rounded-full bg-surface-3', size === 'sm' ? 'size-8' : 'size-10')} />
        <span className="h-3.5 w-28 animate-pulse rounded-[2px] bg-surface-3" />
      </div>
    );
  const name = (
    <span className="truncate font-display font-bold text-heading">{displayName(player)}</span>
  );
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar src={player.avatar_url} name={player.display_name || player.username} size={size === 'sm' ? 'sm' : 'md'} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {link ? (
            <Link to={`/u/${player.username}`} className="min-w-0 truncate hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <span className="truncate">@{player.username}</span>
          {sub}
        </div>
      </div>
    </div>
  );
}

export function OutcomeBadge({ outcome, className }: { outcome: DuelOutcome; className?: string }) {
  const map = {
    win: { tone: 'success' as const, label: 'Win' },
    loss: { tone: 'red' as const, label: 'Loss' },
    draw: { tone: 'neutral' as const, label: 'Draw' },
  }[outcome];
  return (
    <Badge tone={map.tone} solid className={cn('min-w-12 justify-center', className)}>
      {map.label}
    </Badge>
  );
}

export function EventChip({ event }: { event: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-[2px] bg-surface-2 px-2 text-[11px] font-bold uppercase tracking-wide text-muted ring-1 ring-inset ring-line">
      {arenaEventShort(event)}
    </span>
  );
}

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '';
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ------------------------------------------------------------------------------------------------ duel card

export type DuelCardActions = {
  onAccept?: (d: DuelRow) => Promise<void> | void;
  onDecline?: (d: DuelRow) => Promise<void> | void;
  onCancel?: (d: DuelRow) => Promise<void> | void;
  onRematch?: (d: DuelRow) => void;
};

/** One duel in the lobby, from the viewer's side, with the right next action. */
export function DuelCard({
  duel,
  uid,
  players,
  actions,
  fresh,
  now,
}: {
  duel: DuelRow;
  uid: string;
  players: Record<string, ProfileCard>;
  actions: DuelCardActions;
  /** Animate in and highlight (a realtime arrival). */
  fresh?: boolean;
  now: number;
}) {
  const side = duelSide(duel, uid);
  const opp = players[side.opponentId];
  const bucket = duelBucket(duel, uid);
  const [busy, setBusy] = useState<null | 'accept' | 'decline' | 'cancel'>(null);
  const run = async (k: 'accept' | 'decline' | 'cancel', fn?: (d: DuelRow) => Promise<void> | void) => {
    if (!fn) return;
    setBusy(k);
    try {
      await fn(duel);
    } finally {
      setBusy(null);
    }
  };

  const meta = (
    <div className="flex flex-wrap items-center gap-1.5">
      <EventChip event={duel.event} />
      <span className="inline-flex h-6 items-center px-1.5 text-[11px] font-semibold text-muted">
        {clockLabel(duel.time_limit_sec)}
      </span>
    </div>
  );

  let status: ReactNode = null;
  let action: ReactNode = null;
  let accent = 'border-line';

  if (bucket === 'incoming') {
    accent = 'border-line border-l-4 border-l-red';
    status = (
      <span className="text-xs font-semibold text-red dark:text-danger">
        Challenged you · expires in {formatUntil(duel.expires_at, now)}
      </span>
    );
    action = (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run('decline', actions.onDecline)}
          loading={busy === 'decline'}
          disabled={!!busy}
          leftIcon={<X className="size-4" />}
        >
          Decline
        </Button>
        <Button
          size="sm"
          variant="accent"
          onClick={() => run('accept', actions.onAccept)}
          loading={busy === 'accept'}
          disabled={!!busy}
          leftIcon={<Check className="size-4" />}
        >
          Accept
        </Button>
      </div>
    );
  } else if (bucket === 'outgoing') {
    status = (
      <span className="text-xs text-muted">
        Waiting for a reply · {formatUntil(duel.expires_at, now)} left
      </span>
    );
    action = (
      <Button size="sm" variant="ghost" onClick={() => run('cancel', actions.onCancel)} loading={busy === 'cancel'}>
        Cancel
      </Button>
    );
  } else if (bucket === 'your-move') {
    accent = 'border-line border-l-4 border-l-blue';
    status = (
      <span className="text-xs font-semibold text-blue dark:text-link">
        {side.theyPlayed ? 'They have played. Your move.' : 'Accepted. Your move.'} · {formatUntil(duel.expires_at, now)} left
      </span>
    );
    action = (
      <ButtonLink to={`/arena/${duel.id}`} size="sm" variant="primary">
        Play
      </ButtonLink>
    );
  } else if (bucket === 'their-move') {
    status = (
      <span className="text-xs text-muted">
        You scored <b className="tabular text-heading">{side.myScore}/10</b> · waiting on them ({formatUntil(duel.expires_at, now)} left)
      </span>
    );
    action = (
      <ButtonLink to={`/arena/${duel.id}`} size="sm" variant="outline">
        View
      </ButtonLink>
    );
  } else {
    const o = duelOutcome(duel, uid);
    const label =
      duel.status === 'declined'
        ? 'Declined'
        : duel.status === 'cancelled'
          ? 'Cancelled'
          : duel.status === 'expired'
            ? 'Expired'
            : null;
    status = (
      <span className="flex items-center gap-2 text-xs text-muted">
        {o ? (
          <>
            <OutcomeBadge outcome={o} />
            <span className="tabular font-display text-sm font-extrabold text-heading">
              {side.myScore ?? '-'}
              <span className="px-1 text-muted">-</span>
              {side.theirScore ?? '-'}
            </span>
            {duel.forfeit_by && <span>forfeit</span>}
          </>
        ) : (
          <Badge>{label}</Badge>
        )}
        <span>{timeAgo(duel.completed_at ?? duel.created_at, now)}</span>
      </span>
    );
    action = (
      <div className="flex gap-1.5">
        {actions.onRematch && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.onRematch?.(duel)}
            leftIcon={<RotateCcw className="size-3.5" />}
            aria-label={`Rematch ${displayName(opp)}`}
          >
            <span className="max-sm:sr-only">Rematch</span>
          </Button>
        )}
        {o && (
          <ButtonLink to={`/arena/${duel.id}`} size="sm" variant="outline">
            Results
          </ButtonLink>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-[2px] border bg-surface p-4 transition-colors duration-200 hover:border-navy/40',
        accent,
        fresh && 'animate-pop',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <PlayerLine player={opp} sub={opp && <EloBadge elo={opp.elo} size="sm" className="h-5" />} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {meta}
          {action}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        {status}
        {duel.message && bucket !== 'done' && (
          <span className="min-w-0 truncate text-xs italic text-muted">"{duel.message}"</span>
        )}
      </div>
    </div>
  );
}

/** Versus banner used on the duel page (navy band). */
export function VersusBanner({
  left,
  right,
  leftScore,
  rightScore,
  leftMs,
  rightMs,
  winnerId,
  center,
}: {
  left?: ProfileCard | null;
  right?: ProfileCard | null;
  leftScore?: number | null;
  rightScore?: number | null;
  leftMs?: string;
  rightMs?: string;
  winnerId?: string | null;
  center?: ReactNode;
}) {
  const side = (p: ProfileCard | null | undefined, score: number | null | undefined, ms: string | undefined, align: 'l' | 'r') => {
    const won = !!p && winnerId === p.id;
    return (
      <div className={cn('flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:gap-3')}>
        <div className="relative">
          <Avatar src={p?.avatar_url} name={p?.display_name || p?.username} size="xl" ring className="max-sm:size-14 max-sm:text-lg" />
          {won && (
            <span className="exam-pop absolute -top-3 left-1/2 -translate-x-1/2 rounded-[2px] bg-red px-1.5 py-0.5 font-display text-[10px] font-black uppercase tracking-widest text-white">
              Winner
            </span>
          )}
        </div>
        <div className="min-w-0 max-w-full">
          <div className="truncate font-display text-base font-extrabold text-white sm:text-lg">{p ? displayName(p) : '...'}</div>
          {p && <div className="truncate text-xs text-white/65">@{p.username}</div>}
        </div>
        {p && <EloBadge elo={p.elo} size="sm" onDark />}
        {score !== undefined && (
          <div className={cn('flex flex-col items-center', align === 'l' ? 'sm:items-center' : 'sm:items-center')}>
            <span
              className={cn(
                'tabular min-w-[4.5rem] border-b-4 px-3 py-2 text-center font-display text-5xl font-black leading-none sm:min-w-24 sm:text-6xl',
                won ? 'border-red bg-surface text-red' : 'border-line bg-surface text-white',
                score == null && 'text-white/35',
              )}
            >
              {score ?? '?'}
            </span>
            {ms && <span className="tabular mt-1 text-xs font-semibold text-white/65">{ms}</span>}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="flex items-start gap-2 sm:gap-6">
      {side(left, leftScore, leftMs, 'l')}
      <div className="flex shrink-0 flex-col items-center justify-center gap-2 self-center pt-2">
        <span className="grid h-10 w-12 place-items-center rounded-none bg-red font-display text-base font-black tracking-wider text-white sm:h-12 sm:w-16 sm:text-xl">
          VS
        </span>

        {center}
      </div>
      {side(right, rightScore, rightMs, 'r')}
    </div>
  );
}
