import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, errorMessage, useToast } from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { useAuth } from '../../lib/auth';
import { joinChapter, previewChapter } from '../../api/chapter';
import { BannedNotice, ChapterPreviewCard } from './components/admin-join';
import { useLoad } from './components/admin-shared';

export default function JoinPage() {
  const { token = '' } = useParams();
  const { loading, session, profile } = useAuth();
  const here = `/chapter/join/${encodeURIComponent(token)}`;

  if (loading) return <Shell><Skeleton className="h-80 w-full" rounded="rounded-[4px]" /></Shell>;

  if (!session) {
    const next = encodeURIComponent(here);
    return (
      <Shell>
        <Card className="border-t-4 border-t-red text-center">
          <h2 className="text-2xl font-extrabold">You've been invited to a chapter</h2>
          <p className="mx-auto mt-2 max-w-md text-muted">
            FBLA United is where your chapter practises for competition: official-style exams, Elo rankings, vocab and 1v1
            duels. Sign in or create a free account to see the chapter and join.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to={`/signup?next=${next}`} variant="accent" size="lg">
              Create account
            </ButtonLink>
            <ButtonLink to={`/login?next=${next}`} variant="secondary" size="lg">
              Sign in
            </ButtonLink>
          </div>
        </Card>
      </Shell>
    );
  }

  if (!profile) return <Navigate to={`/onboarding?next=${encodeURIComponent(here)}`} replace />;

  return (
    <Shell>
      <JoinFlow token={token} currentChapterId={profile.chapter_id} />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader eyebrow="Chapter invite" title="Join a chapter" size="sm" />
      <Page width="narrow">
        <div className="mx-auto max-w-lg">{children}</div>
      </Page>
    </>
  );
}

function JoinFlow({ token, currentChapterId }: { token: string; currentChapterId: string | null }) {
  const pv = useLoad(() => previewChapter(token), [token]);
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);

  if (pv.loading) return <Skeleton className="h-80 w-full" rounded="rounded-[4px]" />;
  if (pv.error) return <ErrorState error={pv.error} onRetry={() => void pv.reload()} />;
  const p = pv.data;
  if (!p)
    return (
      <EmptyState
        title="This invite doesn't work any more"
        description="The link may have been replaced with a new one. Ask your chapter for a fresh link, or enter their 6-character join code."
        action={<ButtonLink to="/chapter">Enter a join code</ButtonLink>}
      />
    );

  const inOther = currentChapterId != null && currentChapterId !== p.id;

  const join = async () => {
    setJoining(true);
    try {
      await joinChapter(token);
      await refreshProfile();
      toast.success(`Welcome to ${p.name}`, 'You start at 0 Elo on the chapter board. Time to climb.');
      navigate('/chapter', { replace: true });
    } catch (e) {
      toast.error('Could not join', errorMessage(e));
      void pv.reload();
    } finally {
      setJoining(false);
    }
  };

  return (
    <ChapterPreviewCard
      preview={p}
      footer={
        p.is_banned ? (
          <BannedNotice />
        ) : p.already_member ? (
          <ButtonLink to="/chapter" block rightIcon={<ArrowRight className="size-4" />}>
            You're already a member. Open chapter
          </ButtonLink>
        ) : inOther ? (
          <div className="space-y-3">
            <div className="rounded-[2px] border border-line border-l-4 border-l-warning bg-surface-2 p-3 text-sm text-ink" role="status">
              <span>
You're in another chapter. Leave it first (from your Chapter page), then come back to this link.</span>
            </div>
            <ButtonLink to="/chapter" variant="secondary" block>
              Go to my current chapter
            </ButtonLink>
          </div>
        ) : (
          <Button variant="accent" size="lg" block loading={joining} onClick={join} rightIcon={<ArrowRight className="size-5" />}>
            Join {p.name}
          </Button>
        )
      }
    />
  );
}
