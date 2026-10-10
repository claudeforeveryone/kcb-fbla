import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  PageHeader,
  Pill,
  Select,
  Skeleton,
  SkeletonCards,
  Tabs,
  cn,
  errorMessage,
  tabPanelProps,
  useToast,
  type DropdownItem,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { useAuth } from '../../lib/auth';
import { eventName, isEventSlug, type ChapterRole, type PostKind } from '../../lib/types';
import {
  assignmentRunHref,
  assignmentStatus,
  canEditPost,
  canWriteNewsletter,
  deleteAssignment,
  deleteCustomTest,
  deleteDeck,
  deletePost,
  isStaff,
  listAssignmentAttempts,
  listAssignments,
  listCustomTests,
  listDecks,
  listPosts,
  loadClassroomContext,
  setPostPinned,
  type AttemptLite,
  type ClassAssignment,
  type ClassDeck,
  type ClassPost,
  type ClassTest,
  type ClassroomContext,
} from '../../api/classroom';
import { PostCard } from './components/classroom-post-card';
import { PostComposer } from './components/classroom-post-composer';
import { PostReader } from './components/classroom-reader';
import { AssignModal, type AssignPreset } from './components/classroom-assign-modal';
import { AssignmentsPanel } from './components/classroom-assignments';
import { LibraryPanel } from './components/classroom-library';
import { DeckEditor } from './components/classroom-deck-editor';
import { DeckStudy } from './components/classroom-deck-study';
import { excerpt, readingMinutes } from './components/classroom-markdown';
import { ASSIGNMENT_META, POST_META, SectionLabel, dueLabel, eventOptions, formatDate, pluralize } from './components/classroom-shared';

type Tab = 'stream' | 'assignments' | 'newsletters' | 'library';
const TABS: Tab[] = ['stream', 'assignments', 'newsletters', 'library'];

type Data = {
  ctx: ClassroomContext;
  posts: ClassPost[];
  tests: ClassTest[];
  decks: ClassDeck[];
  assignments: ClassAssignment[];
  attempts: AttemptLite[];
};

type Pending =
  | { type: 'post'; item: ClassPost }
  | { type: 'test'; item: ClassTest }
  | { type: 'deck'; item: ClassDeck }
  | { type: 'assignment'; item: ClassAssignment }
  | null;

