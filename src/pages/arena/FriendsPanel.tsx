import { useEffect, useState } from 'react';
import { Check, Search, UserMinus, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EloBadge,
  EmptyState,
  Input,
  Spinner,
  useToast,
} from '../../components/ui';
import type { ProfileCard } from '../../lib/types';
import {
  duelRecord,
  removeFriend,
  respondFriendRequest,
  searchPlayers,
  sendFriendRequest,
  type DuelRow,
  type FriendLink,
} from '../../api/arena';
import { PlayerLine, displayName } from './parts';

export function FriendsPanel({
  uid,
  links,
  players,
  duels,
  onChallenge,
  onChanged,
}: {
  uid: string;
  links: FriendLink[];
  players: Record<string, ProfileCard>;
  duels: DuelRow[];
  onChallenge: (p: ProfileCard) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProfileCard | null>(null);

  const incoming = links.filter((l) => l.status === 'pending' && l.direction === 'in');
  const outgoing = links.filter((l) => l.status === 'pending' && l.direction === 'out');
  const friends = links
    .filter((l) => l.status === 'accepted')
    .sort((a, b) => (players[b.other]?.elo ?? 0) - (players[a.other]?.elo ?? 0));

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const linkFor = (id: string) => links.find((l) => l.other === id);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {incoming.length > 0 && (
          <Card padded={false} className="overflow-hidden border-l-4 border-l-red">
            <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-5 py-3">
              <h3 className="text-sm font-bold">Friend requests</h3>
              <Badge tone="red">{incoming.length}</Badge>
            </div>
            <ul className="divide-y divide-line">
              {incoming.map((l) => {
                const p = players[l.other];
                return (
                  <li key={l.other} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <PlayerLine player={p} className="flex-1" />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<X className="size-4" />}
                        loading={busy === `no-${l.other}`}
                        disabled={!!busy}
                        onClick={() => act(`no-${l.other}`, () => respondFriendRequest(l.other, false))}
                      >
                        Ignore
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon={<Check className="size-4" />}
                        loading={busy === `yes-${l.other}`}
                        disabled={!!busy}
                        onClick={() =>
                          act(`yes-${l.other}`, () => respondFriendRequest(l.other, true), `You and ${displayName(p)} are now friends`)
                        }
                      >
                        Accept
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold">Friends</h2>
              <p className="text-sm text-muted">Your head-to-head record against each friend.</p>
            </div>
            {friends.length > 0 && <span className="tabular text-sm font-semibold text-muted">{friends.length}</span>}
          </div>
          {friends.length === 0 ? (
            <EmptyState
              compact

              title="No friends yet"
              description="Add chapter-mates and rivals with the search on this page. Friends show up first when you start a challenge."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {friends.map((l) => {
                const p = players[l.other];
                const h2h = duelRecord(duels, uid, l.other);
                return (
                  <li key={l.other}>
                    <Card padded={false} className="flex h-full flex-col gap-3 p-4">
                      <div className="flex items-start gap-2">
                        <PlayerLine player={p} className="flex-1" />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${displayName(p)} from friends`}
                          onClick={() => p && setRemoving(p)}
                        >
                          <UserMinus className="size-4 text-muted" />
                        </Button>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <div className="text-xs text-muted">
                          {h2h.played > 0 ? (
                            <span className="tabular">
                              <b className="text-success">{h2h.wins}W</b> <b className="text-red dark:text-danger">{h2h.losses}L</b>{' '}
                              {h2h.draws > 0 && <b>{h2h.draws}D</b>} vs them
                            </span>
                          ) : (
                            'No duels yet'
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="accent"

                          disabled={!p}
                          onClick={() => p && onChallenge(p)}
                        >
                          Challenge
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <AddFriend
          uid={uid}
          statusOf={(id) => {
            const l = linkFor(id);
            return l ? (l.status === 'accepted' ? 'friends' : l.direction === 'out' ? 'sent' : 'incoming') : null;
          }}
          onAdd={(p) =>
            act(`add-${p.id}`, async () => {
              const s = await sendFriendRequest(p.id);
              toast.success(
                s === 'accepted' ? `You and ${displayName(p)} are now friends` : `Friend request sent to ${displayName(p)}`,
              );
            })
          }
          busyId={busy?.startsWith('add-') ? busy.slice(4) : null}
        />

        {outgoing.length > 0 && (
          <Card>
            <h3 className="mb-3 text-sm font-bold">Sent requests</h3>
            <ul className="space-y-3">
              {outgoing.map((l) => (
                <li key={l.other} className="flex items-center gap-2">
                  <PlayerLine player={players[l.other]} size="sm" className="flex-1" />
                  <Button
                    size="xs"
                    variant="ghost"
                    loading={busy === `cancel-${l.other}`}
                    onClick={() => act(`cancel-${l.other}`, () => removeFriend(l.other))}
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Remove ${displayName(removing)}?`}
        description="You can still challenge each other, and your duel history stays."
        confirmLabel="Remove friend"
        variant="danger"
        onConfirm={async () => {
          if (!removing) return;
          try {
            await removeFriend(removing.id);
            onChanged();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not remove friend.');
          }
        }}
      />
    </div>
  );
}

function AddFriend({
  uid,
  statusOf,
  onAdd,
  busyId,
}: {
  uid: string;
  statusOf: (id: string) => 'friends' | 'sent' | 'incoming' | null;
  onAdd: (p: ProfileCard) => void;
  busyId: string | null;
}) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ProfileCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.replace(/^@/, '').length < 2) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const r = await searchPlayers(term, uid, 6);
        if (alive) setRows(r);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, uid]);

  return (
    <Card>
      <h3 className="mb-1 text-sm font-bold">Add a friend</h3>
      <p className="mb-3 text-xs text-muted">Find anyone by username or name.</p>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="@username or name"
        leftIcon={<Search />}
        right={loading ? <Spinner className="mr-2 size-4 text-muted" /> : undefined}
        aria-label="Search players to add"
        autoComplete="off"
      />
      {q.trim().replace(/^@/, '').length >= 2 && !loading && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted">Nobody matches that yet.</p>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1">
          {rows.map((p) => {
            const st = statusOf(p.id);
            return (
              <li key={p.id} className="flex items-center gap-2.5 rounded-none px-1.5 py-1.5">
                <Avatar src={p.avatar_url} name={p.display_name || p.username} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-heading">{displayName(p)}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="truncate">@{p.username}</span>
                  </div>
                </div>
                <EloBadge elo={p.elo} size="sm"
 className="max-sm:hidden" />
                {st === 'friends' ? (
                  <Badge tone="success">Friends</Badge>
                ) : st === 'sent' ? (
                  <Badge>Sent</Badge>
                ) : (
                  <Button size="xs" variant={st === 'incoming' ? 'primary' : 'secondary'} loading={busyId === p.id} onClick={() => onAdd(p)}>
                    {st === 'incoming' ? 'Accept' : 'Add'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
