import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { RedirectIfAuthed, RequireAuth, RequireProfile } from './lib/auth';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { RouteFallback, SplashScreen } from './components/layout/SplashScreen';

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
const Reset = page(() => import('./pages/auth/Reset'), 'Reset');
const UpdatePassword = page(() => import('./pages/auth/UpdatePassword'), 'UpdatePassword');
const Onboarding = page(() => import('./pages/auth/Onboarding'), 'Onboarding');
const NotFound = page(() => import('./pages/NotFound'), 'NotFound');

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
        <Route path="/chapter/join/:token" element={<JoinPage />} />
        {Gallery && <Route path="/dev/ui" element={<Gallery />} />}

        {/* signed in (owners may not have a student profile) */}
        <Route element={<RequireAuth />}>
          <Route path="/owner" element={<OwnerPage />} />
        </Route>

        {/* signed in + profile */}
        <Route element={<RequireProfile />}>
          <Route index element={<HomePage />} />
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

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