export default function ClassroomPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);

  // dialogs
  const [composer, setComposer] = useState<{ kind: PostKind; editing: ClassPost | null } | null>(null);
  const [assign, setAssign] = useState<{ preset: AssignPreset; editing: ClassAssignment | null } | null>(null);
  const [deckEdit, setDeckEdit] = useState<{ editing: ClassDeck | null } | null>(null);
  const [study, setStudy] = useState<{ deck: ClassDeck; assignment: ClassAssignment | null } | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const tabParam = params.get('tab') as Tab | null;
  const postId = params.get('post');
  const focusAssignment = params.get('assignment');
  const tab: Tab = focusAssignment ? 'assignments' : tabParam && TABS.includes(tabParam) ? tabParam : 'stream';
  const eventFilter = isEventSlug(params.get('event')) ? params.get('event')! : '';
  const kindParam = params.get('kind') as PostKind | null;
  const kindFilter: PostKind | '' = kindParam && kindParam in POST_META ? kindParam : '';

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') n.delete(k);
            else n.set(k, v);
          }
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  const load = useCallback(async () => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    try {
      const ctx = await loadClassroomContext();
      if (!ctx) {
        setState('none');
        return;
      }
      const [posts, tests, decks, assignments] = await Promise.all([
        listPosts(ctx.chapter.id),
        listCustomTests(ctx.chapter.id),
        listDecks(ctx.chapter.id),
        listAssignments(ctx.chapter.id),
      ]);
      const attempts = await listAssignmentAttempts(assignments.map((a) => a.id));
      setData({ ctx, posts, tests, decks, assignments, attempts });
      setState('ready');
    } catch (e) {
      setError(e);
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, user?.id]);

  const refreshAttempts = useCallback(async () => {
    if (!data) return;
    try {
      const attempts = await listAssignmentAttempts(data.assignments.map((a) => a.id));
      setData((d) => (d ? { ...d, attempts } : d));
    } catch {
      /* the next full load picks it up */
    }
  }, [data]);

  const roleOf = useCallback(
    (uid: string | null): ChapterRole | null => (uid ? (data?.ctx.members.find((m) => m.user_id === uid)?.role ?? null) : null),
    [data],
  );

  const newsletters = useMemo(() => (data?.posts ?? []).filter((p) => p.kind === 'newsletter').sort((a, b) => b.created_at.localeCompare(a.created_at)), [data]);
  const issueOf = (p: ClassPost) => {
    const i = newsletters.findIndex((n) => n.id === p.id);
    return i < 0 ? null : newsletters.length - i;
  };
  const readerPost = postId ? (data?.posts.find((p) => p.id === postId) ?? null) : null;

  useEffect(() => {
    if (state === 'ready' && postId && !readerPost) {
      toast.info('That post is no longer available.');
      setParam({ post: null });
    }
  }, [state, postId, readerPost, toast, setParam]);

  // my open assignments (for header chips + sidebar)
  const mine = useMemo(() => {
    if (!data) return { todo: [] as ClassAssignment[], overdue: 0 };
    const my = data.attempts.filter((t) => t.user_id === data.ctx.me.id);
    const now = Date.now();
    const open = data.assignments
      .filter((a) => a.assigned_by !== data.ctx.me.id)
      .map((a) => ({ a, s: assignmentStatus(a, my.filter((t) => t.assignment_id === a.id), now) }))
      .filter((x) => x.s !== 'done');
    return {
      todo: open
        .map((x) => x.a)
        .sort((x, y) => (x.due_at ? new Date(x.due_at).getTime() : Infinity) - (y.due_at ? new Date(y.due_at).getTime() : Infinity)),
      overdue: open.filter((x) => x.s === 'overdue').length,
    };
  }, [data]);

  // ------------------------------------------------------------------ mutations
  const upsert = <K extends 'posts' | 'tests' | 'decks' | 'assignments'>(key: K, item: Data[K][number], front = true) =>
    setData((d) => {
      if (!d) return d;
      const list = d[key] as { id: string }[];
      const exists = list.some((x) => x.id === (item as { id: string }).id);
      const next = exists ? list.map((x) => (x.id === (item as { id: string }).id ? item : x)) : front ? [item, ...list] : [...list, item];
      return { ...d, [key]: next };
    });

  const togglePin = async (p: ClassPost) => {
    upsert('posts', { ...p, pinned: !p.pinned });
    try {
      await setPostPinned(p.id, !p.pinned);
      toast.success(p.pinned ? 'Unpinned' : 'Pinned to the top');
    } catch (e) {
      upsert('posts', p);
      toast.error('Could not change the pin', errorMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!pending || !data) return;
    try {
      if (pending.type === 'post') await deletePost(pending.item.id);
      if (pending.type === 'test') await deleteCustomTest(pending.item.id);
      if (pending.type === 'deck') await deleteDeck(pending.item.id);
      if (pending.type === 'assignment') await deleteAssignment(pending.item.id);
      const key = ({ post: 'posts', test: 'tests', deck: 'decks', assignment: 'assignments' } as const)[pending.type];
      setData((d) => (d ? { ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== pending.item.id) } : d));
      if (pending.type === 'assignment' && focusAssignment === pending.item.id) setParam({ assignment: null });
      if (pending.type === 'post' && postId === pending.item.id) setParam({ post: null });
      toast.success('Deleted');
    } catch (e) {
      toast.error('Could not delete', errorMessage(e));
      throw e;
    }
  };

  const studyAssignment = (a: ClassAssignment) => {
    const deck = data?.decks.find((d) => d.id === a.ref);
    if (!deck) return toast.error('That deck was removed.');
    setStudy({ deck, assignment: a });
  };

  // ------------------------------------------------------------------ render
  if (state === 'loading')
    return (
      <>
        <PageHeader eyebrow={<Skeleton className="h-3 w-28 bg-white/20" />} title="Classroom" subtitle="Posts, newsletters and assignments from your chapter." />
        <Page>
          <Skeleton className="h-11 w-full max-w-lg" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <SkeletonCards count={3} />
            <SkeletonCards count={2} className="hidden lg:grid" />
          </div>
        </Page>
      </>
    );

  if (state === 'error')
    return (
      <>
        <PageHeader title="Classroom" />
        <Page>
          <ErrorState error={error} onRetry={() => void load()} />
        </Page>
      </>
    );

  if (state === 'none' || !data)
    return (
      <>
        <PageHeader title="Classroom" subtitle="Posts, newsletters, tests and assignments from your chapter." />
        <Page width="narrow">
          <EmptyState
            title="Join a chapter to open its classroom"
            description="Your executives share announcements, weekly newsletters, practice tests and flashcards here."
            action={
              <>
                <ButtonLink to="/chapter">Find or join a chapter</ButtonLink>
                <ButtonLink to="/chapter/new" variant="outline">
                  Register a chapter
                </ButtonLink>
              </>
            }
          />
        </Page>
      </>
    );

  const { ctx } = data;
  const staff = isStaff(ctx);
  const newPostItems: DropdownItem[] = (['announcement', 'newsletter', 'link', 'resource'] as PostKind[])
    .filter((k) => k !== 'newsletter' || canWriteNewsletter(ctx))
    .map((k) => {
      const M = POST_META[k];
      return { label: M.label, onSelect: () => setComposer({ kind: k, editing: null }) };
    });

  const tabItems = [
    { value: 'stream' as Tab, label: 'Stream' },
    { value: 'assignments' as Tab, label: 'Assignments', count: mine.todo.length || undefined },
    { value: 'newsletters' as Tab, label: 'Newsletters' },
    { value: 'library' as Tab, label: 'Tests & decks' },
  ];

  return (
    <>
      <PageHeader
        eyebrow={ctx.chapter.name}
        title="Classroom"
        subtitle={staff ? 'Keep your chapter informed, assign practice, and see who has done it.' : 'Everything your chapter leaders share, in one place.'}
        actions={
          staff ? (
            <>
              <Dropdown
                align="end"
                width="w-52"
                items={newPostItems}
                trigger={({ open: _o, ...p }) => (
                  <Button {...p} variant="inverse" rightIcon={<ChevronDown className="size-4" />}>
                    New post
                  </Button>
                )}
              />
              <Button variant="accent" onClick={() => setAssign({ preset: null, editing: null })}>
                Assign
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-2">
          <HeaderChip
            onClick={() => setParam({ tab: 'assignments', post: null })}
            label={mine.todo.length ? `${pluralize(mine.todo.length, 'assignment')} to do` : 'All caught up'}
            alert={mine.overdue > 0 ? `${mine.overdue} overdue` : undefined}
          />
          {newsletters[0] && (
            <HeaderChip onClick={() => setParam({ post: newsletters[0].id })} label={`Latest: ${newsletters[0].title}`} />
          )}
          <HeaderChip label={pluralize(ctx.members.length, 'member')} />
        </div>
      </PageHeader>

      <Page>
        <Tabs
          id="classroom"
          aria-label="Classroom sections"
          items={tabItems}
          value={tab}
          onChange={(v) => setParam({ tab: v === 'stream' ? null : v, assignment: null })}
        />

        <div {...tabPanelProps('classroom', tab)} className="mt-6 outline-none">
          {tab === 'stream' && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0">
                {staff && (
                  <button
                    type="button"
                    onClick={() => setComposer({ kind: 'announcement', editing: null })}
                    className="mb-5 flex w-full items-center gap-3 rounded-[2px] border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-blue"
                  >
                    <Avatar src={ctx.members.find((m) => m.user_id === ctx.me.id)?.profile.avatar_url} name={ctx.members.find((m) => m.user_id === ctx.me.id)?.profile.display_name} size="sm" />
                    <span className="flex-1 text-[0.9375rem] text-muted">Share something with your chapter…</span>
                    <span className="hidden text-sm font-semibold text-blue dark:text-link sm:inline">Post</span>
                  </button>
                )}

                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by type">
                    <Pill active={!kindFilter} onClick={() => setParam({ kind: null })} count={data.posts.filter((p) => !eventFilter || p.event === eventFilter).length}>
                      All
                    </Pill>
                    {(['announcement', 'newsletter', 'link', 'resource'] as PostKind[]).map((k) => {
                      const M = POST_META[k];
                      const n = data.posts.filter((p) => p.kind === k && (!eventFilter || p.event === eventFilter)).length;
                      return (
                        <Pill key={k} active={kindFilter === k} onClick={() => setParam({ kind: kindFilter === k ? null : k })} count={n}>
                          {M.plural}
                        </Pill>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 sm:w-60">
                    <Select
                      aria-label="Filter by event"
                      className="flex-1"
                      value={eventFilter}
                      onChange={(e) => setParam({ event: e.target.value || null })}
                      options={eventOptions(ctx, { allowNone: 'All events' })}
                    />
                  </div>
                </div>

                <Stream
                  data={data}
                  kindFilter={kindFilter}
                  eventFilter={eventFilter}
                  roleOf={roleOf}
                  onOpen={(p) => setParam({ post: p.id })}
                  onEdit={(p) => setComposer({ kind: p.kind, editing: p })}
                  onDelete={(p) => setPending({ type: 'post', item: p })}
                  onTogglePin={(p) => void togglePin(p)}
                  onFilterEvent={(ev) => setParam({ event: ev })}
                  onClearFilters={() => setParam({ event: null, kind: null })}
                  onCompose={staff ? () => setComposer({ kind: 'announcement', editing: null }) : undefined}
                />
              </div>

              <aside className="space-y-6">
                <UpNext todo={mine.todo} decks={data.decks} onOpen={(a) => setParam({ assignment: a.id })} onSeeAll={() => setParam({ tab: 'assignments' })} />
                {newsletters[0] && <LatestNewsletter post={newsletters[0]} issue={newsletters.length} onOpen={() => setParam({ post: newsletters[0].id })} />}
                <LibraryTeaser tests={data.tests.filter((t) => t.published).length} decks={data.decks.length} onOpen={() => setParam({ tab: 'library' })} />
              </aside>
            </div>
          )}

          {tab === 'assignments' && (
            <AssignmentsPanel
              ctx={ctx}
              staff={staff}
              assignments={data.assignments}
              attempts={data.attempts}
              tests={data.tests}
              decks={data.decks}
              focusId={focusAssignment}
              onFocus={(id) => setParam({ assignment: id, tab: 'assignments' })}
              onNew={() => setAssign({ preset: null, editing: null })}
              onEdit={(a) => setAssign({ preset: null, editing: a })}
              onDelete={(a) => setPending({ type: 'assignment', item: a })}
              onStudyDeck={studyAssignment}
            />
          )}

          {tab === 'newsletters' && (
            <NewsletterShelf
              items={newsletters}
              canWrite={canWriteNewsletter(ctx)}
              onOpen={(p) => setParam({ post: p.id })}
              onWrite={() => setComposer({ kind: 'newsletter', editing: null })}
            />
          )}

          {tab === 'library' && (
            <LibraryPanel
              ctx={ctx}
              tests={data.tests}
              decks={data.decks}
              event={eventFilter}
              onAssign={(preset) => setAssign({ preset, editing: null })}
              onNewDeck={() => setDeckEdit({ editing: null })}
              onEditDeck={(d) => setDeckEdit({ editing: d })}
              onStudyDeck={(d) => setStudy({ deck: d, assignment: null })}
              onDeleteTest={(t) => setPending({ type: 'test', item: t })}
              onDeleteDeck={(d) => setPending({ type: 'deck', item: d })}
              onTestCreated={(t) => upsert('tests', t)}
            />
          )}
        </div>
      </Page>

      {/* dialogs */}
      <PostReader
        post={readerPost}
        chapterName={ctx.chapter.name}
        issue={readerPost ? issueOf(readerPost) : null}
        authorRole={readerPost ? roleOf(readerPost.author_id) : null}
        onClose={() => setParam({ post: null })}
        onEdit={
          readerPost && canEditPost(ctx, readerPost)
            ? () => {
                setComposer({ kind: readerPost.kind, editing: readerPost });
                setParam({ post: null });
              }
            : undefined
        }
      />
      <PostComposer
        open={!!composer}
        onClose={() => setComposer(null)}
        ctx={ctx}
        initialKind={composer?.kind}
        editing={composer?.editing}
        onSaved={(p) => {
          upsert('posts', p);
          if (p.kind === 'newsletter' && tab !== 'newsletters' && tab !== 'stream') setParam({ tab: 'newsletters' });
        }}
      />
      <AssignModal
        open={!!assign}
        onClose={() => setAssign(null)}
        ctx={ctx}
        tests={data.tests}
        decks={data.decks}
        preset={assign?.preset}
        editing={assign?.editing}
        onSaved={(a, created) => {
          upsert('assignments', a);
          if (created) {
            if (a.kind === 'test') setData((d) => (d ? { ...d, tests: d.tests.map((t) => (t.id === a.ref ? { ...t, published: true } : t)) } : d));
            setParam({ tab: 'assignments', assignment: null });
          }
        }}
      />
      <DeckEditor open={!!deckEdit} onClose={() => setDeckEdit(null)} ctx={ctx} editing={deckEdit?.editing} onSaved={(d) => upsert('decks', d)} />
      <DeckStudy deck={study?.deck ?? null} assignment={study?.assignment} onClose={() => setStudy(null)} onCompleted={() => void refreshAttempts()} />
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirmDelete}
        variant="danger"
        confirmLabel="Delete"
        title={
          pending?.type === 'post'
            ? `Delete this ${POST_META[pending.item.kind].label.toLowerCase()}?`
            : pending?.type === 'test'
              ? 'Delete this test?'
              : pending?.type === 'deck'
                ? 'Delete this deck?'
                : 'Delete this assignment?'
        }
        description={
          pending?.type === 'test'
            ? `"${pending.item.title}" and any assignments that use it will be removed. Scores already recorded stay in members' history.`
            : pending?.type === 'deck'
              ? `"${pending.item.title}" will be removed for everyone. Assignments that use it stop working.`
              : pending?.type === 'assignment'
                ? `"${pending.item.title}" disappears from every member's to-do list. Their past attempts stay in their history.`
                : pending
                  ? `"${pending.item.title}" will be removed for everyone.`
                  : undefined
        }
      />
    </>
  );
}

// ------------------------------------------------------------------------------------------------ pieces

function HeaderChip({ label, alert, onClick }: { label: string; alert?: string; onClick?: () => void }) {
  const cls =
    'inline-flex h-9 max-w-full items-center gap-2 rounded-[2px] border border-white/15 bg-navy-2 px-3.5 text-sm font-semibold text-white transition-colors';
  const inner = (
    <>
      <span className="truncate">{label}</span>
      {alert && <span className="rounded-[2px] bg-red px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">{alert}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'hover:border-white/40')}>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

function Stream({
  data,
  kindFilter,
  eventFilter,
  roleOf,
  onOpen,
  onEdit,
  onDelete,
  onTogglePin,
  onFilterEvent,
  onClearFilters,
  onCompose,
}: {
  data: Data;
  kindFilter: PostKind | '';
  eventFilter: string;
  roleOf: (uid: string | null) => ChapterRole | null;
  onOpen: (p: ClassPost) => void;
  onEdit: (p: ClassPost) => void;
  onDelete: (p: ClassPost) => void;
  onTogglePin: (p: ClassPost) => void;
  onFilterEvent: (ev: string) => void;
  onClearFilters: () => void;
  onCompose?: () => void;
}) {
  const [limit, setLimit] = useState(20);
  const shown = data.posts.filter((p) => (!kindFilter || p.kind === kindFilter) && (!eventFilter || p.event === eventFilter));
  const pinned = shown.filter((p) => p.pinned);
  const rest = shown.filter((p) => !p.pinned);

  if (!data.posts.length)
    return (
      <EmptyState
        title="The classroom is quiet"
        description={
          onCompose
            ? 'Post a welcome announcement, share a study link, or write the first weekly newsletter.'
            : 'Announcements and newsletters from your chapter leaders will show up here.'
        }
        action={onCompose ? <Button onClick={onCompose}>Write the first post</Button> : <ButtonLink to="/play" variant="outline">Practise while you wait</ButtonLink>}
      />
    );
  if (!shown.length)
    return (
      <EmptyState
        compact
        title="Nothing matches these filters"
        description={`No ${kindFilter ? POST_META[kindFilter].plural.toLowerCase() : 'posts'}${eventFilter ? ` for ${eventName(eventFilter)}` : ''} yet.`}
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );

  const card = (p: ClassPost) => (
    <PostCard
      key={p.id}
      post={p}
      ctx={data.ctx}
      roleOf={roleOf}
      onOpen={() => onOpen(p)}
      onEdit={() => onEdit(p)}
      onDelete={() => onDelete(p)}
      onTogglePin={() => onTogglePin(p)}
      onFilterEvent={onFilterEvent}
    />
  );
  return (
    <div className="space-y-3">
      {pinned.map(card)}
      {pinned.length > 0 && rest.length > 0 && <div className="flex items-center gap-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-muted"><span className="h-px flex-1 bg-line" />Latest<span className="h-px flex-1 bg-line" /></div>}
      {rest.slice(0, limit).map(card)}
      {rest.length > limit && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => setLimit((l) => l + 20)}>
            Show older posts
          </Button>
        </div>
      )}
    </div>
  );
}

function UpNext({ todo, decks, onOpen, onSeeAll }: { todo: ClassAssignment[]; decks: ClassDeck[]; onOpen: (a: ClassAssignment) => void; onSeeAll: () => void }) {
  return (
    <section>
      <SectionLabel
        action={
          todo.length > 3 ? (
            <button type="button" onClick={onSeeAll} className="link text-xs">
              See all {todo.length}
            </button>
          ) : undefined
        }
      >
        Up next
      </SectionLabel>
      {todo.length ? (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {todo.slice(0, 3).map((a) => {
            const M = ASSIGNMENT_META[a.kind];
            const due = dueLabel(a.due_at);
            const deckMissing = a.kind === 'deck' && !decks.some((d) => d.id === a.ref);
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => onOpen(a)} className="min-w-0 flex-1 text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">{M.short}</span>
                  <span className="block truncate text-sm font-semibold text-heading hover:text-blue">{a.title}</span>
                  <span className={cn('block text-xs', due.tone === 'danger' ? 'font-semibold text-red dark:text-danger' : due.tone === 'warning' ? 'font-semibold text-[#8a5f00] dark:text-warning' : 'text-muted')}>
                    {due.text}
                  </span>
                </button>
                {a.kind === 'deck' ? (
                  <Button size="xs" variant="secondary" onClick={() => onOpen(a)} disabled={deckMissing}>
                    Open
                  </Button>
                ) : (
                  <ButtonLink size="xs" variant="secondary" to={assignmentRunHref(a)}>
                    Start
                  </ButtonLink>
                )}
              </div>
            );
          })}
        </Card>
      ) : (
        <Card className="border-l-4 border-l-success py-4">
          <div className="text-sm">
            <p className="font-semibold text-heading">You&apos;re all caught up</p>
            <p className="text-muted">No open assignments.</p>
          </div>
        </Card>
      )}
    </section>
  );
}

