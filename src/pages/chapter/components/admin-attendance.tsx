// Admin > Attendance: meetings, quick marking, per-member rates and history.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  ProgressBar,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  cn,
  errorMessage,
  useToast,
} from '../../../components/ui';
import type { Attendance, AttendanceSession, AttendanceStatus } from '../../../lib/types';
import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  attendanceRate,
  createSession,
  deleteSession,
  listAttendance,
  listSessions,
  markAttendance,
  markAttendanceMany,
  todayIso,
  updateSession,
  type RosterMember,
} from '../../../api/chapter';
import { pct, useLoad } from './admin-shared';

const STATUS_STYLE: Record<AttendanceStatus, { on: string; dot: string; key: string }> = {
  present: { on: 'bg-success text-white ring-success', dot: 'bg-success', key: 'P' },
  late: { on: 'bg-warning text-white ring-warning', dot: 'bg-warning', key: 'L' },
  absent: { on: 'bg-red text-white ring-red', dot: 'bg-red', key: 'A' },
  excused: { on: 'bg-blue text-white ring-blue', dot: 'bg-blue', key: 'E' },
};

const fmtDate = (d: string, long = false) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, long ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });

export function AttendancePanel({ chapterId, members }: { chapterId: string; members: RosterMember[] | undefined }) {
  const toast = useToast();
  const sessions = useLoad(() => listSessions(chapterId), [chapterId]);
  const [marks, setMarks] = useState<Map<string, AttendanceStatus>>(new Map());
  const [marksLoading, setMarksLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIso());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AttendanceSession | null>(null);
  const [deleting, setDeleting] = useState<AttendanceSession | null>(null);

  const key = (s: string, u: string) => `${s}|${u}`;

  // load all marks once sessions are known
  const sessionIds = useMemo(() => (sessions.data ?? []).map((s) => s.id).join(','), [sessions.data]);
  useEffect(() => {
    if (!sessions.data) return;
    let live = true;
    setMarksLoading(true);
    listAttendance(sessions.data.map((s) => s.id))
      .then((rows: Attendance[]) => {
        if (!live) return;
        setMarks(new Map(rows.map((r) => [key(r.session_id, r.user_id), r.status])));
      })
      .catch((e) => live && toast.error('Could not load attendance', errorMessage(e)))
      .finally(() => live && setMarksLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds]);

  useEffect(() => {
    if (sessions.data && (!selected || !sessions.data.some((s) => s.id === selected))) setSelected(sessions.data[0]?.id ?? null);
  }, [sessions.data, selected]);

  const roster = useMemo(
    () => [...(members ?? [])].sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name)),
    [members],
  );
  const session = sessions.data?.find((s) => s.id === selected) ?? null;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const s = await createSession(chapterId, title || 'Chapter meeting', date);
      sessions.setData((prev) => [s, ...(prev ?? [])].sort((a, b) => b.held_on.localeCompare(a.held_on) || b.created_at.localeCompare(a.created_at)));
      setSelected(s.id);
      setTitle('');
      toast.success('Meeting added', 'Tap a status next to each member to take attendance.');
    } catch (err) {
      toast.error('Could not add the meeting', errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const set = async (sessionId: string, userId: string, status: AttendanceStatus | null) => {
    const k = key(sessionId, userId);
    const prev = marks.get(k) ?? null;
    setMarks((m) => {
      const n = new Map(m);
      if (status) n.set(k, status);
      else n.delete(k);
      return n;
    });
    try {
      await markAttendance(sessionId, userId, status);
    } catch (e) {
      setMarks((m) => {
        const n = new Map(m);
        if (prev) n.set(k, prev);
        else n.delete(k);
        return n;
      });
      toast.error('Could not save', errorMessage(e));
    }
  };

  const markRest = async (status: AttendanceStatus) => {
    if (!session) return;
    const ids = roster.filter((m) => !marks.has(key(session.id, m.user_id))).map((m) => m.user_id);
    if (!ids.length) return;
    setMarks((m) => {
      const n = new Map(m);
      for (const id of ids) n.set(key(session.id, id), status);
      return n;
    });
    try {
      await markAttendanceMany(session.id, ids, status);
      toast.success(`Marked ${ids.length} ${ids.length === 1 ? 'member' : 'members'} ${ATTENDANCE_LABELS[status].toLowerCase()}`);
    } catch (e) {
      setMarks((m) => {
        const n = new Map(m);
        for (const id of ids) n.delete(key(session.id, id));
        return n;
      });
      toast.error('Could not save', errorMessage(e));
    }
  };

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus | 'unmarked', number> = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
    if (!session) return c;
    for (const m of roster) {
      const s = marks.get(key(session.id, m.user_id));
      c[s ?? 'unmarked']++;
    }
    return c;
  }, [session, roster, marks]);

  const perMember = useMemo(() => {
    const list = sessions.data ?? [];
    return roster
      .map((m) => {
        const statuses = list.map((s) => marks.get(key(s.id, m.user_id)) ?? null);
        return { m, statuses, ...attendanceRate(statuses) };
      })
      .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || a.m.profile.display_name.localeCompare(b.m.profile.display_name));
  }, [roster, sessions.data, marks]);

  if (sessions.error) return <ErrorState error={sessions.error} onRetry={() => void sessions.reload()} />;

  return (
    <div className="space-y-6">
      <Card as="section">
        <form onSubmit={create} className="flex flex-col gap-3 md:flex-row md:items-end">
          <Input
            className="flex-1"
            label="New meeting"
            placeholder="Chapter meeting"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input className="md:w-48" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Button type="submit" loading={creating}>
            Add meeting
          </Button>
        </form>
      </Card>

      {sessions.loading && !sessions.data ? (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-72 w-full" rounded="rounded-none" />
          <Skeleton className="h-72 w-full" rounded="rounded-none" />
        </div>
      ) : !sessions.data?.length ? (
        <EmptyState
          title="No meetings yet"
          description="Add your first meeting above, then mark each member present, late, absent or excused. Rates update as you go."
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card as="section" padded={false} className="overflow-hidden" aria-label="Meetings">
              <div className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted">
                {sessions.data.length} {sessions.data.length === 1 ? 'meeting' : 'meetings'}
              </div>
              <ul className="max-h-[520px] overflow-y-auto max-lg:flex max-lg:max-h-none max-lg:overflow-x-auto">
                {sessions.data.map((s) => {
                  const marked = roster.filter((m) => marks.has(key(s.id, m.user_id))).length;
                  const active = s.id === selected;
                  return (
                    <li key={s.id} className="max-lg:shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelected(s.id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'flex w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors max-lg:min-w-[200px] max-lg:border-b-[3px] max-lg:border-l-0',
                          active ? 'border-red bg-surface-2' : 'border-transparent hover:bg-surface-2',
                        )}
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-none border border-line bg-surface text-center leading-none">
                          <span>
                            <span className="block text-[0.625rem] font-bold uppercase text-muted">
                              {new Date(`${s.held_on}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}
                            </span>
                            <span className="tabular block font-display text-base font-extrabold text-heading">
                              {new Date(`${s.held_on}T12:00:00`).getDate()}
                            </span>
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-heading">{s.title}</span>
                          <span className="block text-xs text-muted">
                            {marksLoading ? '…' : marked === roster.length ? 'All marked' : `${marked}/${roster.length} marked`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {session && (
              <Card as="section" padded={false} className="min-w-0 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-start sm:p-5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold">{session.title}</h3>
                    <p className="text-sm text-muted">{fmtDate(session.held_on, true)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label="Edit meeting" onClick={() => setEditing(session)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Delete meeting" onClick={() => setDeleting(session)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface-2 px-4 py-3 text-sm sm:px-5">
                  {ATTENDANCE_STATUSES.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <span className={cn('size-2.5 rounded-none', STATUS_STYLE[s].dot)} aria-hidden />
                      <span className="tabular font-semibold">{counts[s]}</span>
                      <span className="text-muted">{ATTENDANCE_LABELS[s]}</span>
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="tabular font-semibold text-ink">{counts.unmarked}</span> unmarked
                  </span>
                  {counts.unmarked > 0 && (
                    <span className="flex gap-2 sm:ml-auto">
                      <Button size="xs" variant="secondary" onClick={() => void markRest('present')}>
                        Rest present
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => void markRest('absent')}>
                        Rest absent
                      </Button>
                    </span>
                  )}
                </div>
                {roster.length === 0 ? (
                  <p className="p-5 text-sm text-muted">No members yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {roster.map((m) => {
                      const cur = marks.get(key(session.id, m.user_id)) ?? null;
                      return (
                        <li key={m.user_id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:px-5">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="sm" />
                            <span className="truncate text-sm font-semibold text-heading">{m.profile.display_name}</span>
                          </div>
                          <div role="radiogroup" aria-label={`Attendance for ${m.profile.display_name}`} className="grid grid-cols-4 gap-1.5 sm:flex">
                            {ATTENDANCE_STATUSES.map((s) => {
                              const on = cur === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  title={on ? `${ATTENDANCE_LABELS[s]} (click to clear)` : ATTENDANCE_LABELS[s]}
                                  onClick={() => void set(session.id, m.user_id, on ? null : s)}
                                  className={cn(
                                    'inline-flex h-8 items-center justify-center rounded-none px-2.5 text-xs font-semibold ring-1 ring-inset transition-colors',
                                    on ? STATUS_STYLE[s].on : 'bg-surface text-muted ring-line hover:bg-surface-2 hover:text-ink',
                                  )}
                                >

                                  {ATTENDANCE_LABELS[s]}
                                </button>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}
          </div>

          <Card as="section" padded={false} className="overflow-hidden">
            <div className="p-4 sm:p-5">
              <CardHeader
                className="mb-0"
                title="Attendance by member"
                subtitle="Present and late count as attended. Excused meetings don't count against anyone. Lowest first."
              />
            </div>
            <Table>
              <THead>
                <tr>
                  <TH>Member</TH>
                  <TH className="w-[38%]">Rate</TH>
                  <TH align="right" className="max-sm:hidden">Attended</TH>
                  <TH className="max-md:hidden">Recent</TH>
                </tr>
              </THead>
              <TBody>
                {perMember.map(({ m, statuses, rate, attended, counted }) => (
                  <TR key={m.user_id}>
                    <TD>
                      <Link to={`/chapter/member/${m.user_id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                        <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="xs" />
                        <span className="truncate text-sm font-semibold">{m.profile.display_name}</span>
                      </Link>
                    </TD>
                    <TD>
                      {rate == null ? (
                        <span className="text-sm text-muted">No marks yet</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <ProgressBar
                            value={rate * 100}
                            size="sm"
                            tone={rate >= 0.8 ? 'success' : rate >= 0.6 ? 'warning' : 'red'}
                            className="flex-1"
                          />
                          <span className="tabular w-11 text-right text-sm font-semibold">{pct(rate)}</span>
                        </div>
                      )}
                    </TD>
                    <TD align="right" className="tabular max-sm:hidden text-sm text-muted">
                      {attended}/{counted}
                    </TD>
                    <TD className="max-md:hidden">
                      <span className="flex gap-1" aria-label="Most recent meetings, newest first">
                        {statuses.slice(0, 8).map((s, i) => (
                          <span
                            key={i}
                            title={s ? ATTENDANCE_LABELS[s] : 'Not marked'}
                            className={cn('size-2.5 rounded-none', s ? STATUS_STYLE[s].dot : 'bg-line-strong')}
                          />
                        ))}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}

      <EditSessionModal
        session={editing}
        onClose={() => setEditing(null)}
        onSaved={(s) => sessions.setData((prev) => prev?.map((x) => (x.id === s.id ? s : x)).sort((a, b) => b.held_on.localeCompare(a.held_on)))}
      />
      <ConfirmDialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        variant="danger"
        title={`Delete "${deleting?.title ?? ''}"?`}
        description="Its attendance marks are deleted too, and everyone's rates are recalculated."
        confirmLabel="Delete meeting"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteSession(deleting.id);
            sessions.setData((prev) => prev?.filter((s) => s.id !== deleting.id));
            toast.success('Meeting deleted');
          } catch (e) {
            toast.error('Could not delete', errorMessage(e));
            throw e;
          }
        }}
      />
    </div>
  );
}

function EditSessionModal({
  session,
  onClose,
  onSaved,
}: {
  session: AttendanceSession | null;
  onClose: () => void;
  onSaved: (s: AttendanceSession) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (session) {
      setTitle(session.title);
      setDate(session.held_on);
    }
  }, [session]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    try {
      await updateSession(session.id, { title, held_on: date });
      onSaved({ ...session, title: title.trim(), held_on: date });
      toast.success('Meeting updated');
      onClose();
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={session != null}
      onClose={onClose}
      title="Edit meeting"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-session" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-session" onSubmit={save} className="grid gap-4">
        <Input label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} required />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </form>
    </Modal>
  );
}
