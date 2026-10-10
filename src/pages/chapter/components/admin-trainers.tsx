// Admin > Trainers: one or two trainers for each of the 15 events.
import { useMemo, useState } from 'react';
import { GraduationCap, Plus, Sparkles, X } from 'lucide-react';
import { Avatar, Badge, Card, EmptyState, Skeleton, Spinner, cn, errorMessage, useToast } from '../../../components/ui';
import { EVENT_GROUPS, EVENTS, type Trainer } from '../../../lib/types';
import { setEventTrainers, type RosterMember } from '../../../api/chapter';

export function TrainersPanel({
  chapterId,
  members,
  trainers,
  loading,
  onChanged,
}: {
  chapterId: string;
  members: RosterMember[] | undefined;
  trainers: Trainer[] | undefined;
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const byId = useMemo(() => new Map((members ?? []).map((m) => [m.user_id, m])), [members]);
  const byEvent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of trainers ?? []) m.set(t.event, [...(m.get(t.event) ?? []), t.user_id]);
    return m;
  }, [trainers]);
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trainers ?? []) m.set(t.user_id, (m.get(t.user_id) ?? 0) + 1);
    return m;
  }, [trainers]);

  const save = async (event: string, ids: string[], msg: string) => {
    setBusy(event);
    try {
      await setEventTrainers(chapterId, event, ids);
      toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error('Could not update trainers', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading && (!members || !trainers))
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full" rounded="rounded-[12px]" />
        ))}
      </div>
    );

  if (members && members.length < 2)
    return (
      <EmptyState
        icon={<GraduationCap />}
        title="Invite members first"
        description="Trainers are chapter members who lead prep for an event. Once people join, you can assign one or two per event here."
      />
    );

  const covered = EVENTS.filter((e) => byEvent.has(e.slug)).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-4 sm:flex-row sm:items-center">
        <Sparkles className="size-5 shrink-0 text-red" aria-hidden />
        <p className="flex-1 text-sm text-ink">
          Trainers can post, build tests and decks, and assign work for their events, and see members' stats. Assigning a
          member makes them a <strong>Trainer</strong>; removing their last event makes them a member again. Executives keep
          their role.
        </p>
        <Badge tone={covered === EVENTS.length ? 'success' : 'navy'} className="self-start sm:self-auto">
          {covered}/{EVENTS.length} covered
        </Badge>
      </div>

      {EVENT_GROUPS.map((g) => (
        <section key={g.id}>
          <h3 className="mb-1 text-lg font-bold">{g.label}</h3>
          <p className="mb-4 text-sm text-muted">{g.blurb}</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {EVENTS.filter((e) => e.group === g.id).map((e) => {
              const ids = byEvent.get(e.slug) ?? [];
              const full = ids.length >= 2;
              const candidates = (members ?? [])
                .filter((m) => !ids.includes(m.user_id))
                .sort(
                  (a, b) =>
                    Number(b.profile.main_event === e.slug) - Number(a.profile.main_event === e.slug) ||
                    a.profile.display_name.localeCompare(b.profile.display_name),
                );
              return (
                <Card key={e.slug} className={cn('flex flex-col', ids.length === 0 && 'border-dashed')}>
                  <div className="flex items-start gap-3">
                    <span className="rounded-md bg-navy px-2 py-1 font-display text-[0.6875rem] font-bold text-white dark:bg-surface-3">
                      {e.short}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-tight text-heading">{e.name}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {ids.length === 0 ? 'No trainer yet' : `${ids.length} of 2 trainers`}
                        {e.isNew && ' · New event'}
                      </div>
                    </div>
                    {busy === e.slug && <Spinner className="size-4 text-muted" />}
                  </div>
                  <ul className="mt-3 flex-1 space-y-2">
                    {ids.map((id) => {
                      const m = byId.get(id);
                      return (
                        <li key={id} className="flex items-center gap-2.5 rounded-lg bg-surface-2/70 px-2.5 py-2">
                          <Avatar src={m?.profile.avatar_url} name={m?.profile.display_name ?? '?'} size="xs" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{m?.profile.display_name ?? 'Former member'}</span>
                          <button
                            type="button"
                            disabled={busy != null}
                            onClick={() =>
                              void save(
                                e.slug,
                                ids.filter((x) => x !== id),
                                `${m?.profile.display_name ?? 'Trainer'} no longer trains ${e.name}`,
                              )
                            }
                            className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                            aria-label={`Remove ${m?.profile.display_name ?? 'trainer'} from ${e.name}`}
                          >
                            <X className="size-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {!full && (
                    <label className="relative mt-3 block">
                      <span className="sr-only">Add a trainer for {e.name}</span>
                      <Plus className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                      <select
                        value=""
                        disabled={busy != null}
                        onChange={(ev) => {
                          const id = ev.target.value;
                          if (!id) return;
                          const m = byId.get(id);
                          void save(e.slug, [...ids, id], `${m?.profile.display_name ?? 'Member'} now trains ${e.name}`);
                        }}
                        className="h-9 w-full appearance-none rounded-lg border border-dashed border-line-strong bg-surface pl-9 pr-3 text-sm text-muted outline-none transition hover:border-blue/50 focus:border-blue focus:ring-4 focus:ring-blue/15"
                      >
                        <option value="">Add trainer…</option>
                        {candidates.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.profile.display_name}
                            {m.profile.main_event === e.slug ? ' (main event)' : ''}
                            {load.get(m.user_id) ? ` · trains ${load.get(m.user_id)}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
