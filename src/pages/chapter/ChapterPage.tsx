import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronRight, MoreHorizontal } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  Dropdown,
  EloBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonCards,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  cn,
  errorMessage,
  useToast,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { useAuth } from '../../lib/auth';
import { EVENTS, eventName, isAdminRole, type ChapterLeaderboardRow, type ChapterRole, type PlayerLeaderboardRow } from '../../lib/types';
import { chapterLeaderboard, playerLeaderboard } from '../../api/core';
import {
  ATTENDANCE_LABELS,
  attendanceRate,
  getMyChapter,
  leaveChapter,
  listMembers,
  listTrainers,
  memberAttendance,
  type MyChapter,
  type RosterMember,
} from '../../api/chapter';
import { JoinByCode } from './components/admin-join';
import { InviteCard, RoleBadge, ROLE_ORDER, fmt, pct, useLoad } from './components/admin-shared';
import { pluralize } from './components/classroom-shared';

export default function ChapterPage() {
  const mine = useLoad(() => getMyChapter(), []);

  if (mine.loading && !mine.data)
    return (
      <>
        <PageHeader eyebrow="Chapter" title={<Skeleton className="h-10 w-64 bg-white/15" />} />
        <Page>
          <SkeletonCards count={3} />
        </Page>
      </>
    );
  if (mine.error)
    return (
      <>
        <PageHeader eyebrow="Chapter" title="Chapter" />
        <Page>
          <ErrorState error={mine.error} onRetry={() => void mine.reload()} />
        </Page>
      </>
    );
  if (!mine.data) return <NoChapter />;
  return <ChapterHome ctx={mine.data} onLeft={() => void mine.reload()} />;
}

// ------------------------------------------------------------------------------------------------ no chapter

