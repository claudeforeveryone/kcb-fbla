import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { safeNext, useAuth } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { AuthLayout, PasswordInput } from './AuthLayout';

export default function Login() {
  const { signIn } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailErr = touched && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter a valid email address.' : null;
  const pwErr = touched && !password ? 'Enter your password.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // <RedirectIfAuthed> (App.tsx) sends the user on to `next` or onboarding once the session lands.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep your streak alive."
      footer={
        <>
          New to KCB FBLA?{' '}
          <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="animate-rise rounded-[10px] border border-red/25 bg-red/[0.06] px-3.5 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <Input
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
