import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, Camera, Check, Eye, EyeOff, Loader2, LogOut, Mail, School, Trash2, Undo2, X } from 'lucide-react';
import {
  Avatar,
  Button,
  EloBadge,
  Input,
  PageHeader,
  Select,
  Switch,
  Textarea,
  cn,
  useScrollFade,
  errorMessage,
  useToast,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { useTheme, type ThemePref } from '../../components/layout/theme';
import { useAuth, useProfile } from '../../lib/auth';
import { EVENTS, EVENT_GROUPS, USERNAME_RE, eventName } from '../../lib/types';
import { isUsernameAvailable, updateMyProfile } from '../../api/core';
import { AVATAR_ACCEPT, changePassword, myEmail, prepareAvatar, removeMyAvatar, uploadMyAvatar } from '../../api/me';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'email', label: 'Email' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'security', label: 'Password' },
  { id: 'account', label: 'Sign out' },
];

export default function SettingsPage() {
  const navRef = useScrollFade<HTMLUListElement>();
  return (
    <>
      <PageHeader eyebrow="Me" title="Settings" subtitle="Your player card, email, theme and account." back={{ to: '/me', label: 'Profile' }} size="sm" />
      <Page>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <ul ref={navRef} className="scroll-fade scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="flex h-9 items-center gap-2 whitespace-nowrap rounded-[2px] px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink [&>svg]:size-4"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 space-y-6">
            <ProfileSection />
            <EmailSection />
            <AppearanceSection />
            <PasswordSection />
            <AccountSection />
          </div>
        </div>
      </Page>
    </>
  );
}

