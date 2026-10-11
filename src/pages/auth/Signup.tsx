import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Mail, MailCheck, RefreshCw } from 'lucide-react';
import { authErrorKind, safeNext, useAuth, type AuthErrorKind } from '../../lib/auth';
import { useHydrated, useKeepTypedValue } from '../../lib/hydration';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { AuthLayout, PasswordInput, StrengthMeter } from './AuthLayout';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  // This page is prerendered without a query string: add ?next= only once hydrated, or the link keeps the bare href.
  const nextQuery = useHydrated() && params.get('next') ? `?next=${encodeURIComponent(next)}` : '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // The form is prerendered: keep anything typed before the app took over.
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  useKeepTypedValue(emailRef, setEmail);
  useKeepTypedValue(passwordRef, setPassword);
  useKeepTypedValue(confirmRef, setConfirm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AuthErrorKind>('other');
  const [touched, setTouched] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const errs = {
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : null,
    password: password.length < 8 ? 'Use at least 8 characters.' : null,
    confirm: confirm !== password ? 'Passwords do not match.' : null,
  };
  const valid = !errs.email && !errs.password && !errs.confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    setErrorKind('other');
    try {
      const { needsConfirmation } = await signUp(email, password);
      if (needsConfirmation) setSentTo(email.trim());
      else navigate(`/onboarding?next=${encodeURIComponent(next)}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.');
      setErrorKind(authErrorKind(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) return <CheckInbox email={sentTo} onBack={() => setSentTo(null)} />;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free for FBL Canada members. Takes about a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${nextQuery}`} className="link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="animate-rise rounded-[4px] border border-red/25 bg-red/[0.06] px-3.5 py-3 text-sm font-medium text-danger">
            {error}{' '}
            {errorKind === 'exists' && (
              <Link to="/login" className="link">
                Sign in
              </Link>
            )}
            {(errorKind === 'email_limit' || errorKind === 'email_cooldown') && (
              <span className="mt-1.5 block font-normal text-ink">
                Already got a confirmation email from us earlier?{' '}
                <Link to="/login" className="link">
                  Sign in
                </Link>{' '}
                instead.
              </span>
            )}
          </div>
        )}
        <Input
          ref={emailRef}
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@school.ca"
          leftIcon={<Mail />}
          size="lg"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={touched ? errs.email : null}
          autoFocus
        />
        <div>
          <PasswordInput
            ref={passwordRef}
            label="Password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            size="lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={touched ? errs.password : null}
          />
          <StrengthMeter password={password} />
        </div>
        <PasswordInput
          ref={confirmRef}
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Type it again"
          size="lg"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={touched || (confirm.length >= password.length && confirm) ? errs.confirm : null}
        />
        <Button type="submit" variant="accent" size="lg" block loading={busy} rightIcon={<ArrowRight className="size-4" />}>
          Create account
        </Button>
        <p className="text-center text-sm leading-relaxed text-muted">
          {/* New tab: reading the terms must not wipe the half-filled form. */}
          By creating an account you agree to the{' '}
          <Link to="/terms" target="_blank" rel="noopener" className="link underline">
            Terms of use<span className="sr-only"> (opens in a new tab)</span>
          </Link>{' '}
          and{' '}
          <Link to="/privacy" target="_blank" rel="noopener" className="link underline">
            Privacy policy<span className="sr-only"> (opens in a new tab)</span>
          </Link>
          . Under 13? Ask a parent or guardian first.
        </p>
        <p className="text-center text-xs text-muted">
          Next you will pick a username and your main event. You can change them later.
        </p>
      </form>
    </AuthLayout>
  );
}

function CheckInbox({ email, onBack }: { email: string; onBack: () => void }) {
  const { resendConfirmation } = useAuth();
  const toast = useToast();
  const [cooldown, setCooldown] = useState(45);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setBusy(true);
    try {
      await resendConfirmation(email);
      toast.success('Email sent again', `Check ${email} (and your spam folder).`);
      setCooldown(60);
    } catch (e) {
      toast.error('Could not resend', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Check your inbox" subtitle="One quick step to confirm it is really you.">
      <div className="rounded-[4px] border border-line bg-surface p-6 text-center">
        <MailCheck className="mx-auto mb-4 size-6 text-muted" aria-hidden />
        <p className="text-[0.9375rem] text-ink">
          We sent a confirmation link to
          <br />
          <strong className="font-semibold text-heading">{email}</strong>
        </p>
        <ol className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-muted">
          {['Open the email from FBLC', 'Tap "Confirm your email"', 'Set up your player card'].map((s, i) => (
            <li key={s} className="flex items-center gap-2.5">
              <span className="tabular grid size-5 shrink-0 place-items-center rounded-[2px] bg-navy text-[11px] font-bold text-white dark:bg-blue">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="outline"
            block
            onClick={resend}
            loading={busy}
            disabled={cooldown > 0}
            leftIcon={<RefreshCw className="size-4" />}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
          </Button>
          <Button variant="ghost" block onClick={onBack}>
            Use a different email
          </Button>
        </div>
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted">
        <CheckCircle2 className="size-4 text-success" />
        Already confirmed?{' '}
        <Link to="/login" className="link">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
