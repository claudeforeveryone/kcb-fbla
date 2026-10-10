import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, History, ListRestart, RotateCcw } from 'lucide-react';
import { ButtonLink, EmptyState, ErrorState, Skeleton, SkeletonText } from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { ExamResults, fromContent, fromCustom, resultFromStored, type ExamQuestion, type ExamResultData } from '../../components/exam';
import { getAttempt, getProfile } from '../../api/core';
import { getCustomTest } from '../../api/play';
import { useProfile } from '../../lib/auth';
import { eventInfo, eventName, parseCustomQuestionId } from '../../lib/types';
import { questionsByIds } from './buildRun';
import { runHref } from './runLogic';

type Loaded = { data: ExamResultData; questions: ExamQuestion[]; ownerName: string | null; mine: boolean };

export default function ReviewPage() {
  const { attemptId = '' } = useParams();
  const me = useProfile();
  const [state, setState] = useState<{ s: 'loading' } | { s: 'missing' } | { s: 'error'; e: unknown } | { s: 'ok'; v: Loaded }>({
    s: 'loading',
  });

  const load = useCallback(async () => {
    setState({ s: 'loading' });
    try {
      const stored = await getAttempt(attemptId);
      if (!stored) return setState({ s: 'missing' });
      const { attempt, answers } = stored;
      const ids = answers.map((a) => a.question_id);
      const officialIds = ids.filter((id) => !id.startsWith('custom:'));
      const customIdx = ids.map(parseCustomQuestionId).filter((x): x is NonNullable<typeof x> => !!x);
      const [official, test, owner] = await Promise.all([
        questionsByIds(officialIds),
        customIdx.length ? getCustomTest(attempt.custom_test_id ?? customIdx[0].testId).catch(() => null) : Promise.resolve(null),
        attempt.user_id === me.id ? Promise.resolve(null) : getProfile(attempt.user_id).catch(() => null),
      ]);
      const questions: ExamQuestion[] = [
        ...official.map(fromContent),
        ...(test ? customIdx.filter((c) => test.questions[c.index]).map((c) => fromCustom(test.id, c.index, test.questions[c.index], test.event)) : []),
      ];
      setState({
        s: 'ok',
        v: {
          data: resultFromStored(attempt, answers, questions),
          questions,
          ownerName: owner ? owner.display_name : null,
          mine: attempt.user_id === me.id,
        },
      });
    } catch (e) {
      setState({ s: 'error', e });
    }
  }, [attemptId, me.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.s === 'loading')
    return (
      <div role="status" aria-label="Loading attempt">
        <div className="facets h-64 w-full" />
        <Page>
          <Skeleton className="mb-6 h-10 w-80" />
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="rounded-[4px] border border-line bg-surface p-4">
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        </Page>
      </div>
    );
  if (state.s === 'missing')
    return (
      <Page width="narrow">
        <EmptyState
          title="Attempt not found"
          description="It may have been deleted, or it belongs to someone whose results you can't see."
          action={
            <>
              <ButtonLink to="/me/career">Your career</ButtonLink>
              <ButtonLink to="/play" variant="outline">
                Play
              </ButtonLink>
            </>
          }
        />
      </Page>
    );
  if (state.s === 'error')
    return (
      <Page width="narrow">
        <ErrorState title="Couldn't load this attempt" error={state.e} onRetry={() => void load()} />
      </Page>
    );

  const { data, questions, ownerName, mine } = state.v;
  const missed = data.total - data.correct;
  const ev = eventInfo(data.event);
  const isChapter = data.kind === 'custom' || data.kind === 'assignment';
  return (
    <ExamResults
      data={data}
      questions={questions}
      animate={false}
      note={!mine ? `Viewing ${ownerName ?? 'a member'}'s attempt` : undefined}
      actions={
        mine ? (
          <>
            {missed > 0 && (
              <ButtonLink to={runHref({ redo: data.attemptId, only: 'wrong' })} variant="accent" leftIcon={<ListRestart className="size-4" />}>
                Redo {missed} missed
              </ButtonLink>
            )}
            {data.kind !== 'duel' && data.kind !== 'daily' && (
              <ButtonLink to={runHref({ redo: data.attemptId })} variant={missed ? 'outline' : 'accent'} leftIcon={<RotateCcw className="size-4" />}>
                Redo all {data.total}
              </ButtonLink>
            )}
            <ButtonLink
              to={isChapter ? '/play#assigned' : ev ? `/play/${ev.slug}` : '/play'}
              variant="outline"
              leftIcon={<ArrowLeft className="size-4" />}
            >
              {isChapter ? 'Assignments' : ev ? eventName(ev.slug) : 'Play'}
            </ButtonLink>
            <ButtonLink to="/me/career" variant="ghost" leftIcon={<History className="size-4" />}>
              Career
            </ButtonLink>
          </>
        ) : (
          <ButtonLink to="/chapter/admin" variant="outline" leftIcon={<ArrowLeft className="size-4" />}>
            Back to chapter
          </ButtonLink>
        )
      }
    />
  );
}
