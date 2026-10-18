import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, ChevronDown, Gauge, LogOut, MessageSquare, Moon, Settings, Sun, UserRound, WifiOff } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useIsOwner } from '../../lib/useIsOwner';
import { Avatar } from '../ui/Avatar';
import { buttonClasses } from '../ui/Button';
import { Dropdown, type DropdownItem } from '../ui/Dropdown';
import { EloBadge } from '../ui/EloBadge';
import { cn } from '../ui/cn';
import { useToast } from '../ui/Toast';
import { useHydrated } from '../../lib/hydration';
import { returnPathAfterAuth } from '../../lib/seo';
import { Brand } from './Brand';
import { NAV } from './nav';
import { useTheme, type ThemePref } from './theme';
import { Footer } from './Footer';

// Members only (the bar shows it once signed in with a profile), and it brings the notifications API and with it the
// Supabase client: a lazy chunk, so the first-load chunk every visitor downloads stays without them (loadSupabase.ts).
// No error boundary sits above the top bar, so a chunk that cannot be fetched (offline before it was cached, a deploy
// that replaced it) means no bell for this visit, never a broken page.
const NotificationBell = lazy(
  (): Promise<{ default: ComponentType }> =>
    import('../notifications/NotificationBell').then(
      (m) => ({ default: m.NotificationBell }),
      () => ({ default: () => null }),
    ),
);

// Send feedback is opened from the user menu only, and its API brings the Supabase client: a lazy chunk fetched on the
// first open, so the first-load chunk stays without the client (loadSupabase.ts, firstLoad.test.ts). A chunk that
// cannot be fetched means no dialog this time, never a broken page.
const FeedbackDialog = lazy(
  (): Promise<{ default: ComponentType<{ open: boolean; onClose: () => void }> }> =>
    import('../feedback/FeedbackDialog').then(
      (m) => ({ default: m.FeedbackDialog }),
      () => ({ default: () => null }),
    ),
);

/** App chrome: navy top bar, page outlet, footer, and the phone bottom tab bar. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { session, profile } = useAuth();
  const { pathname } = useLocation();
  const signedIn = !!session && !!profile;

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop pathname={pathname} />
      <a
        href="#main"
        className="sr-only z-[200] rounded-[2px] bg-white px-3 py-2 font-semibold text-navy focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <TopBar signedIn={signedIn} pathname={pathname} />
      <OfflineBanner />
      <main id="main" className={cn('flex-1', signedIn && 'pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0')}>
        {children ?? <Outlet />}
      </main>
      <Footer className={signedIn ? 'mb-[calc(64px+env(safe-area-inset-bottom))] md:mb-0' : undefined} />
      {signedIn && <BottomTabs pathname={pathname} />}
    </div>
  );
}

/**
 * New page: start at the top (keep position for in-page hash links). Not when the shell first hydrates a prerendered
 * page: the visitor may already have scrolled it while the app was loading, and the browser has placed a fresh load.
 * A shell mounted by in-app navigation (say from /login) still resets, since it inherits the last page's scroll.
 */
function ScrollToTop({ pathname }: { pathname: string }) {
  const hydrated = useHydrated(); // false only during hydration
  const skip = useRef(!hydrated);
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

function TopBar({ signedIn, pathname }: { signedIn: boolean; pathname: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-black/20 bg-bar text-white">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Brand size="md" className="shrink-0" wordmarkClassName="md:hidden lg:flex" />
        {signedIn && (
          <nav aria-label="Main" className="ml-2 hidden h-full flex-1 items-stretch md:flex lg:ml-8">
            {NAV.map((n) => {
              const active = n.match(pathname);
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center px-2.5 font-display text-[0.9375rem] font-semibold transition-colors duration-150 lg:px-3.5',
                    active ? 'text-white' : 'text-white/65 hover:text-white',
                  )}
                >
                  {n.label}
                  <span
                    className={cn(
                      'absolute inset-x-2.5 bottom-0 h-[3px] origin-left transition-[scale,background-color] duration-200 ease-out lg:inset-x-3.5',
                      active ? 'bg-red' : 'scale-x-0 bg-white/50 group-hover:scale-x-100',
                    )}
                    aria-hidden
                  />
                </NavLink>
              );
            })}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {signedIn ? (
            <>
              {/* the same 40 px as the bell's button, so nothing moves when it arrives */}
              <Suspense fallback={<span className="size-10" aria-hidden="true" />}>
                <NotificationBell />
              </Suspense>
              <UserMenu />
            </>
          ) : (
            <SignedOutActions pathname={pathname} />
          )}
        </div>
      </div>
    </header>
  );
}

function SignedOutActions({ pathname }: { pathname: string }) {
  const { loading, session } = useAuth();
  // Bring the visitor back only to an app page (a chapter invite); from Terms, Privacy or a 404 they land on home.
  const back = returnPathAfterAuth(pathname);
  const next = back ? `?next=${encodeURIComponent(back)}` : '';
  // A stored session is still being checked: offering "Sign in" to someone who is signed in would be wrong.
  if (loading) return null;
  if (session)
    return (
      <>
        <Link to="/onboarding" className={buttonClasses('accent', 'sm')}>
          Finish setup
        </Link>
        <SessionMenu />
      </>
    );
  return (
    <>
      <Link to={`/login${next}`} className={buttonClasses('ghost', 'sm', 'text-white hover:bg-white/10')}>
        Sign in
      </Link>
      <Link to={`/signup${next}`} className={buttonClasses('accent', 'sm')}>
        Join free
      </Link>
    </>
  );
}