function NoChapter() {
  return (
    <>
      <PageHeader
        eyebrow="Chapter"
        title="Find your team"
        subtitle="Join your school's FBLC chapter to compete on its leaderboard, get assignments from your trainers and see how you stack up."
        size="lg"
      />
      <Page>
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[12px] bg-blue p-5 text-white sm:p-6">
            <div className="mb-4">
              <h3 className="text-base font-bold leading-tight text-white">Join with a code</h3>
              <p className="mt-0.5 text-sm text-white/85">Got a link instead? Just open it and you'll land on the invite page.</p>
            </div>
            <JoinByCode autoFocus />
          </section>
          <Card as="section" className="flex flex-col p-5 sm:p-6">
            <CardHeader
              title="Starting a chapter?"
              subtitle="Register it in a minute. You'll be president and can invite members right away."
            />
            <ul className="flex-1 space-y-3 text-[0.9375rem]">
              {[
                'A chapter leaderboard where everyone starts at 0 Elo',
                'Trainers for each of the 15 events',
                'Attendance, roles, invites and bans in one dashboard',
                'See every member\'s weakest areas before competition',
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-[0.55em] size-1.5 shrink-0 bg-red" aria-hidden />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <ButtonLink to="/chapter/new" variant="primary" size="lg" className="mt-6">
              Register a chapter
            </ButtonLink>
          </Card>
        </div>
      </Page>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ chapter home

function ChapterHome({ ctx, onLeft }: { ctx: MyChapter; onLeft: () => void }) {
  const { chapter, membership } = ctx;
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const role = membership.role;
  const admin = isAdminRole(role);
  const staff = admin || role === 'trainer';

  const roster = useLoad(() => listMembers(chapter.id), [chapter.id]);
  const board = useLoad(() => playerLeaderboard({ chapterId: chapter.id, limit: 200 }), [chapter.id]);
  const ranks = useLoad(() => chapterLeaderboard({ limit: 200 }), [chapter.id]);
  const trainers = useLoad(() => listTrainers(chapter.id), [chapter.id]);
  const attendance = useLoad(() => memberAttendance(chapter.id, membership.user_id), [chapter.id, membership.user_id]);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const myRank: ChapterLeaderboardRow | undefined = ranks.data?.find((r) => r.is_mine);
  const others = (roster.data?.length ?? 1) - 1;
  const presidentAlone = role === 'president' && others === 0;
  const presidentBlocked = role === 'president' && others > 0;

  const memberLink = (m: { user_id: string; username: string }) =>
    staff ? `/chapter/member/${m.user_id}` : `/u/${m.username}`;

  const leave = async () => {
    try {
      await leaveChapter();
      await refreshProfile();
      toast.success(presidentAlone ? 'Chapter closed' : `You left ${chapter.name}`);
      onLeft();
    } catch (e) {
      toast.error('Could not leave', errorMessage(e));
      throw e;
    }
  };

  const meInBoard = board.data?.find((r) => r.is_me);

  return (
    <>
      <PageHeader
        eyebrow={[chapter.school, chapter.region].filter(Boolean).join(' · ') || 'Chapter'}
        title={chapter.name}
        subtitle={chapter.description ?? undefined}
        size="lg"
        actions={
          <>
            <ButtonLink to="/chapter/classroom" variant="inverse">
              Classroom
            </ButtonLink>
            {admin && (
              <ButtonLink to="/chapter/admin" variant="accent">
                Manage
              </ButtonLink>
            )}
            <Dropdown
              trigger={({ open: _open, ...p }) => (
                <Button {...p} variant="inverse" size="icon" aria-label="More chapter options">
                  <MoreHorizontal className="size-5" />
                </Button>
              )}
              items={[
                ...(admin ? [{ label: 'Admin dashboard', to: '/chapter/admin' }] : []),
                { label: 'Classroom', to: '/chapter/classroom' },
                { type: 'separator' as const },
                { label: 'Leave chapter', danger: true, onSelect: () => setLeaveOpen(true) },
              ]}
            />
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
          <HeroChip label="Members" value={roster.data ? fmt(roster.data.length) : '…'} />
          <HeroChip label="Chapter Elo" value={myRank ? fmt(myRank.total_elo) : '…'} />
          <HeroChip label="Avg Elo" value={myRank ? fmt(myRank.avg_elo) : '…'} />
          <HeroChip
            label="National rank"
            value={myRank ? `#${myRank.rank}` : '…'}
            sub={myRank ? `of ${myRank.total_count}` : undefined}
            accent
          />
          {meInBoard && <HeroChip label="You" value={`#${meInBoard.rank}`} sub={`in chapter · ${ROLE_LABEL_SHORT[role]}`} />}
        </div>
      </PageHeader>

      <Page>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <Leaderboard
              rows={board.data}
              loading={board.loading}
              error={board.error}
              onRetry={() => void board.reload()}
              roles={roster.data}
              linkFor={memberLink}
            />
            <Roster members={roster.data} loading={roster.loading} error={roster.error} linkFor={memberLink} />
          </div>

          <aside className="min-w-0 space-y-6">
            {admin && <InviteCard chapterId={chapter.id} />}
            <ClassroomCard staff={staff} />
            <TrainersCard trainers={trainers.data} roster={roster.data} loading={trainers.loading || roster.loading} admin={admin} />
            <MyAttendance rows={attendance.data} loading={attendance.loading} />
          </aside>
        </div>
      </Page>

      <ConfirmDialog
        open={leaveOpen && !presidentBlocked}
        onClose={() => setLeaveOpen(false)}
        onConfirm={leave}
        variant="danger"
        title={presidentAlone ? 'Close the chapter?' : `Leave ${chapter.name}?`}
        description={
          presidentAlone
            ? "You're the only member, so leaving deletes the chapter, its classroom and its attendance history."
            : 'Your Elo and stats stay with you. You can rejoin later with a code or invite link, unless you are banned.'
        }
        confirmLabel={presidentAlone ? 'Close chapter' : 'Leave chapter'}
      />
      <ConfirmDialog
        open={leaveOpen && presidentBlocked}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => navigate('/chapter/admin?tab=settings')}
        title="Hand over the chapter first"
        description="A chapter always needs a president. Transfer the presidency to another member from the admin dashboard, then you can leave."
        confirmLabel="Open settings"
      />
    </>
  );
}

const ROLE_LABEL_SHORT: Record<ChapterRole, string> = {
  president: 'President',
  executive: 'Executive',
  trainer: 'Trainer',
  member: 'Member',
};

function HeroChip({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        'min-w-[104px] rounded-[2px] border border-t-[3px] border-line border-t-red px-3.5 py-2.5',
        accent ? 'bg-red/[0.06]' : 'bg-surface',
      )}
    >
      <div className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular font-display text-xl font-extrabold leading-tight text-red">
        {value}
        {sub && <span className="ml-1.5 text-xs font-semibold text-muted">{sub}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ leaderboard

function Leaderboard({
  rows,
  loading,
  error,
  onRetry,
  roles,
  linkFor,
}: {
  rows: PlayerLeaderboardRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  roles: RosterMember[] | undefined;
  linkFor: (m: { user_id: string; username: string }) => string;
}) {
  const navigate = useNavigate();
  const roleOf = useMemo(() => new Map((roles ?? []).map((r) => [r.user_id, r.role])), [roles]);
  const allZero = rows != null && rows.every((r) => r.elo === 0);
  // "Fresh" means nobody has played yet; members can have answered questions and still sit at the 0 Elo floor.
  const fresh = allZero && rows.every((r) => r.questions_answered === 0);
  const podium = rows && !allZero ? rows.slice(0, 3) : [];

  return (
    <Card as="section" padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <CardHeader className="mb-0" title="Chapter leaderboard" subtitle="Everyone starts at 0. Every right answer counts." />
        <ButtonLink to="/play" size="sm" variant="secondary" className="shrink-0" rightIcon={<ArrowRight className="size-4" />}>
          Practise
        </ButtonLink>
      </div>
      {loading && !rows ? (
        <div className="space-y-2 p-4 pt-0 sm:p-5 sm:pt-0">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error && !rows ? (
        <div className="p-5 pt-0">
          <ErrorState error={error} onRetry={onRetry} />
        </div>
      ) : rows && rows.length ? (
        <>
          {podium.length >= 2 && (
            <div className="grid grid-cols-3 items-end gap-2 border-y border-line bg-surface-2 px-3 pb-4 pt-5 sm:gap-4 sm:px-6">
              {[podium[1], podium[0], podium[2]].map((r, i) =>
                r ? (
                  <Link
                    key={r.user_id}
                    to={linkFor(r)}
                    className={cn(
                      'group flex flex-col items-center rounded-[2px] p-2 text-center transition-colors hover:bg-surface',
                      i === 1 && '-mt-3',
                    )}
                  >
                    <div className="relative">
                      <Avatar src={r.avatar_url} name={r.display_name} size={i === 1 ? 'xl' : 'lg'} className={cn(r.is_me && 'ring-2 ring-red')} />
                      <span
                        className={cn(
                          'absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-[2px] font-display text-xs font-extrabold text-white ring-2 ring-surface',
                          r.rank === 1 ? 'bg-red' : 'bg-blue',
                        )}
                      >
                        {r.rank}
                      </span>
                    </div>
                    <div className="mt-2.5 w-full truncate text-sm font-bold text-heading group-hover:underline">{r.display_name}</div>
                    <div className="tabular mt-0.5 text-sm font-semibold text-muted">
                      {r.elo} <span className="text-xs">Elo</span>
                    </div>
                  </Link>
                ) : (
                  <div key={i} />
                ),
              )}
            </div>
          )}
          {allZero && (
            <div className="mx-4 mb-3 rounded-[2px] border-l-4 border-blue bg-surface-2 px-3 py-2.5 text-sm text-ink sm:mx-5">
              {fresh
                ? 'Fresh board: everyone is at 0. The first member to finish a practice set takes the top spot.'
                : 'Everyone is tied at 0 Elo so far. Rated practice with more right answers moves you up the board.'}
            </div>
          )}
          <Table>
            <THead>
              <tr>
                <TH className="w-12">#</TH>
                <TH>Player</TH>
                <TH align="right" className="max-sm:hidden">Accuracy</TH>
                <TH align="right" className="max-sm:hidden">Answered</TH>
                <TH align="right">Elo</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => {
                const role = roleOf.get(r.user_id);
                return (
                  <TR key={r.user_id} highlight={r.is_me} interactive onClick={() => navigate(linkFor(r))}>
                    <TD className="tabular font-display font-bold text-muted">{r.rank}</TD>
                    <TD>
                      <Link to={linkFor(r)} className="flex min-w-0 items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <Avatar src={r.avatar_url} name={r.display_name} size="sm" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold text-heading">{r.display_name}</span>
                            {r.is_me && <Badge tone="red" solid className="h-5 px-1.5 text-[10px]">You</Badge>}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-muted">
                            @{r.username}
                            {role && role !== 'member' && <span aria-hidden>·</span>}
                            {role && role !== 'member' && <span>{ROLE_LABEL_SHORT[role]}</span>}
                          </span>
                        </span>
                      </Link>
                    </TD>
                    <TD align="right" className="tabular max-sm:hidden">{r.questions_answered ? pct(r.accuracy) : '–'}</TD>
                    <TD align="right" className="tabular max-sm:hidden">{fmt(r.questions_answered)}</TD>
                    <TD align="right">
                      <EloBadge elo={r.elo} size="sm" />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </>
      ) : (
        <EmptyState compact title="No players yet" description="Invite your members to fill the board." />
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ roster

function Roster({
  members,
  loading,
  error,
  linkFor,
}: {
  members: RosterMember[] | undefined;
  loading: boolean;
  error: unknown;
  linkFor: (m: { user_id: string; username: string }) => string;
}) {
  const groups = useMemo(() => {
    const g = new Map<ChapterRole, RosterMember[]>();
    for (const m of members ?? []) g.set(m.role, [...(g.get(m.role) ?? []), m]);
    for (const list of g.values()) list.sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));
    return ROLE_ORDER.filter((r) => g.has(r)).map((r) => ({ role: r, list: g.get(r)! }));
  }, [members]);

  return (
    <Card as="section">
      <CardHeader title="Roster" subtitle={members ? `${members.length} ${members.length === 1 ? 'member' : 'members'}` : undefined} />
      {loading && !members ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error && !members ? (
        <ErrorState error={error} />
      ) : (
        <div className="space-y-5">
          {groups.map(({ role, list }) => (
            <div key={role}>
              <div className="mb-2 flex items-center gap-2">
                <RoleBadge role={role} />
                <span className="text-xs text-muted">{list.length}</span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.map((m) => (
                  <li key={m.user_id}>
                    <Link
                      to={linkFor({ user_id: m.user_id, username: m.profile.username })}
                      className="flex items-center gap-3 rounded-[2px] border border-line p-2.5 transition-colors hover:border-blue hover:bg-surface-2"
                    >
                      <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-heading">{m.profile.display_name}</span>
                        <span className="block truncate text-xs text-muted">
                          {m.profile.main_event ? eventName(m.profile.main_event) : `@${m.profile.username}`}
                          {m.profile.grade ? ` · Gr ${m.profile.grade}` : ''}
                        </span>
                      </span>
                      <span className="tabular text-sm font-semibold text-muted">
                        {m.profile.elo} <span className="text-xs">Elo</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ side cards

function ClassroomCard({ staff }: { staff: boolean }) {
  return (
    <Link
      to="/chapter/classroom"
      className="group relative block overflow-hidden rounded-[2px] border border-l-4 border-line border-l-red bg-surface p-5 transition-colors hover:bg-surface-2"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold text-heading">Classroom</div>
          <div className="text-sm text-muted">
            {staff ? 'Post updates, build tests and assign work.' : 'Announcements, assignments and chapter tests.'}
          </div>
        </div>
        <ChevronRight className="size-5 text-red transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}

function TrainersCard({
  trainers,
  roster,
  loading,
  admin,
}: {
  trainers: { user_id: string; event: string }[] | undefined;
  roster: RosterMember[] | undefined;
  loading: boolean;
  admin: boolean;
}) {
  const byId = useMemo(() => new Map((roster ?? []).map((m) => [m.user_id, m])), [roster]);
  const byEvent = useMemo(() => {
    const m = new Map<string, RosterMember[]>();
    for (const t of trainers ?? []) {
      const mem = byId.get(t.user_id);
      if (mem) m.set(t.event, [...(m.get(t.event) ?? []), mem]);
    }
    return m;
  }, [trainers, byId]);
  const covered = EVENTS.filter((e) => byEvent.has(e.slug));

  return (
    <Card as="section">
      <CardHeader
        title="Event trainers"
        subtitle={trainers ? `${covered.length} of ${EVENTS.length} events covered` : undefined}
        action={
          admin ? (
            <ButtonLink to="/chapter/admin?tab=trainers" size="xs" variant="ghost">
              Assign
            </ButtonLink>
          ) : undefined
        }
      />
      {loading && !trainers ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : covered.length === 0 ? (
        <p className="text-sm text-muted">
          {admin ? 'No trainers yet. Pick one or two members per event to lead its prep.' : 'Trainers haven\'t been assigned yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {covered.map((e) => (
            <li key={e.slug} className="flex items-center gap-3 py-2.5">
              <span className="w-12 shrink-0 rounded-[2px] bg-surface-2 py-1 text-center font-display text-[0.6875rem] font-bold text-muted">
                {e.short}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={e.name}>
                {e.name}
              </span>
              <span className="flex -space-x-2">
                {byEvent.get(e.slug)!.map((m) => (
                  <Link key={m.user_id} to={`/u/${m.profile.username}`} title={m.profile.display_name}>
                    <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="xs" ring />
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MyAttendance({
  rows,
  loading,
}: {
  rows: { session: { id: string; title: string; held_on: string }; status: keyof typeof ATTENDANCE_LABELS | null }[] | undefined;
  loading: boolean;
}) {
  if (loading && !rows) return <Skeleton className="h-40 w-full" rounded="rounded-[2px]" />;
  if (!rows || rows.length === 0) return null;
  const { rate, attended, counted } = attendanceRate(rows.map((r) => r.status));
  const recent = rows.slice(0, 5);
  const tone: Record<string, string> = {
    present: 'bg-success',
    late: 'bg-warning',
    absent: 'bg-red',
    excused: 'bg-blue',
  };
  return (
    <Card as="section">
      <CardHeader
        title="Your attendance"

        subtitle={counted ? `${attended} of ${pluralize(counted, 'meeting')}` : `${pluralize(rows.length, 'meeting')} so far`}
        action={<span className="tabular font-display text-2xl font-extrabold text-heading">{pct(rate)}</span>}
      />
      <ul className="space-y-2">
        {recent.map((r) => (
          <li key={r.session.id} className="flex items-center gap-3 text-sm">
            <span className={cn('size-2.5 shrink-0 rounded-full', r.status ? tone[r.status] : 'bg-line-strong')} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{r.session.title}</span>
            <span className="shrink-0 text-xs text-muted">
              {new Date(`${r.session.held_on}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <span className="w-16 shrink-0 text-right text-xs font-semibold">{r.status ? ATTENDANCE_LABELS[r.status] : 'Not marked'}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
