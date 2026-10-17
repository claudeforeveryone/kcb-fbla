import { useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Heart, Lock, Moon, Sun } from 'lucide-react';
import { Brand } from '../../components/layout/Brand';
import { useTheme } from '../../components/layout/theme';
import { UnitedRule } from '../../components/ui/PageHeader';
import { Input, type InputProps } from '../../components/ui/Field';

const features = [
  { title: 'FBLA-style exams', body: 'Fifteen FBL Canada events, timed papers and Elo that moves with every answer.' },
  { title: 'Arena duels', body: 'Challenge a friend to ten questions. Fastest correct answers win.' },
  { title: 'Your chapter, organised', body: 'Assignments, newsletters, attendance and a coach view of every member.' },
];

function EloNote() {
  return (
    <div className="border-t border-white/15 pt-4">
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">One number: your Elo</div>
      <p className="mt-1.5 text-sm text-white/75">
        Every answer moves your Elo score. Harder questions are worth more, and the leaderboard ranks by Elo alone.
      </p>
    </div>
  );
}

/** Split layout for auth: navy brand panel + form. `aside` replaces the default panel content. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  aside,
  wide,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  aside?: ReactNode;
  wide?: boolean;
}) {
  const { isDark, toggle } = useTheme();
  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      {/* Brand panel */}
      <aside className="relative isolate overflow-hidden bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[44%] lg:max-w-[640px] lg:flex-col">
        <UnitedRule onNavy />
        <div className="relative flex items-center justify-between px-5 pt-5 lg:px-12 lg:pt-10">
          <Brand size="md" />
          <button
            type="button"
            onClick={toggle}
            className="grid size-9 place-items-center rounded-[2px] text-white/75 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </button>
        </div>
        <div className="relative px-5 pb-7 pt-5 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-12 lg:pb-12 lg:pt-0">
          {aside ?? (
            <>
              <p className="mb-3 hidden items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/65 lg:flex">
                <span className="h-[3px] w-6 bg-red" />
                For FBL Canada members
              </p>
              <h2 className="max-w-md text-2xl font-extrabold leading-[1.08] tracking-tight text-white lg:text-[2.75rem]">
                Train like it is nationals.
              </h2>
              <p className="mt-3 hidden max-w-md text-base text-white/75 lg:block">
                Practise the way FBLA events are tested, see exactly where you are weak, and climb the chapter leaderboard.
              </p>
              <ul className="mt-9 hidden space-y-5 lg:block">
                {features.map((f) => (
                  <li key={f.title} className="border-l-[3px] border-red pl-4">
                    <div>
                      <div className="font-display font-bold text-white">{f.title}</div>
                      <div className="text-sm text-white/70">{f.body}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-10 hidden max-w-md lg:block">
                <EloNote />
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Form */}
      <main className="relative flex flex-1 flex-col">
        <div className="absolute right-5 top-5 hidden lg:block">
          <button
            type="button"
            onClick={toggle}
            className="grid size-9 place-items-center rounded-[2px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </button>
        </div>
        <div className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:py-12">
          <div className={`animate-rise w-full ${wide ? 'max-w-xl' : 'max-w-[420px]'}`}>
            <h1 className="text-[1.75rem] font-extrabold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 text-[0.9375rem] text-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-8 border-t border-line pt-6 text-center text-sm text-muted">{footer}</div>}
          </div>
        </div>
        <AuthFooter />
      </main>
    </div>
  );
}

/** Credits and legal links under the auth forms (these pages have no app footer). New tab, so a typed form survives. */
function AuthFooter() {
  const link = 'inline-flex min-h-10 items-center px-2 font-semibold text-muted underline-offset-4 hover:text-ink hover:underline';
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-3 px-5 pb-5 text-xs text-muted">
      <span className="inline-flex min-h-10 items-center gap-1 px-2">
        Built with{' '}
        <Heart aria-label="love" role="img" className="size-3.5 shrink-0 fill-current text-red" />{' '}
        by Joseph &amp; Kaden
      </span>
      <nav aria-label="Legal" className="flex">
        <Link to="/terms" target="_blank" rel="noopener" className={link}>
          Terms<span className="sr-only"> of use (opens in a new tab)</span>
        </Link>
        <Link to="/privacy" target="_blank" rel="noopener" className={link}>
          Privacy<span className="sr-only"> policy (opens in a new tab)</span>
        </Link>
      </nav>
    </footer>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput(props: Omit<InputProps, 'type' | 'right'> & { ref?: Ref<HTMLInputElement> }) {
  const [show, setShow] = useState(false);
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      leftIcon={<Lock />}
      right={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="grid size-8 place-items-center rounded-[2px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
    />
  );
}

/** 0-4 strength score with a label. */
export function passwordStrength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s += 0.5;
  const score = pw.length < 8 ? Math.min(1, s) : Math.min(4, Math.floor(s));
  return { score, label: ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  const colors = ['bg-red', 'bg-red', 'bg-warning', 'bg-blue', 'bg-success'];
  return (
    <div className="mt-2 flex items-center gap-3" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 transition-colors duration-200 ${i < Math.max(1, score) ? colors[score] : 'bg-surface-3'}`}
          />
        ))}
      </div>
      <span className="w-16 text-right text-xs font-semibold text-muted">{label}</span>
    </div>
  );
}
