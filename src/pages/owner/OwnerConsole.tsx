// The owner console shell: header, section tabs and the time range. Section and range live in the URL
// (?tab=growth&range=90) so a view can be bookmarked or shared between owners.
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button, SegmentedControl, Tabs, tabPanelProps } from '../../components/ui';
import { clampRange, RANGES, type RangeDays } from '../../lib/owner';
import { AuditLog } from './AuditLog';
import { FeedbackTriage } from './FeedbackTriage';
import { ContentSection, EngagementSection, GrowthSection, OverviewSection, PreparationSection } from './sections';
import { OwnerSourceProvider, type OwnerSource } from './shared';
import { UsersAdmin } from './UsersAdmin';

type SectionId = 'overview' | 'growth' | 'engagement' | 'preparation' | 'content' | 'feedback' | 'audit' | 'users';

const SECTIONS: { value: SectionId; label: string; ranged?: boolean; blurb: string }[] = [
  { value: 'overview', label: 'Overview', blurb: 'Accounts and activity right now.' },
  { value: 'growth', label: 'Growth', ranged: true, blurb: 'Sign-ups and active students over time.' },
  { value: 'engagement', label: 'Engagement', ranged: true, blurb: 'Which features students use.' },
  { value: 'preparation', label: 'Preparation', ranged: true, blurb: 'How students do in each event.' },
  { value: 'content', label: 'Content', blurb: 'Question bank health and reported questions.' },
  { value: 'feedback', label: 'Feedback', blurb: 'Reports from students, to triage.' },
  { value: 'audit', label: 'Audit log', blurb: 'Every sensitive change, who made it and why.' },
  { value: 'users', label: 'Users', blurb: 'Find a student and take a safe action.' },
];

const RANGE_LABELS: Record<RangeDays, string> = { 7: '7 days', 30: '30 days', 90: '90 days', 365: '12 months' };

const timeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' });

export function OwnerConsole({ source }: { source: OwnerSource }) {
  const [params, setParams] = useSearchParams();
  const tab = SECTIONS.find((s) => s.value === params.get('tab'))?.value ?? 'overview';
  const range = clampRange(params.get('range'));
  const [refreshKey, setRefreshKey] = useState(0);
  // When the data on screen arrived, not when a button was pressed. Hidden while the last load failed.
  const [loaded, setLoaded] = useState<{ at: Date | null; failed: boolean }>({ at: null, failed: false });
  const onLoad = useCallback((ok: boolean) => setLoaded((l) => (ok ? { at: new Date(), failed: false } : { ...l, failed: true })), []);
  const section = SECTIONS.find((s) => s.value === tab)!;

  const set = (next: { tab?: SectionId; range?: RangeDays }) => {
    const p = new URLSearchParams(params);
    if (next.tab) p.set('tab', next.tab);
    if (next.range) p.set('range', String(next.range));
    setParams(p, { replace: true });
  };

  return (
    <OwnerSourceProvider source={source} onLoad={onLoad}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-3xl">Owner console</h1>
          <p className="mt-1 text-sm text-muted">FBLA site health. Metrics are totals, with small groups hidden. Times are Toronto.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted" aria-live="polite">
            {loaded.at && !loaded.failed ? `Updated ${timeFmt.format(loaded.at)}` : ''}
          </span>
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="size-3.5" />} onClick={() => setRefreshKey((k) => k + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      <Tabs
        id="owner"
        aria-label="Owner console sections"
        className="mt-5"
        items={SECTIONS.map((s) => ({ value: s.value, label: s.label }))}
        value={tab}
        onChange={(v) => set({ tab: v })}
      />

      <div {...tabPanelProps('owner', tab)} className="pt-5 outline-none">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-heading">{section.blurb}</p>
          {section.ranged && (
            <SegmentedControl
              size="sm"
              aria-label="Time range"
              value={range}
              onChange={(v) => set({ range: v })}
              options={RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
            />
          )}
        </div>
        {tab === 'overview' && <OverviewSection refreshKey={refreshKey} />}
        {tab === 'growth' && <GrowthSection days={range} refreshKey={refreshKey} />}
        {tab === 'engagement' && <EngagementSection days={range} refreshKey={refreshKey} />}
        {tab === 'preparation' && <PreparationSection days={range} refreshKey={refreshKey} />}
        {tab === 'content' && <ContentSection refreshKey={refreshKey} />}
        {tab === 'feedback' && <FeedbackTriage refreshKey={refreshKey} />}
        {tab === 'audit' && <AuditLog refreshKey={refreshKey} />}
        {tab === 'users' && <UsersAdmin refreshKey={refreshKey} />}
      </div>
    </OwnerSourceProvider>
  );
}
