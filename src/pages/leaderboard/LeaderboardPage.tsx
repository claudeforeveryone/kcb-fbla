import { useCallback, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Flag, Info, Swords, Trophy } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import {
  Button,
  ButtonLink,
  EloBadge,
  Modal,
  PageHeader,
  Skeleton,
  TIERS,
  TierGem,
  Tabs,
  tabPanelProps,
  tierFor,
  tierProgress,
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
        subtitle="Every official question you answer moves your Elo. See where you stand against every FBLA member and chapter."
        actions={
          <>
            <Button variant="inverse" onClick={() => setHowOpen(true)} leftIcon={<Info className="size-4" />}>
              How ranking works
            </Button>
            <ButtonLink to="/play" variant="accent" leftIcon={<Swords className="size-4" />}>
              Climb the board
            </ButtonLink>
          </>
        }
      >
        <Standing elo={profile.elo} overall={overall} inChapter={profile.chapter_id ? inChapter : null} />
      </PageHeader>

      <Page>
        <Tabs<Tab>
          id="lb"
          aria-label="Leaderboard"
          className="mb-5"
          value={tab}
          onChange={(t) => patch({ tab: t === 'players' ? null : t })}
          items={[
            { value: 'players', label: 'Players', icon: <Trophy /> },
            { value: 'chapters', label: 'Chapters', icon: <Flag /> },
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

/** "Your standing" strip inside the navy header. */
function Standing({ elo, overall, inChapter }: { elo: number; overall: MyStanding; inChapter: MyStanding | null }) {
  const tier = tierFor(elo);
  const next = tier.next != null ? TIERS.find((t) => t.min === tier.next) : undefined;
  const progress = tierProgress(elo);
  return (
    <div className={inChapter ? 'grid grid-cols-2 gap-2 lg:max-w-4xl lg:grid-cols-[1fr_1fr_1.5fr]' : 'grid grid-cols-2 gap-2 lg:max-w-2xl lg:grid-cols-[1fr_1.5fr]'}>
      <Chip label="Overall rank">
        <RankValue standing={overall} />
      </Chip>
      {inChapter && (
        <Chip label="In my chapter">
          <RankValue standing={inChapter} />
        </Chip>
      )}
      <Chip label="Your Elo" wide={!!inChapter}>
        <div className="flex items-center gap-3">
          <EloBadge elo={elo} onDark size="md" />
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${Math.round(progress * 100)}%`, background: `linear-gradient(90deg, ${tier.from}, ${tier.to})` }}
              />
            </div>
            <p className="mt-1 truncate text-[11px] text-white/70">
              {next ? `${fmt.format(next.min - Math.round(elo))} to ${next.name}` : 'Top tier reached'}
            </p>
          </div>
        </div>
      </Chip>
    </div>
  );
}

function Chip({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`rounded-xl bg-white/[0.08] px-3.5 py-2.5 ring-1 ring-inset ring-white/15 backdrop-blur-sm ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">{label}</div>
      {children}
    </div>
  );
}

function RankValue({ standing }: { standing: MyStanding }) {
  if (standing.status === 'loading') return <Skeleton className="h-7 w-24 opacity-30" />;
  if (standing.status !== 'ranked') return <span className="font-display text-xl font-bold text-white/80">Unranked</span>;
  const r = standing.row;
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="tabular font-display text-2xl font-extrabold text-white">{ordinal(r.rank)}</span>
      <span className="tabular text-sm text-white/65">of {fmt.format(r.total_count)}</span>
    </span>
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
            <li>The first time you see a question counts fully. Repeats count about a third as much, so grinding the same paper only goes so far.</li>
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
        <section>
          <h3 className="mb-2 font-display text-base font-bold text-heading">Tiers</h3>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TIERS.map((t) => (
              <li key={t.name} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2">
                <TierGem elo={t.min} size={22} />
                <span className="min-w-0">
                  <span className="block font-display text-sm font-bold" style={{ color: t.ink }}>
                    <span className="dark:text-white">{t.name}</span>
                  </span>
                  <span className="tabular block text-xs text-muted">{t.next != null ? `${t.min} to ${t.next - 1}` : `${t.min}+`}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Modal>
  );
}
