import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { AuthLayout } from './AuthLayout';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Request a password-reset email. The link lands on /reset/update. */
export default function Reset() {
  const { resetPassword } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);

  const emailErr = touched && !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!EMAIL_RE.test(email.trim())) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={sent ? 'Check your email' : 'Reset your password'}
      subtitle={
        sent ? undefined : 'Enter the email you signed up with and we will send you a link to choose a new password.'
      }
      footer={
        <Link to="/login" className="link inline-flex items-center gap-1.5">
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="animate-rise rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-blue/10 text-navy dark:text-link">
            <MailCheck className="size-7" />
          </span>
          <p className="text-[0.9375rem]">
            If an account exists for <strong className="text-heading">{email.trim()}</strong>, a reset link is on its way.
            It expires in one hour.
          </p>
          <Button variant="ghost" className="mt-4" onClick={() => setSent(false)}>
            Try a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && (
            <div role="alert" className="rounded-[10px] border border-red/25 bg-red/[0.06] px-3.5 py-3 text-sm font-medium text-danger">
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
          <Button type="submit" size="lg" block loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
