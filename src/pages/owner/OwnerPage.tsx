// /owner: the owner console, for platform owners only. The route is lazy (its own chunk) and guarded by the
// server's answer to is_platform_owner(); every RPC behind it checks ownership again, so this guard only decides
// what to render. Anyone else gets a plain "not available" page with no data and no hints.
import { useEffect } from 'react';
import { ButtonLink } from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { RouteFallback } from '../../components/layout/SplashScreen';
import {
  ownerAuditSearch,
  ownerContent,
  ownerEngagement,
  ownerFeedbackList,
  ownerFeedbackUpdate,
  ownerGrowth,
  ownerOverview,
  ownerPreparation,
  ownerQuestion,
  ownerSetChapterBan,
  ownerSetChapterRole,
  ownerSupportEmail,
  ownerUserSearch,
} from '../../api/owner';
import { useIsOwner } from '../../lib/useIsOwner';
import { OwnerConsole } from './OwnerConsole';
import type { OwnerSource } from './shared';

const live: OwnerSource = {
  overview: ownerOverview,
  growth: ownerGrowth,
  engagement: ownerEngagement,
  preparation: ownerPreparation,
  content: ownerContent,
  question: ownerQuestion,
  feedbackList: ownerFeedbackList,
  feedbackUpdate: ownerFeedbackUpdate,
  auditSearch: ownerAuditSearch,
  userSearch: (q) => ownerUserSearch(q),
  supportEmail: ownerSupportEmail,
  setChapterBan: ownerSetChapterBan,
  setChapterRole: ownerSetChapterRole,
};

export function OwnerPage() {
  const state = useIsOwner();
  useEffect(() => {
    document.title = state === 'owner' ? 'Owner console · FBLC' : 'Not available · FBLC';
  }, [state]);
  if (state === 'loading') return <RouteFallback />;
  if (state === 'denied') return <NotAuthorized />;
  return (
    <Page>
      <OwnerConsole source={live} />
    </Page>
  );
}

export function NotAuthorized() {
  return (
    <Page width="narrow">
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-bold">This page isn't available</h1>
        <p className="mt-2 text-muted">It's only open to the people who run the site.</p>
        <ButtonLink to="/" variant="primary" className="mt-6">
          Back to home
        </ButtonLink>
      </div>
    </Page>
  );
}

export default OwnerPage;
