import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Avatar, Button, EloBadge, Input, Modal, SegmentedControl, Select, Spinner, cn, useToast } from '../../components/ui';
import { EVENTS, EVENT_GROUPS, type ProfileCard } from '../../lib/types';
import {
  DUEL_CLOCKS,
  challengePlayer,
  searchPlayers,
  type ArenaEvent,
  type DuelClock,
} from '../../api/arena';
import { displayName } from './parts';

export type ChallengeModalProps = {
  open: boolean;
  onClose: () => void;
  uid: string;
  /** Pre-selected opponent (from ?challenge=username, a friend row or a rematch). */
  opponent?: ProfileCard | null;
  event?: ArenaEvent | null;
  defaultEvent?: string | null;
  clock?: DuelClock;
  /** Quick picks shown before searching. */
  friends: ProfileCard[];
  recent: ProfileCard[];
  onSent: (duelId: string, opponent: ProfileCard) => void;
};

export function ChallengeModal({
  open,
  onClose,
  uid,
  opponent: initialOpponent,
  event: initialEvent,
  defaultEvent,
  clock: initialClock,
  friends,
  recent,
  onSent,
}: ChallengeModalProps) {
  const toast = useToast();
  const [opponent, setOpponent] = useState<ProfileCard | null>(initialOpponent ?? null);
  const [event, setEvent] = useState<ArenaEvent>('mixed');
  const [clock, setClock] = useState<DuelClock>(300);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // reset whenever the modal opens
  useEffect(() => {
    if (!open) return;
    setOpponent(initialOpponent ?? null);
    const ev = initialEvent ?? (defaultEvent && EVENTS.some((e) => e.slug === defaultEvent) ? defaultEvent : 'mixed');
    setEvent(ev as ArenaEvent);
    setClock(initialClock ?? 300);
    setMessage('');
    setQuery('');
    setResults([]);
  }, [open, initialOpponent, initialEvent, defaultEvent, initialClock]);

  // debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.replace(/^@/, '').length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const r = await searchPlayers(q, uid);
        if (alive) setResults(r);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query, uid]);

  const quick = useMemo(() => {
    const seen = new Set<string>();
    const out: { p: ProfileCard; tag: string }[] = [];
    for (const p of friends) if (!seen.has(p.id)) (seen.add(p.id), out.push({ p, tag: 'Friend' }));
    for (const p of recent) if (!seen.has(p.id)) (seen.add(p.id), out.push({ p, tag: 'Recent' }));
    return out.slice(0, 8);
  }, [friends, recent]);

  const eventOptions = useMemo(
    () => [
      { value: 'mixed', label: 'Mixed: all events' },
      ...EVENT_GROUPS.flatMap((g) =>
        EVENTS.filter((e) => e.group === g.id).map((e) => ({
          value: e.slug,
          label: `${e.name}${e.isNew ? ' (new)' : ''}`,
        })),
      ),
    ],
    [],
  );

  const send = async () => {
    if (!opponent) return;
    setSending(true);
    try {
      const id = await challengePlayer({ opponentId: opponent.id, event, timeLimitSec: clock, message });
      toast.success(`Challenge sent to ${displayName(opponent)}`, 'They have 24 hours to accept.');
      onSent(id, opponent);
      onClose();
    } catch (e) {
      toast.error('Challenge not sent', e instanceof Error ? e.message : undefined);
    } finally {
      setSending(false);
    }
  };

  const pickRow = (p: ProfileCard, tag?: string) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => setOpponent(p)}
        className="flex w-full items-center gap-3 rounded-[2px] px-2.5 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
      >
        <Avatar src={p.avatar_url} name={p.display_name || p.username} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-heading">{displayName(p)}</span>
          <span className="block truncate text-xs text-muted">@{p.username}</span>
        </span>
        {tag && <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tag}</span>}
        <EloBadge elo={p.elo} size="sm" />
      </button>
    </li>
  );

  return (
    <Modal
      open={open}
      onClose={sending ? () => {} : onClose}
      title="New challenge"
      description="10 questions, the same for both of you. Most correct wins; the faster time breaks a tie."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={send}
            loading={sending}
            disabled={!opponent}

          >
            Send challenge
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* opponent */}
        <section aria-labelledby="ch-opp">
          <h3 id="ch-opp" className="mb-2 text-sm font-semibold text-heading">
            Opponent
          </h3>
          {opponent ? (
            <div className="flex items-center gap-3 rounded-[2px] border border-line border-l-4 border-l-blue bg-surface-2 p-3">
              <Avatar src={opponent.avatar_url} name={opponent.display_name || opponent.username} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-display font-bold text-heading">{displayName(opponent)}</div>
                <div className="truncate text-xs text-muted">@{opponent.username}</div>
              </div>
              <EloBadge elo={opponent.elo} size="sm" />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Choose someone else"
                onClick={() => {
                  setOpponent(null);
                  window.setTimeout(() => searchRef.current?.focus(), 30);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <div>
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by username or name"
                leftIcon={<Search />}
                right={searching ? <Spinner className="mr-2 size-4 text-muted" /> : undefined}
                aria-label="Search players"
                autoComplete="off"
                data-autofocus
              />
              <div className="mt-2 max-h-64 overflow-y-auto">
                {query.trim().replace(/^@/, '').length >= 2 ? (
                  results.length > 0 ? (
                    <ul className="space-y-0.5">{results.map((p) => pickRow(p))}</ul>
                  ) : (
                    !searching && (
                      <p className="px-2.5 py-4 text-sm text-muted">
                        No players match "{query.trim()}".
                      </p>
                    )
                  )
                ) : quick.length > 0 ? (
                  <>
                    <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                      Quick picks
                    </div>
                    <ul className="space-y-0.5">{quick.map(({ p, tag }) => pickRow(p, tag))}</ul>
                  </>
                ) : (
                  <p className="px-2.5 py-3 text-sm text-muted">Type at least 2 letters to find anyone on FBLC.</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* event */}
        <section>
          <Select
            label="Event"
            value={event}
            onChange={(e) => setEvent(e.target.value as ArenaEvent)}
            options={eventOptions}
            hint={
              event === 'mixed' ? (
                '10 questions drawn from every event.'
              ) : (
                '10 random questions from this event.'
              )
            }
          />
        </section>

        {/* clock */}
        <section aria-labelledby="ch-clock">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 id="ch-clock" className="text-sm font-semibold text-heading">
              Clock
            </h3>
            <span className="text-xs text-muted">about {Math.round(clock / 10)}s a question</span>
          </div>
          <SegmentedControl
            block
            aria-label="Time limit"
            value={clock}
            onChange={(v) => setClock(v as DuelClock)}
            options={DUEL_CLOCKS.map((c) => ({
              value: c.sec,
              label: (
                <span className="flex flex-col items-center leading-tight">
                  <span className="font-bold">{c.label}</span>
                  <span className="text-[11px] font-medium opacity-70">{c.name}</span>
                </span>
              ),
            }))}
          />
        </section>

        <Input
          label="Message"
          corner={<span className={cn('tabular text-xs', message.length > 140 ? 'text-danger' : 'text-muted')}>{message.length}/140</span>}
          value={message}
          maxLength={140}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Optional: a little friendly trash talk"
        />

        {opponent && (
          <p className="rounded-[2px] border-l-2 border-red bg-surface-2 px-3 py-2.5 text-xs text-muted">
            {displayName
(opponent)} gets a notification and has 24 hours to accept. Once accepted, you each have 48
            hours to play.
          </p>
        )}
      </div>
    </Modal>
  );
}
