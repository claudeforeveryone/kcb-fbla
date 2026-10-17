import { useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Mail, RefreshCw } from 'lucide-react';
import { authErrorKind, safeNext, useAuth, type AuthErrorKind } from '../../lib/auth';
import { useHydrated, useKeepTypedValue } from '../../lib/hydration';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { AuthLayout, PasswordInput } from './AuthLayout';

export default function Login() {
  const { signIn, resendConfirmation } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  // This page is prerendered without a query string: add ?next= only once hydrated, or the link keeps the bare href.
  const nextQuery = useHydrated() && params.get('next') ? `?next=${encodeURIComponent(next)}` : '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The form is prerendered: keep anything typed before the app took over.
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  useKeepTypedValue(emailRef, setEmail);
  useKeepTypedValue(passwordRef, setPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AuthErrorKind>('other');
  const [resending, setResending] = useState(false);
  const [resentTo, setResentTo] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailErr = touched && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter a valid email address.' : null;
  const pwErr = touched && !password ? 'Enter your password.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) return;
    setBusy(true);
    setError(null);
    setErrorKind('other');
    try {
      await signIn(email, password);
      // <RedirectIfAuthed> (App.tsx) sends the user on to `next` or onboarding once the session lands.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setErrorKind(authErrorKind(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    const to = email.trim();
    setResending(true);
    try {
      await resendConfirmation(to, next);
      setResentTo(to);
      toast.success('Confirmation email sent', `Check ${to} (and your spam folder).`);
    } catch (err) {
      toast.error('Could not resend', err instanceof Error ? err.message : undefined);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep your streak alive."
      footer={
        <>
          New to FBLA United?{' '}
          <Link to={`/signup${nextQuery}`} className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="animate-rise rounded-[4px] border border-red/25 bg-red/[0.06] px-3.5 py-3 text-sm font-medium text-danger">
            {error}
            {errorKind === 'not_confirmed' && (
              <div className="mt-2.5">
                {resentTo === email.trim() ? (
                  <span className="font-normal text-ink">New link sent to {resentTo}. Open it, then sign in here.</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resend}
                    loading={resending}
                    leftIcon={<RefreshCw className="size-4" />}
                  >
                    Resend confirmation email
                  </Button>
                )}
              </div>
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
          error={emailErr}
          autoFocus
        />
        <PasswordInput
          ref={passwordRef}
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          size="lg"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={pwErr}
          corner={
            <Link to={`/reset${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`} className="link text-xs">
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" size="lg" block loading={busy} rightIcon={<ArrowRight className="size-4" />}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
