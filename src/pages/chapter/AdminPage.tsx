import { Navigate, useSearchParams } from 'react-router-dom';
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonCards,
  Tabs,
  tabPanelProps,
  type TabItem,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { isAdminRole } from '../../lib/types';
import { getMyChapter, listBans, listMembers, listTrainers, type MyChapter } from '../../api/chapter';
import { useLoad } from './components/admin-shared';
import { MembersPanel } from './components/admin-members';
import { TrainersPanel } from './components/admin-trainers';
import { AttendancePanel } from './components/admin-attendance';
import { AnalyticsPanel } from './components/admin-analytics';
import { SettingsPanel } from './components/admin-settings';

type Tab = 'members' | 'trainers' | 'attendance' | 'analytics' | 'settings';
const TABS: Tab[] = ['members', 'trainers', 'attendance', 'analytics', 'settings'];

export default function AdminPage() {
  const ctx = useLoad(() => getMyChapter(), []);

  if (ctx.loading && !ctx.data)
    return (
      <>
        <PageHeader eyebrow="Chapter admin" title={<Skeleton className="h-10 w-64 bg-white/15" />} />
        <Page>
          <SkeletonCards count={3} />
        </Page>
      </>
    );
  if (ctx.error)
    return (
      <>
        <PageHeader eyebrow="Chapter admin" title="Admin" />
        <Page>
          <ErrorState error={ctx.error} onRetry={() => void ctx.reload()} />
        </Page>
      </>
    );
  if (!ctx.data) return <Navigate to="/chapter" replace />;
  if (!isAdminRole(ctx.data.membership.role))
    return (
      <>
        <PageHeader eyebrow="Chapter admin" title={ctx.data.chapter.name} back={{ to: '/chapter', label: 'Chapter' }} />
        <Page>
          <EmptyState
            title="Presidents and executives only"
            description="The admin dashboard manages members, roles, attendance and trainers. Ask your president if you need access."
            action={<ButtonLink to="/chapter">Back to chapter</ButtonLink>}
          />
        </Page>
      </>
    );
  return <Dashboard ctx={ctx.data} reloadCtx={() => void ctx.reload()} setCtx={(c) => ctx.setData(() => c)} />;
}

function Dashboard({ ctx, reloadCtx, setCtx }: { ctx: MyChapter; reloadCtx: () => void; setCtx: (c: MyChapter) => void }) {
  const { chapter, membership } = ctx;
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'members';
  const setTab = (t: Tab) => setParams(t === 'members' ? {} : { tab: t }, { replace: true });

  const members = useLoad(() => listMembers(chapter.id), [chapter.id]);
  const trainers = useLoad(() => listTrainers(chapter.id), [chapter.id]);
  const bans = useLoad(() => listBans(chapter.id), [chapter.id]);

  const refreshPeople = () => {
    void members.reload();
    void trainers.reload();
    void bans.reload();
  };

  const items: TabItem<Tab>[] = [
    { value: 'members', label: 'Members', count: members.data?.length },
    { value: 'trainers', label: 'Trainers' },
    { value: 'attendance', label: 'Attendance' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'settings', label: 'Settings' },
  ];

  return (
    <>
      <PageHeader
        eyebrow={membership.role === 'president' ? 'President dashboard' : 'Executive dashboard'}
        title={chapter.name}
        subtitle="Members, roles, trainers and attendance."
        back={{ to: '/chapter', label: 'Chapter' }}
        actions={
          <ButtonLink to="/chapter/classroom" variant="inverse">
            Classroom
          </ButtonLink>
        }
      />
      <div className="sticky top-16 z-20 border-b border-line bg-bg">
        <div className="mx-auto max-w-[1440px] lg:px-10 px-4 sm:px-6">
          <Tabs id="admin" items={items} value={tab} onChange={setTab} aria-label="Admin sections" className="border-b-0" />
        </div>
      </div>
      <Page>
        <div {...tabPanelProps('admin', tab)} className="outline-none">
          {tab === 'members' && (
            <MembersPanel
              chapterId={chapter.id}
              chapterName={chapter.name}
              myId={membership.user_id}
              myRole={membership.role}
              members={members.data}
              bans={bans.data}
              loading={members.loading || bans.loading}
              onChanged={refreshPeople}
            />
          )}
          {tab === 'trainers' && (
            <TrainersPanel
              chapterId={chapter.id}
              members={members.data}
              trainers={trainers.data}
              loading={members.loading || trainers.loading}
              onChanged={refreshPeople}
            />
          )}
          {tab === 'attendance' && <AttendancePanel chapterId={chapter.id} members={members.data} />}
          {tab === 'analytics' && <AnalyticsPanel chapterId={chapter.id} />}
          {tab === 'settings' && (
            <SettingsPanel
              chapter={chapter}
              myId={membership.user_id}
              myRole={membership.role}
              members={members.data}
              onSaved={(c) => setCtx({ ...ctx, chapter: c })}
              onTransferred={() => {
                reloadCtx();
                refreshPeople();
              }}
            />
          )}
        </div>
      </Page>
    </>
  );
}
