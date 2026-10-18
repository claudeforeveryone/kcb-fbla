import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import {
  Button,
  ButtonLink,
  HeaderFigures,
  Modal,
  PageHeader,
  Skeleton,
  Tabs,
  tabPanelProps,
} from '../../components/ui';
import { useProfile } from '../../lib/auth';
import { isEventSlug } from '../../lib/types';
import { ChaptersBoard } from './ChaptersBoard';
import { PlayersBoard, type Scope } from './PlayersBoard';
import { fmt, ordinal, useMyStanding, type MyStanding } from './data';

type Tab = 'players' | 'chapters';

export default function LeaderboardPage() {
  const profile = useProfile();
  const [params, setParams] = useSearchParams();
  const [howOpen, setHowOpen] = useState(false);

  const tab: Tab = params.get('tab') === 'chapters' ? 'chapters' : 'players';
  const rawEvent = params.get('event');
  const event = isEventSlug(rawEvent) ? rawEvent : null;
  const scope: Scope = params.get('scope') === 'chapter' && profile.chapter_id ? 'chapter' : 'all';
  const query = params.get('q') ?? '';

  const patch = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) {
            if (v == null || v === '') p.delete(k);
            else p.set(k, v);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const me = { id: profile.id, chapter_id: profile.chapter_id };
  const overall = useMyStanding(null, null, me);
  const inChapter = useMyStanding(null, profile.chapter_id, profile.chapter_id ? me : null);

  return (
    <>
      <PageHeader
        eyebrow="Rankings"
        title="Leaderboard"
        subtitle="Every official question you answer moves your Elo. See where you stand against every FBLC United member and chapter."
        actions={
          <>
            <Button variant="inverse" onClick={() => setHowOpen(true)} leftIcon={<Info className="size-4" />}>
              How ranking works
            </Button>
            <ButtonLink to="/play" variant="accent">
              Practise
            </ButtonLink>
          </>
        }
      >
        <Standing elo={profile.elo} peak={profile.peak_elo} overall={overall} inChapter={profile.chapter_id ? inChapter : null} />
      </PageHeader>

      <Page>
        <Tabs<Tab>
          id="lb"
          aria-label="Leaderboard"
          className="mb-5"
          value={tab}
          onChange={(t) => patch({ tab: t === 'players' ? null : t })}
          items={[
            { value: 'players', label: 'Players' },
            { value: 'chapters', label: 'Chapters' },
          ]}
        />
        <div {...tabPanelProps('lb', tab)} className="outline-none">
          {tab === 'players' ? (
            <PlayersBoard
              me={me}
              event={event}
              onEvent={(e) => patch({ event: e })}
              scope={scope}
              onScope={(s) => patch({ scope: s === 'all' ? null : s })}
              query={query}
              onQuery={(q) => patch({ q })}
            />
          ) : (
            <ChaptersBoard myChapterId={profile.chapter_id} />
          )}
        </div>
      </Page>

      <HowRankingWorks open={howOpen} onClose={() => setHowOpen(false)} />
    </>
  );
}

/** Your standing, as the header's figures. */
function Standing({ elo, peak, overall, inChapter }: { elo: number; peak: number; overall: MyStanding; inChapter: MyStanding | null }) {
  return (
    <HeaderFigures
      items={[
        { label: 'Overall', value: <RankValue standing={overall} /> },
        ...(inChapter ? [{ label: 'In your chapter', value: <RankValue standing={inChapter} /> }] : []),
        {
          label: 'Elo',
          value: (
            <>
              {fmt.format(Math.round(elo))}
              <span className="text-sm font-semibold text-muted"> peak {fmt.format(Math.round(Math.max(peak, elo)))}</span>
            </>
          ),
        },
      ]}
    />
  );
}

function RankValue({ standing }: { standing: MyStanding }) {
  if (standing.status === 'loading') return <Skeleton className="h-6 w-20" />;
  if (standing.status !== 'ranked') return <span className="text-muted">Unranked</span>;
  const r = standing.row;
  return (
    <>
      {ordinal(r.rank)}
      <span className="text-sm font-semibold text-muted"> of {fmt.format(r.total_count)}</span>
    </>
  );
}

function HowRankingWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How ranking works"
      description="One rating for every member, earned one question at a time."
      footer={
        <ButtonLink to="/play" variant="primary" onClick={onClose}>
          Start practising
        </ButtonLink>
      }
    >
      <div className="space-y-5 text-sm leading-relaxed text-ink">
        <section>
          <h3 className="mb-1.5 font-display text-base font-bold text-heading">Elo</h3>
          <ul className="list-disc space-y-1 pl-5 marker:text-red">
            <li>Everyone starts at 0. Each official question you answer nudges your Elo up or down.</li>
            <li>
              Harder questions are worth more: getting a hard one right gains more than an easy one, and missing an easy
              one costs more than missing a hard one.
            </li>
            <li>Only your first answer to each question counts. Repeats, and questions whose answer you saw first, leave your Elo unchanged, so grinding the same paper does nothing.</li>
            <li>Chapter custom tests and Arena duels do not change your Elo.</li>
          </ul>
        </section>
        <section>
          <h3 className="mb-1.5 font-display text-base font-bold text-heading">Boards</h3>
          <ul className="list-disc space-y-1 pl-5 marker:text-red">
            <li>The players board ranks everyone by overall Elo. Ties go to whoever has answered more questions.</li>
            <li>Pick an event to rank players by the Elo they have gained from that event's questions alone.</li>
            <li>Chapters are ranked by the total Elo of all their members, so every member's practice counts.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