function LatestNewsletter({ post, issue, onOpen }: { post: ClassPost; issue: number; onOpen: () => void }) {
  return (
    <section>
      <SectionLabel>Latest newsletter</SectionLabel>
      <button type="button" onClick={onOpen} className="group relative block w-full overflow-hidden rounded-[2px] border-l-4 border-red bg-navy p-5 text-left text-white transition-colors hover:bg-navy-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/65">
          Issue {issue} · {formatDate(post.created_at)}
        </div>
        <h3 className="mt-2 text-lg font-bold leading-snug text-white">{post.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-white/75">{excerpt(post.body, 180)}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white">
          Read · {readingMinutes(post.body)} min
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
    </section>
  );
}

function LibraryTeaser({ tests, decks, onOpen }: { tests: number; decks: number; onOpen: () => void }) {
  if (!tests && !decks) return null;
  return (
    <section>
      <SectionLabel>Study library</SectionLabel>
      <Card interactive padded={false}>
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 p-4 text-left">
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold text-heading">Chapter tests and flashcards</span>
            <span className="text-muted">
              {pluralize(tests, 'test')} · {pluralize(decks, 'deck')}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted" />
        </button>
      </Card>
    </section>
  );
}

function NewsletterShelf({ items, canWrite, onOpen, onWrite }: { items: ClassPost[]; canWrite: boolean; onOpen: (p: ClassPost) => void; onWrite: () => void }) {
  if (!items.length)
    return (
      <EmptyState
        title="No newsletters yet"
        description={canWrite ? 'A short weekly letter keeps everyone in the loop. Members get it as a notification and by email.' : 'Your executive team’s weekly newsletters will collect here.'}
        action={canWrite ? <Button onClick={onWrite}>Write the first issue</Button> : undefined}
      />
    );
  const [latest, ...older] = items;
  return (
    <div>
      {canWrite && (
        <div className="mb-5 flex justify-end">
          <Button onClick={onWrite}>
            Write this week&apos;s issue
          </Button>
        </div>
      )}
      <button type="button" onClick={() => onOpen(latest)} className="group relative block w-full overflow-hidden rounded-[2px] border-l-4 border-red bg-navy p-6 text-left text-white transition-colors hover:bg-navy-2 sm:p-9">
        <div className="relative max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/70">
            <span className="h-[3px] w-5 bg-red" aria-hidden />
            Latest · Issue {items.length}
          </div>
          <h2 className="mt-3 text-2xl font-extrabold leading-tight text-white sm:text-3xl">{latest.title}</h2>
          <p className="mt-3 line-clamp-3 text-white/80">{excerpt(latest.body, 320)}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/75">
            <Avatar src={latest.author?.avatar_url} name={latest.author?.display_name} size="xs" ring />
            <span className="font-semibold text-white">{latest.author?.display_name ?? 'Former member'}</span>
            <span>{formatDate(latest.created_at)}</span>
            <span>{readingMinutes(latest.body)} min read</span>
          </div>
          <span className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-[2px] bg-white
 px-4 font-display text-sm font-semibold text-navy transition-transform group-hover:translate-x-0.5">
            Read the issue <ChevronRight className="size-4" />
          </span>
        </div>
      </button>

      {older.length > 0 && (
        <div className="mt-8">
          <SectionLabel>Past issues</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {older.map((p, i) => (
              <Card key={p.id} interactive padded={false}>
                <button type="button" onClick={() => onOpen(p)} className="flex h-full w-full flex-col p-5 text-left">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                    Issue {items.length - 1 - i} · {formatDate(p.created_at)}
                  </span>
                  <span className="mt-2 font-display text-base font-bold leading-snug text-heading">{p.title}</span>
                  <span className="mt-2 line-clamp-3 text-sm text-muted">{excerpt(p.body, 160)}</span>
                  <span className="mt-auto flex items-center gap-2 pt-4 text-xs text-muted">
                    <Avatar src={p.author?.avatar_url} name={p.author?.display_name} size="xs" />
                    {p.author?.display_name ?? 'Former member'} · {readingMinutes(p.body)} min
                  </span>
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
