import { lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { RedirectIfAuthed, RequireAuth, RequireProfile, useAuth } from './lib/auth';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { RouteFallback, SplashScreen } from './components/layout/SplashScreen';
// The signed-out front door's stylesheet is part of the app's own CSS: the prerendered "/" is styled before any script
// runs. Its code is a lazy chunk (below), so members never download it.
import './pages/landing/observatory.css';
import { indexView } from './pages/landing/indexView';
import { loadLandingPage } from './pages/landing/loadLanding';
import { mayHaveSession } from './lib/sessionHint';

/** Lazy page that accepts either a default export or a named export matching `name`. */
function page(loader: () => Promise<Record<string, unknown>>, name: string) {
  return lazy(async () => {
    const m = await loader();
    return { default: (m.default ?? m[name]) as ComponentType };
  });
}

// auth (foundation)
const Login = page(() => import('./pages/auth/Login'), 'Login');
const Signup = page(() => import('./pages/auth/Signup'), 'Signup');
// legal (public, prerendered at build time like login and signup)
const Terms = page(() => import('./pages/legal/Terms'), 'Terms');
const Privacy = page(() => import('./pages/legal/Privacy'), 'Privacy');
const Reset = page(() => import('./pages/auth/Reset'), 'Reset');
const UpdatePassword = page(() => import('./pages/auth/UpdatePassword'), 'UpdatePassword');
const Onboarding = page(() => import('./pages/auth/Onboarding'), 'Onboarding');
const NotFound = page(() => import('./pages/NotFound'), 'NotFound');
// Signed-out "/". A visitor with no session gets it prerendered and hydrated (main.tsx): the HTML stays on screen while
// this chunk loads (after the first paint, loadLanding.ts), and nothing inside it changes before it hydrates (auth sets
// the same signed-out values it started with). Rendered fresh, it shows the route fallback for that moment.
const LandingPage = lazy(loadLandingPage);

// features
const HomePage = page(() => import('./pages/home/HomePage'), 'HomePage');
const LeaderboardPage = page(() => import('./pages/leaderboard/LeaderboardPage'), 'LeaderboardPage');
const PlayPage = page(() => import('./pages/play/PlayPage'), 'PlayPage');
const EventPage = page(() => import('./pages/play/EventPage'), 'EventPage');
const RunPage = page(() => import('./pages/play/RunPage'), 'RunPage');
const ReviewPage = page(() => import('./pages/play/ReviewPage'), 'ReviewPage');
const VocabPage = page(() => import('./pages/vocab/VocabPage'), 'VocabPage');
const DeckPage = page(() => import('./pages/vocab/DeckPage'), 'DeckPage');
const ArenaPage = page(() => import('./pages/arena/ArenaPage'), 'ArenaPage');
const DuelPage = page(() => import('./pages/arena/DuelPage'), 'DuelPage');
const ChapterPage = page(() => import('./pages/chapter/ChapterPage'), 'ChapterPage');
const JoinPage = page(() => import('./pages/chapter/JoinPage'), 'JoinPage');
const CreatePage = page(() => import('./pages/chapter/CreatePage'), 'CreatePage');
const AdminPage = page(() => import('./pages/chapter/AdminPage'), 'AdminPage');
const MemberPage = page(() => import('./pages/chapter/MemberPage'), 'MemberPage');
const ClassroomPage = page(() => import('./pages/chapter/ClassroomPage'), 'ClassroomPage');
const TestEditorPage = page(() => import('./pages/chapter/TestEditorPage'), 'TestEditorPage');
const ProfilePage = page(() => import('./pages/me/ProfilePage'), 'ProfilePage');
const CareerPage = page(() => import('./pages/me/CareerPage'), 'CareerPage');
const SettingsPage = page(() => import('./pages/me/SettingsPage'), 'SettingsPage');
const NotificationsPage = page(() => import('./pages/notifications/NotificationsPage'), 'NotificationsPage');
// Owner console: its own chunk; the page asks the server whether the viewer is an owner before showing anything.
const OwnerPage = page(() => import('./pages/owner/OwnerPage'), 'OwnerPage');

// Dev-only component gallery (tree-shaken from production builds).
const Gallery = import.meta.env.DEV ? page(() => import('./components/ui/Gallery'), 'Gallery') : null;

/**
 * "/": signed-out visitors get the landing; signed-in members with a profile get Home; a session without a profile
 * goes to onboarding (the rule RequireProfile applies everywhere else).
 */
function IndexRoute() {
  const { loading, session, profile } = useAuth();
  const loc = useLocation();
  // A first visit (no stored session, no sign-in link in the URL) gets the landing at once, not a splash first. The
  // same rule main.tsx uses to decide whether to hydrate the prerendered page, so the two never disagree.
  const [signedOutAtLoad] = useState(() => !mayHaveSession());
  switch (indexView({ loading, signedOutAtLoad, session, profile })) {
    case 'landing':
      return <LandingPage />;
    case 'splash':
      return <SplashScreen />;
    case 'onboarding':
      return <Navigate to={`/onboarding?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
    case 'home':
      return <HomePage />;
  }
}

/** Full-screen pages (auth): splash while the chunk loads. */
function Bare({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<SplashScreen />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/** Pages inside the app chrome: the shell stays put while the chunk loads. */
function ShellLayout() {
  const { pathname } = useLocation();
  return (
    <AppShell>
      <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      {/* auth */}
      <Route path="/login" element={<Bare><RedirectIfAuthed><Login /></RedirectIfAuthed></Bare>} />
      <Route path="/signup" element={<Bare><RedirectIfAuthed><Signup /></RedirectIfAuthed></Bare>} />
      <Route path="/reset" element={<Bare><Reset /></Bare>} />
      <Route path="/reset/update" element={<Bare><UpdatePassword /></Bare>} />
      <Route path="/onboarding" element={<Bare><RequireAuth><Onboarding /></RequireAuth></Bare>} />

      <Route element={<ShellLayout />}>
        {/* public inside the shell */}
        <Route index element={<IndexRoute />} />
        <Route path="/chapter/join/:token" element={<JoinPage />} />
        {Gallery && <Route path="/dev/ui" element={<Gallery />} />}

        {/* signed in (owners may not have a student profile) */}
        <Route element={<RequireAuth />}>
          <Route path="/owner" element={<OwnerPage />} />
        </Route>

        {/* signed in + profile */}
        <Route element={<RequireProfile />}>
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/play/run" element={<RunPage />} />
          <Route path="/play/review/:attemptId" element={<ReviewPage />} />
          <Route path="/play/:event" element={<EventPage />} />
          <Route path="/vocab" element={<VocabPage />} />
          <Route path="/vocab/:event" element={<DeckPage />} />
          <Route path="/arena" element={<ArenaPage />} />
          <Route path="/arena/:duelId" element={<DuelPage />} />
          <Route path="/chapter" element={<ChapterPage />} />
          <Route path="/chapter/new" element={<CreatePage />} />
          <Route path="/chapter/admin" element={<AdminPage />} />
          <Route path="/chapter/member/:userId" element={<MemberPage />} />
          <Route path="/chapter/classroom" element={<ClassroomPage />} />
          <Route path="/chapter/tests/:testId/edit" element={<TestEditorPage />} />
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/me/career" element={<CareerPage />} />
          <Route path="/me/settings" element={<SettingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>

        {/* public legal pages */}
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
