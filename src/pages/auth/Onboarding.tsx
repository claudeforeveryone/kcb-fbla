import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AtSign, Camera, Check, GraduationCap, Loader2, School, Sparkles, X } from 'lucide-react';
import { safeNext, useAuth } from '../../lib/auth';
import { avatarPublicUrl, supabase } from '../../lib/supabase';
import { GROUPS, loadIndex, type Topic } from '../../lib/content';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EloBadge } from '../../components/ui/EloBadge';
import { Input } from '../../components/ui/Field';
import { SegmentedControl } from '../../components/ui/Segmented';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../components/ui/cn';
import { SplashScreen } from '../../components/layout/SplashScreen';
import { AuthLayout } from './AuthLayout';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const GRADES = [7, 8, 9, 10, 11, 12] as const;
const MAX_AVATAR = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

function suggestUsername(src: string) {
  return src
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

/** Events limited to some grades (intro-business-concepts is grades 9 and 10 only). */
function eventAllowed(t: Topic, grade: number | null) {
  if (t.slug === 'intro-business-concepts') return grade == null || grade === 9 || grade === 10;
  return true;
}

async function checkUsername(u: string): Promise<boolean> {
  // Prefer the RPC (works before a profile exists); fall back to a direct read.
  const rpc = await supabase.rpc('fbla_username_available', { p_username: u });
  if (!rpc.error && typeof rpc.data === 'boolean') return rpc.data;
  const { count, error } = await supabase
    .from('fbla_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', u);
  if (error) throw error;
  return (count ?? 0) === 0;
}

export default function Onboarding() {
  const { loading, user, profile, createProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [userEdited, setUserEdited] = useState(false);
  const [availability, setAvailability] = useState<Availability>('idle');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [topicsErr, setTopicsErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prefill a username from the email.
  useEffect(() => {
    if (user?.email && !username && !userEdited) setUsername(suggestUsername(user.email));
  }, [user, username, userEdited]);

  useEffect(() => {
    loadIndex()
      .then(setTopics)
      .catch(() => setTopicsErr(true));
  }, []);

  // Live availability (debounced).
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) return setAvailability('idle');
    if (!USERNAME_RE.test(u)) return setAvailability('invalid');
    setAvailability('checking');
    let alive = true;
    const t = window.setTimeout(() => {
      checkUsername(u)
        .then((ok) => alive && setAvailability(ok ? 'available' : 'taken'))
        .catch(() => alive && setAvailability('error'));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [username]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  // If the chosen event becomes invalid for the grade, clear it.
  useEffect(() => {
    if (event && topics) {
      const t = topics.find((x) => x.slug === event);
      if (t && !eventAllowed(t, grade)) setEvent(null);
    }
  }, [grade, event, topics]);

  const byGroup = useMemo(
    () => GROUPS.map((g) => ({ ...g, topics: (topics ?? []).filter((t) => t.group === g.id) })),
    [topics],
  );
  const eventName = topics?.find((t) => t.slug === event)?.name;

  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to={next} replace />;

  const nameErr = !displayName.trim()
    ? 'Tell us what to call you.'
    : displayName.trim().length > 40
      ? 'Keep it under 40 characters.'
      : null;
  const userErr =
    availability === 'invalid'
      ? '3 to 20 characters: lowercase letters, numbers and underscores.'
      : availability === 'taken'
        ? 'That username is taken.'
        : !username
          ? 'Pick a username.'
          : null;

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!AVATAR_TYPES.includes(f.type)) return toast.error('Unsupported image', 'Use a PNG, JPG, WebP or GIF.');
    if (f.size > MAX_AVATAR) return toast.error('Image too large', 'Pick one under 2 MB.');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const goStep2 = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameErr || userErr || availability === 'checking') return;
    setTouched(false);
    setStep(2);
  };

  const finish = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (grade == null) return;
    setBusy(true);
    setError(null);
    try {
      let avatar_url: string | null = null;
      if (file) {
        const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
        const path = `${user.id}/avatar.${ext}`;
        const up = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
        if (up.error) toast.warning('Avatar not uploaded', 'Your profile was saved; you can add a photo later in Settings.');
        else avatar_url = `${avatarPublicUrl(path)}?v=${Date.now()}`;
      }
      await createProfile({
        username: username.trim().toLowerCase(),
        display_name: displayName.trim(),
        school: school.trim() || null,
        grade,
        main_event: event,
        avatar_url,
      });
      toast.success(`Welcome, ${displayName.trim().split(' ')[0]}`, 'Your player card is ready. Time to play.');
      navigate(next, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create your profile.';
      setError(msg);
      if (msg.toLowerCase().includes('username')) {
        setStep(1);
        setAvailability('taken');
      }
      setBusy(false);
    }
  };

  const card = (
    <PlayerCardPreview
      name={displayName.trim() || 'Your name'}
      username={username || 'username'}
      avatar={preview}
      school={school.trim()}
      grade={grade}
      eventName={eventName}
    />
  );

  return (
    <AuthLayout
      wide={step === 2}
      title={step === 1 ? 'Build your player card' : 'Where do you compete?'}
      subtitle={
        step === 1
          ? 'This is how you appear on leaderboards and in the Arena.'
          : 'We use this to tailor practice. Change it any time in Settings.'
      }
      aside={
        <div className="lg:max-w-md">
          <p className="mb-4 hidden items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/65 lg:flex">
            <span className="h-[3px] w-6 bg-red" />
            Step {step} of 2
          </p>
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-white lg:text-4xl">
            {step === 1 ? 'Every champion starts at zero.' : 'Pick your main event.'}
          </h2>
          <p className="mt-2 hidden text-white/75 lg:block">
            Answer questions to earn Elo and climb from Bronze to Champion.
          </p>
          <div className="mt-8 hidden lg:block">{card}</div>
        </div>
      }
    >
      <StepDots step={step} />

      {error && (
        <div role="alert" className="animate-rise mb-4 rounded-[4px] border border-red/25 bg-red/[0.06] px-3.5 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={goStep2} noValidate className="space-y-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative shrink-0 rounded-full"
              aria-label={preview ? 'Change photo' : 'Add a photo'}
            >
              <Avatar src={preview} name={displayName || username || '?'} size="xl" />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-[#00143f]/0 text-white opacity-0 transition-all group-hover:bg-[#00143f]/45 group-hover:opacity-100 group-focus-visible:bg-[#00143f]/45 group-focus-visible:opacity-100">
                <Camera className="size-6" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-[2px] bg-red text-white ring-2 ring-bg">
                <Camera className="size-3.5" />
              </span>
            </button>
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-ink">Profile photo</div>
              <div className="text-muted">Optional. PNG, JPG or WebP up to 2 MB.</div>
              {preview && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
                >
                  <X className="size-3" /> Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept={AVATAR_TYPES.join(',')} className="sr-only" onChange={pickFile} tabIndex={-1} />
          </div>

          <Input
            label="Display name"
            placeholder="e.g. Maya Chen"
            autoComplete="name"
            size="lg"
            maxLength={40}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (!userEdited && e.target.value.trim()) setUsername(suggestUsername(e.target.value.replace(/\s+/g, '_')));
            }}
            error={touched ? nameErr : null}
            autoFocus
          />

          <Input
            label="Username"
            placeholder="maya_chen"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            size="lg"
            leftIcon={<AtSign />}
            maxLength={20}
            value={username}
            onChange={(e) => {
              setUserEdited(true);
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
            }}
            error={(touched || availability === 'taken' || availability === 'invalid') && username ? userErr : touched ? userErr : null}
            hint={
              availability === 'available'
                ? undefined
                : 'Lowercase letters, numbers and underscores. Your profile lives at /u/username.'
            }
            corner={<UsernameStatus state={availability} />}
          />

          <Button type="submit" size="lg" block disabled={availability === 'checking'} rightIcon={<ArrowRight className="size-4" />}>
            Continue
          </Button>
        </form>
      ) : (
        <form onSubmit={finish} noValidate className="space-y-6">
          <Input
            label="School"
            placeholder="e.g. King City Secondary School"
            autoComplete="organization"
            leftIcon={<School />}
            size="lg"
            maxLength={120}
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            hint="Optional, shown on your profile."
          />

          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink">
              <GraduationCap className="size-4 text-muted" />
              Grade
            </div>
            <SegmentedControl
              aria-label="Grade"
              block
              options={GRADES.map((g) => ({ value: g, label: String(g) }))}
              value={grade ?? (0 as number)}
              onChange={(g) => setGrade(g)}
            />
            {touched && grade == null && <p className="mt-1.5 text-[0.8125rem] font-medium text-danger" role="alert">Choose your grade.</p>}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Main event</legend>
            {topicsErr ? (
              <p className="rounded-[2px] bg-surface-2 p-3 text-sm text-muted">
                Events could not load right now. You can pick one later in Settings.
              </p>
            ) : !topics ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-14" rounded="rounded-[4px]" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {byGroup.map((g) => (
                  <div key={g.id}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{g.label}</span>
                      <span className="hidden text-xs text-muted sm:inline">{g.blurb}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={g.label}>
                      {g.topics.map((t) => {
                        const allowed = eventAllowed(t, grade);
                        const active = event === t.slug;
                        return (
                          <button
                            key={t.slug}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={!allowed}
                            onClick={() => setEvent(active ? null : t.slug)}
                            className={cn(
                              'flex min-h-14 items-center gap-3 rounded-[4px] border px-3 py-2 text-left transition-all duration-150',
                              active
                                ? 'border-navy bg-navy text-white dark:border-blue dark:bg-blue'
                                : 'border-line-strong bg-surface hover:border-blue/60 hover:bg-surface-2',
                              !allowed && 'cursor-not-allowed opacity-45',
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className={cn('block text-sm font-semibold leading-snug', active ? 'text-white' : 'text-ink')}>
                                {t.name}
                              </span>
                              {(t.gradeNote || isNew(t.slug)) && (
                                <span className={cn('block text-[11px]', active ? 'text-white/75' : 'text-muted')}>
                                  {isNew(t.slug) ? 'New this year' : t.gradeNote}
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                'grid size-5 shrink-0 place-items-center rounded-[2px] border transition-colors',
                                active ? 'border-white bg-white text-navy' : 'border-line-strong',
                              )}
                              aria-hidden
                            >
                              {active && <Check className="size-3.5 stroke-[3]" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted">Not sure yet? Leave it blank and practise a few events first.</p>
              </div>
            )}
          </fieldset>

          <div className="lg:hidden">{card}</div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="ghost" size="lg" onClick={() => setStep(1)} leftIcon={<ArrowLeft className="size-4" />} disabled={busy}>
              Back
            </Button>
            <Button type="submit" variant="accent" size="lg" className="sm:flex-1" loading={busy} leftIcon={<Sparkles className="size-4" />}>
              Create my player card
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

const isNew = (slug: string) => slug === 'data-science-ai' || slug === 'sports-entertainment-management';

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6 flex items-center gap-2" aria-label={`Step ${step} of 2`}>
      {[1, 2].map((s) => (
        <span
          key={s}
          className={cn('h-1.5 transition-all duration-300 ease-out', s === step ? 'w-10 bg-red' : s < step ? 'w-6 bg-navy dark:bg-link' : 'w-6 bg-surface-3')}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-muted">Step {step} of 2</span>
    </div>
  );
}

function UsernameStatus({ state }: { state: Availability }) {
  if (state === 'checking')
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Loader2 className="size-3 animate-spin" /> Checking
      </span>
    );
  if (state === 'available')
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-success">
        <Check className="size-3.5" /> Available
      </span>
    );
  if (state === 'taken') return <span className="font-semibold text-danger">Taken</span>;
  if (state === 'error') return <span className="text-muted">Could not check</span>;
  return null;
}

function PlayerCardPreview({
  name,
  username,
  avatar,
  school,
  grade,
  eventName,
}: {
  name: string;
  username: string;
  avatar: string | null;
  school: string;
  grade: number | null;
  eventName?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[4px] border border-white/20 bg-navy-deep p-5 text-white max-lg:border-line max-lg:bg-surface max-lg:text-ink">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-red" aria-hidden />
      <div className="relative flex items-center gap-4">
        <Avatar src={avatar} name={name} size="lg" ring />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-bold max-lg:text-heading">{name}</div>
          <div className="truncate text-sm text-white/70 max-lg:text-muted">@{username}</div>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <span className="max-lg:hidden">
          <EloBadge elo={0} size="sm" onDark />
        </span>
        <span className="lg:hidden">
          <EloBadge elo={0} size="sm" />
        </span>
        {grade != null && (
          <span className="rounded-[2px] bg-white/12 px-2 py-1 text-xs font-semibold max-lg:bg-surface-2 max-lg:text-ink">Grade {grade}</span>
        )}
        {eventName && (
          <span className="rounded-[2px] bg-red px-2 py-1 text-xs font-semibold text-white">{eventName}</span>
        )}
      </div>
      {school && <div className="relative mt-3 truncate text-sm text-white/70 max-lg:text-muted">{school}</div>}
      <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center max-lg:border-line">
        {[
          ['0', 'Answered'],
          ['0%', 'Accuracy'],
          ['0', 'Streak'],
        ].map(([v, l]) => (
          <div key={l}>
            <div className="tabular font-display text-lg font-extrabold max-lg:text-heading">{v}</div>
            <div className="text-[11px] uppercase tracking-wider text-white/60 max-lg:text-muted">{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