function SettingsCard({
  id,
  title,
  description,
  children,
  footer,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-[12px] border border-line bg-surface">
      <div className="px-5 pt-5 sm:px-6">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2/50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {footer}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ profile

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function ProfileSection() {
  const profile = useProfile();
  const { refreshProfile, patchProfile } = useAuth();
  const toast = useToast();
  const initial = useMemo(
    () => ({
      display_name: profile.display_name,
      username: profile.username,
      school: profile.school ?? '',
      grade: profile.grade ? String(profile.grade) : '',
      main_event: profile.main_event ?? '',
      bio: profile.bio ?? '',
    }),
    [profile],
  );
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [avail, setAvail] = useState<Availability>('idle');
  /** Photo change waiting for Save: a resized image with its preview URL, or 'remove'. */
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | 'remove' | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setForm(initial), [initial]);
  // free the preview object URL when it is replaced or the page closes
  useEffect(() => {
    const url = photo && photo !== 'remove' ? photo.preview : null;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fieldsDirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== initial[k]);
  const dirty = fieldsDirty || photo != null;

  // live username check
  useEffect(() => {
    const u = form.username;
    if (u === profile.username) return setAvail('idle');
    if (!USERNAME_RE.test(u)) return setAvail('invalid');
    setAvail('checking');
    let live = true;
    const t = window.setTimeout(() => {
      isUsernameAvailable(u).then(
        (ok) => live && setAvail(ok ? 'available' : 'taken'),
        () => live && setAvail('idle'),
      );
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [form.username, profile.username]);

  const grade = form.grade ? Number(form.grade) : null;
  const ibcBlocked = (g: number | null) => g != null && g !== 9 && g !== 10;
  const nameErr = !form.display_name.trim() ? 'Enter a display name.' : null;
  const userErr =
    avail === 'invalid'
      ? '3 to 20 characters: lowercase letters, numbers and underscores.'
      : avail === 'taken'
        ? 'That username is taken.'
        : null;
  const eventErr =
    form.main_event === 'intro-business-concepts' && ibcBlocked(grade) ? 'Intro to Business Concepts is for grades 9 and 10.' : null;

  const shownAvatar = photo === 'remove' ? null : photo ? photo.preview : profile.avatar_url;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (nameErr || userErr || eventErr || avail === 'checking' || preparing) return;
    setSaving(true);
    try {
      if (photo === 'remove') {
        await removeMyAvatar();
        patchProfile({ avatar_url: null });
      } else if (photo) {
        const url = await uploadMyAvatar(photo.blob);
        patchProfile({ avatar_url: url });
      }
      setPhoto(null);
      if (fieldsDirty) {
        const saved = await updateMyProfile({
          display_name: form.display_name,
          username: form.username,
          school: form.school.trim() || null,
          grade,
          main_event: form.main_event || null,
          bio: form.bio.trim() || null,
        });
        patchProfile(saved);
      }
      await refreshProfile();
      toast.success('Profile saved', 'Your changes are live on your player card and the leaderboard.');
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      const blob = await prepareAvatar(file);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch (err) {
      toast.error('Could not use that image', errorMessage(err));
    } finally {
      setPreparing(false);
    }
  };

  const discard = () => {
    setForm(initial);
    setPhoto(null);
  };

  return (
    <form onSubmit={save} noValidate>
      <SettingsCard
        id="profile"
        title="Profile"
        description="This is what other players see on your player card and on leaderboards."
        footer={
          <>
            {dirty && (
              <Button variant="ghost" onClick={discard} disabled={saving}>
                Discard changes
              </Button>
            )}
            <Button type="submit" loading={saving} disabled={!dirty || preparing || !!nameErr || !!userErr || !!eventErr || avail === 'checking'}>
              Save profile
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="group relative w-fit">
            <Avatar key={shownAvatar ?? 'none'} src={shownAvatar} name={form.display_name || profile.display_name} size="2xl" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={preparing || saving}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-navy/0 text-xs font-bold text-white opacity-0 transition-[opacity,background-color] duration-200 hover:bg-navy/65 hover:opacity-100 focus-visible:bg-navy/65 focus-visible:opacity-100 disabled:bg-navy/65 disabled:opacity-100"
              aria-label="Change photo"
            >
              {preparing ? <Loader2 className="size-7 animate-spin" /> : <Camera className="size-7" />}
              Change photo
            </button>
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg font-bold text-heading">{form.display_name || profile.display_name}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-navy dark:text-muted">
              @{form.username || profile.username}
              <EloBadge elo={profile.elo} size="sm" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={<Camera className="size-4" />} onClick={() => fileRef.current?.click()} loading={preparing} disabled={saving}>
                {shownAvatar ? 'Change photo' : 'Upload photo'}
              </Button>
              {shownAvatar && (
                <Button size="sm" variant="ghost" leftIcon={<Trash2 className="size-4" />} onClick={() => setPhoto(profile.avatar_url ? 'remove' : null)} disabled={saving || preparing}>
                  Remove
                </Button>
              )}
              {photo && (
                <Button size="sm" variant="ghost" leftIcon={<Undo2 className="size-4" />} onClick={() => setPhoto(null)} disabled={saving}>
                  Keep current photo
                </Button>
              )}
            </div>
            <p className={cn('mt-2 text-xs', photo ? 'font-semibold text-red dark:text-danger' : 'text-navy dark:text-muted')} aria-live="polite">
              {photo === 'remove'
                ? 'Your photo will be removed when you save.'
                : photo
                  ? 'Preview. Press Save profile to use this photo.'
                  : 'JPG, PNG or WebP, up to 5 MB. We crop it to a square.'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_ACCEPT.join(',')}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              data-testid="settings-avatar-file"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Input
            label="Display name"
            maxLength={40}
            autoComplete="name"
            value={form.display_name}
            onChange={(e) => set('display_name', e.target.value)}
            error={nameErr}
          />
          <Input
            label="Username"
            leftIcon={<AtSign />}
            maxLength={20}
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="username"
            value={form.username}
            onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            error={userErr}
            hint={avail === 'idle' ? `Your profile lives at /u/${form.username}` : undefined}
            corner={<UsernameState state={avail} />}
          />
          <Input
            label="School"
            leftIcon={<School />}
            maxLength={120}
            autoComplete="organization"
            placeholder="e.g. King City Secondary School"
            value={form.school}
            onChange={(e) => set('school', e.target.value)}
          />
          <Select label="Grade" value={form.grade} onChange={(e) => set('grade', e.target.value)}>
            <option value="">Not set</option>
            {[7, 8, 9, 10, 11, 12].map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </Select>
          <Select
            label="Main event"
            className="sm:col-span-2"
            value={form.main_event}
            onChange={(e) => set('main_event', e.target.value)}
            error={eventErr}
            hint="Your main event is highlighted on your profile and used for suggestions."
          >
            <option value="">Not sure yet</option>
            {EVENT_GROUPS.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {EVENTS.filter((e) => e.group === g.id).map((e) => (
                  <option key={e.slug} value={e.slug} disabled={e.slug === 'intro-business-concepts' && ibcBlocked(grade)}>
                    {e.name}
                    {e.isNew ? ' (new)' : ''}
                    {e.gradeNote ? ` · ${e.gradeNote}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Textarea
            label="Bio"
            className="sm:col-span-2"
            rows={3}
            maxLength={280}
            placeholder={`What are you training for? e.g. "Going for provincials in ${eventName(form.main_event || 'accounting')}."`}
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
            corner={<span className="tabular">{form.bio.length}/280</span>}
          />
        </div>
      </SettingsCard>
    </form>
  );
}

function UsernameState({ state }: { state: Availability }) {
  if (state === 'checking')
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> Checking
      </span>
    );
  if (state === 'available')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-success">
        <Check className="size-3.5" /> Available
      </span>
    );
  if (state === 'taken')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-danger">
        <X className="size-3.5" /> Taken
      </span>
    );
  return null;
}

// ------------------------------------------------------------------------------------------------ email

function EmailSection() {
  const profile = useProfile();
  const { patchProfile } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    myEmail().then(setEmail, () => setEmail(null));
  }, []);

  const toggle = async (next: boolean) => {
    setBusy(true);
    patchProfile({ email_opt_in: next });
    try {
      await updateMyProfile({ email_opt_in: next });
      toast.success(next ? 'Weekly emails on' : 'Weekly emails off');
    } catch (err) {
      patchProfile({ email_opt_in: !next });
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard
      id="email"
      title="Email"
      description={
        email ? (
          <span className="inline-flex items-center gap-1.5">
            <Mail className="size-3.5" /> Sent to {email}
          </span>
        ) : undefined
      }
    >
      <Switch
        checked={profile.email_opt_in}
        onChange={toggle}
        disabled={busy}
        label="Weekly overview and reminders"
        description="A Monday summary of your week (questions, accuracy, Elo change, streak), your open chapter assignments, the latest newsletter, and a nudge if you have been away for a week."
      />
      <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted">
        Account emails (password resets and sign-in links) are always sent, whatever you choose here.
      </p>
    </SettingsCard>
  );
}

// ------------------------------------------------------------------------------------------------ appearance

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const options: { value: ThemePref; label: string; preview: string }[] = [
    { value: 'light', label: 'Light', preview: 'bg-[#F5F7FB]' },
    { value: 'dark', label: 'Dark', preview: 'bg-[#0A1230]' },
  ];
  return (
    <SettingsCard id="appearance" title="Appearance" description="Saved on this device. Light is the default.">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
        {options.map((o) => {
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(o.value)}
              className={cn(
                'group rounded-xl border-2 p-2 text-left transition-colors duration-150',
                active ? 'border-blue' : 'border-line hover:border-line-strong',
              )}
            >
              <span className={cn('relative block h-16 overflow-hidden rounded-lg ring-1 ring-inset ring-line sm:h-20', o.preview)}>
                <span className="absolute inset-x-0 top-0 h-3 bg-[#001E60]" />
                <span className="absolute left-2 top-5 h-2 w-1/2 bg-[#3F6FB3]/70" />
                <span className="absolute left-2 top-9 h-2 w-1/3 bg-[#BF0D3E]/70" />
              </span>
              <span className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ink [&>svg]:size-4">
                {o.label}
                {active && <Check className="ml-auto size-4 text-blue dark:text-link" />}
              </span>
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}

// ------------------------------------------------------------------------------------------------ password

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, pw.length < 8 ? Math.min(s, 1) : s);
  return { score, label: ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][score] };
}

function PasswordSection() {
  const toast = useToast();
  const { resetPassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const st = strength(next);

  const nextErr = next && next.length < 8 ? 'Use at least 8 characters.' : null;
  const confirmErr = confirm && confirm !== next ? 'The passwords do not match.' : null;
  const ready = current && next.length >= 8 && confirm === next;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed');
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    setSendingReset(true);
    try {
      const email = await myEmail();
      if (!email) throw new Error('No email on this account.');
      await resetPassword(email);
      toast.success('Reset link sent', `Check ${email} for a link to set a new password.`);
    } catch (e2) {
      toast.error(errorMessage(e2));
    } finally {
      setSendingReset(false);
    }
  };

  const eye = (
    <Button variant="ghost" size="icon-sm" aria-label={show ? 'Hide passwords' : 'Show passwords'} onClick={() => setShow((s) => !s)}>
      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </Button>
  );

  return (
    <form onSubmit={submit} noValidate>
      <SettingsCard
        id="security"
        title="Password"
        description="Use at least 8 characters. A longer phrase is easier to remember and harder to guess."
        footer={
          <Button type="submit" loading={busy} disabled={!ready}>
            Change password
          </Button>
        }
      >
        <div className="grid gap-5 sm:max-w-md">
          <Input
            label="Current password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            right={eye}
            corner={
              <button type="button" onClick={sendReset} disabled={sendingReset} className="font-semibold text-link hover:underline disabled:opacity-60">
                {sendingReset ? 'Sending...' : 'Forgot it?'}
              </button>
            }
          />
          <div>
            <Input
              label="New password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={nextErr}
            />
            {next && (
              <div className="mt-2 flex items-center gap-2" aria-live="polite">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1.5 flex-1 transition-colors',
                        i < st.score ? (st.score <= 1 ? 'bg-red' : st.score === 2 ? 'bg-warning' : 'bg-success') : 'bg-surface-3',
                      )}
                    />
                  ))}
                </div>
                <span className="w-16 text-right text-xs font-semibold text-muted">{st.label}</span>
              </div>
            )}
          </div>
          <Input
            label="Confirm new password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={confirmErr}
          />
          {err && (
            <p role="alert" className="rounded-lg bg-red/[0.06] px-3 py-2.5 text-sm font-medium text-danger">
              {err}
            </p>
          )}
        </div>
      </SettingsCard>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------ account

function AccountSection() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const out = async () => {
    setBusy(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <SettingsCard id="account" title="Sign out" description="Sign out of FBLC United on this device. Your progress is saved to your account.">
      <Button variant="danger" leftIcon={<LogOut className="size-4" />} loading={busy} onClick={out}>
        Sign out
      </Button>
    </SettingsCard>
  );
}
