// What "/" shows (App.tsx IndexRoute). Pure so every branch is unit tested: "/" used to sit behind RequireProfile, so
// a wrong answer here would hand a signed-out visitor the member Home (whose hooks need a profile) or hide Home from a
// member behind the landing.

export type IndexView = "landing" | "splash" | "onboarding" | "home";

export type IndexState = {
  /** auth is still restoring the session */
  loading: boolean;
  /** read once at the first render: no stored session and no sign-in link in the URL (mayHaveSession in src/lib/sessionHint.ts) */
  signedOutAtLoad: boolean;
  session: unknown | null;
  profile: unknown | null;
};

export function indexView({
  loading,
  signedOutAtLoad,
  session,
  profile,
}: IndexState): IndexView {
  // a first visit paints the landing at once; anyone who may be signed in waits on the splash instead of seeing it
  if (loading) return signedOutAtLoad ? "landing" : "splash";
  if (!session) return "landing";
  // the rule RequireProfile applies everywhere else
  if (!profile) return "onboarding";
  return "home";
}
