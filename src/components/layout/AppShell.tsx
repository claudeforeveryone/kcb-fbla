import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, ChevronDown, LogOut, Moon, Settings, Sun, UserRound, WifiOff } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Avatar } from '../ui/Avatar';
import { buttonClasses } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import { EloBadge } from '../ui/EloBadge';
import { cn } from '../ui/cn';
import { useToast } from '../ui/Toast';
import { NotificationBell } from '../notifications/NotificationBell';
import { Brand } from './Brand';
import { NAV } from './nav';
import { useTheme, type ThemePref } from './theme';
import { Footer } from './Footer';

/** App chrome: navy top bar, page outlet, footer, and the phone bottom tab bar. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { session, profile } = useAuth();
  const { pathname } = useLocation();
  const signedIn = !!session && !!profile;

  // New page: start at the top (keep position for in-page hash links).
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
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

function TopBar({ signedIn, pathname }: { signedIn: boolean; pathname: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-black/20 bg-bar text-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Brand size="md" className="shrink-0" wordmarkClassName="md:hidden lg:flex" />
        {signedIn && (
          <nav aria-label="Main" className="ml-2 hidden h-full flex-1 items-stretch md:flex lg:ml-6">
            {NAV.map((n) => {
              const active = n.match(pathname);
              const Icon = n.icon;
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2 px-2.5 font-display text-[0.9375rem] font-semibold transition-colors duration-150 lg:px-3',
                    active ? 'text-white' : 'text-white/70 hover:text-white',
                  )}
                >
                  <Icon className={cn('hidden size-[18px] lg:block', active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')} />
                  {n.label}
                  <span
                    className={cn(
                      'absolute inset-x-2 bottom-0 h-[3px] transition-all duration-200 ease-out',
                      active ? 'bg-red' : 'scale-x-0 bg-white/40 group-hover:scale-x-50',
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
              <NotificationBell />
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
  const { session } = useAuth();
  const next = encodeURIComponent(pathname);
  if (session)
    return (
      <Link to="/onboarding" className={buttonClasses('accent', 'sm')}>
        Finish setup
      </Link>
    );
  return (
    <>
      <Link to={`/login?next=${next}`} className={buttonClasses('ghost', 'sm', 'text-white hover:bg-white/10')}>
        Sign in
      </Link>
      <Link to={`/signup?next=${next}`} className={buttonClasses('accent', 'sm')}>
        Join free
      </Link>
    </>
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
  if (!profile) return null;

  return (
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
            toast.info('Signed out', 'See you next practice.');
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
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
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
