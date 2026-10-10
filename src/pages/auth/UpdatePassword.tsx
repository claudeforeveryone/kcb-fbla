import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, LinkIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Button, ButtonLink } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { SplashScreen } from '../../components/layout/SplashScreen';
import { AuthLayout, PasswordInput, StrengthMeter } from './AuthLayout';

/** Landing page for the password-recovery email link (/reset/update). */
export default function UpdatePassword() {
  const { loading, session, profile, updatePassword } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  if (loading) return <SplashScreen />;

  if (!session)
    return (
      <AuthLayout title="This link has expired" subtitle="Reset links work once and only for an hour.">
        <div className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-red/10 text-red dark:text-danger">
            <LinkIcon className="size-6" />
          </span>
          <p className="text-[0.9375rem] text-muted">Request a fresh link and open it on this device.</p>
          <ButtonLink to="/reset" className="mt-5" block>
            Send a new link
          </ButtonLink>
          <Link to="/login" className="link mt-4 inline-block text-sm">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );

  const errs = {
    password: password.length < 8 ? 'Use at least 8 characters.' : null,
    confirm: confirm !== password ? 'Passwords do not match.' : null,
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (errs.password || errs.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      toast.success('Password updated', 'You are signed in with your new password.');
      navigate(profile ? '/' : '/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.');
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password" subtitle={`For ${session.user.email ?? 'your account'}.`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="rounded-[10px] border border-red/25 bg-red/[0.06] px-3.5 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <div>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            size="lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={touched ? errs.password : null}
            autoFocus
          />
          <StrengthMeter password={password} />
        </div>
        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          size="lg"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={touched ? errs.confirm : null}
        />
        <Button type="submit" size="lg" block loading={busy} leftIcon={<KeyRound className="size-4" />}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