/**
 * Signed in without a student profile (sign-up not finished, or an owner account that never made one): no profile
 * to show, but the owner console and signing out still need a way in.
 */
function SessionMenu() {
  const { signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const owner = useIsOwner() === 'owner';
  const items: DropdownItem[] = [
    ...(owner ? ([{ label: 'Owner console', icon: <Gauge />, to: '/owner' }, { type: 'separator' }] satisfies DropdownItem[]) : []),
    {
      label: 'Sign out',
      icon: <LogOut />,
      danger: true,
      onSelect: async () => {
        await signOut();
        toast.info('Signed out');
        navigate('/login', { replace: true });
      },
    },
  ];
  return (
    <Dropdown
      width="w-56"
      items={items}
      trigger={({ open, ...props }) => (
        <button
          type="button"
          {...props}
          aria-label="Account menu"
          className={cn(
            'flex h-9 items-center gap-1 rounded-[2px] px-1.5 text-white/85 transition-colors hover:bg-white/10 hover:text-white',
            open && 'bg-white/10 text-white',
          )}
        >
          <UserRound className="size-5" />
          <ChevronDown className={cn('size-4 text-white/70 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      )}
    />
  );
}

const themeOptions: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

function UserMenu() {
  const { profile, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const owner = useIsOwner() === 'owner';
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // mounted from the first open on, so its chunk loads only for someone who uses it, and closing still animates
  const [feedbackUsed, setFeedbackUsed] = useState(false);
  if (!profile) return null;

  return (
    <>
    {feedbackUsed && (
      <Suspense fallback={null}>
        <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      </Suspense>
    )}
    <Dropdown
      width="w-72"
      header={
        <Link
          to="/me"
          className="mb-1 flex items-center gap-3 rounded-[2px] p-2.5 transition-colors hover:bg-surface-2"
        >
          <Avatar src={profile.avatar_url} name={profile.display_name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display font-bold text-heading">{profile.display_name}</div>
            <div className="truncate text-xs text-muted">@{profile.username}</div>
          </div>
          <EloBadge elo={profile.elo} size="sm" />
        </Link>
      }
      items={[
        { type: 'separator' },
        { label: 'Profile', icon: <UserRound />, to: '/me' },
        { label: 'Career', icon: <BarChart3 />, to: '/me/career' },
        { label: 'Settings', icon: <Settings />, to: '/me/settings' },
        { label: 'Send feedback', icon: <MessageSquare />, onSelect: () => {
            setFeedbackUsed(true);
            setFeedbackOpen(true);
          } },
        ...(owner ? [{ label: 'Owner console', icon: <Gauge />, to: '/owner' }] : []),
        { type: 'separator' },
        {
          type: 'custom',
          render: (
            <div className="px-2.5 py-1.5">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">Theme</div>
              <div className="grid grid-cols-3 gap-0 rounded-[2px] bg-surface-2 p-0.5 ring-1 ring-inset ring-line" role="radiogroup" aria-label="Theme">
                {themeOptions.map((o) => {
                  const Icon = o.icon;
                  const active = theme === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTheme(o.value)}
                      className={cn(
                        'flex h-8 items-center justify-center gap-1.5 rounded-[2px] text-xs font-semibold transition-colors',
                        active ? 'bg-navy text-white dark:bg-blue' : 'text-muted hover:text-ink',
                      )}
                    >
                      <Icon className="size-3.5" />
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ),
        },
        { type: 'separator' },
        {
          label: 'Sign out',
          icon: <LogOut />,
          danger: true,
          onSelect: async () => {
            await signOut();
            toast.info('Signed out');
            navigate('/login', { replace: true });
          },
        },
      ]}
      trigger={({ open, ...props }) => (
        <button
          type="button"
          {...props}
          aria-label="Account menu"
          className={cn(
            'flex items-center gap-1 rounded-[2px] p-0.5 pr-1.5 transition-colors hover:bg-white/10',
            open && 'bg-white/10',
          )}
        >
          <Avatar src={profile.avatar_url} name={profile.display_name} size="sm" className="ring-1 ring-white/25" />
          <ChevronDown className={cn('size-4 text-white/70 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      )}
    />
    </>
  );
}

function BottomTabs({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-7">
        {NAV.map((n) => {
          const active = n.match(pathname);
          const Icon = n.icon;
          return (
            <li key={n.to} className="relative">
              <NavLink
                to={n.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition-colors',
                  active ? 'text-heading' : 'text-muted',
                )}
              >
                <span
                  className={cn(
                    'absolute inset-x-3 top-0 h-[3px] transition-colors',
                    active ? 'bg-red' : 'bg-transparent',
                  )}
                  aria-hidden
                />
                <Icon className={cn('size-[21px]', active && 'stroke-[2.4]')} />
                {n.short}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OfflineBanner() {
  // Node has a navigator without onLine (build-time prerender): only an explicit false means offline.
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-sm font-semibold text-white">
      <WifiOff className="size-4" />
      You are offline. Answers will not be saved until you reconnect.
    </div>
  );
}
