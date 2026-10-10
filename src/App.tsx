import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation, Link } from 'react-router-dom';
import { useStore } from './state';
import { Shell } from './components/Shell';
import { Empty, Loading, Page } from './components/ui';
import Board from './pages/Board';
import Login from './pages/Login';

const Play = lazy(() => import('./pages/Play'));
const Run = lazy(() => import('./pages/Run'));
const Vocab = lazy(() => import('./pages/Vocab'));
const Words = lazy(() => import('./pages/Words'));
const Study = lazy(() => import('./pages/Study'));
const Me = lazy(() => import('./pages/Me'));
const Points = lazy(() => import('./pages/Points'));
const Compare = lazy(() => import('./pages/Compare'));
const Settings = lazy(() => import('./pages/Settings'));
const Duel = lazy(() => import('./pages/Duel'));

const TITLES: [RegExp, string][] = [
  [/^\/play\/run/, 'Session'], [/^\/play/, 'Play'], [/^\/vocab\/words/, 'My Words'], [/^\/vocab\/study/, 'Vocab round'],
  [/^\/vocab/, 'Vocab'], [/^\/me\/points/, 'Where the points go'], [/^\/me/, 'Me'], [/^\/u\//, 'Team profile'],
  [/^\/compare/, 'Compare'], [/^\/settings/, 'Settings'], [/^\/duel/, '1v1'],
];

export default function App() {
  const { phase } = useStore();
  const { pathname } = useLocation();
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Leaderboard';
    document.title = `${t} · KCB FBLA`;
  }, [pathname]);

  if (phase === 'boot') return <div className="bg-field min-h-dvh" aria-busy="true"><Loading label="Opening KCB FBLA" /></div>;
  if (phase === 'out') return <Login />;
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/play" element={<Play />} />
          <Route path="/play/run" element={<Run />} />
          <Route path="/vocab" element={<Vocab />} />
          <Route path="/vocab/words" element={<Words />} />
          <Route path="/vocab/study" element={<Study />} />
          <Route path="/me" element={<Me />} />
          <Route path="/me/points" element={<Points />} />
          <Route path="/u/:id" element={<Me />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/compare/:id" element={<Compare />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/duel" element={<Duel />} />
          <Route path="*" element={<Page><Empty title="Page not found" action={<Link className="btn" to="/">Back to the board</Link>} /></Page>} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
