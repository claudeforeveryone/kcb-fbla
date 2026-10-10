import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Crown, Link2, Users } from 'lucide-react';
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  FacetArt,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  errorMessage,
  useToast,
} from '../../components/ui';
import { Page } from '../../components/layout/Page';
import { useAuth } from '../../lib/auth';
import { createChapter, getMyChapter } from '../../api/chapter';
import { REGIONS, useLoad } from './components/admin-shared';


export default function CreatePage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const mine = useLoad(() => getMyChapter(), []);

  const [name, setName] = useState('');
  const [school, setSchool] = useState(profile?.school ?? '');
  const [region, setRegion] = useState('Ontario');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameError = touched && name.trim().length < 2 ? 'At least 2 characters.' : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      await createChapter({ name, school, region, description });
      await refreshProfile();
      toast.success('Chapter registered', 'You are the president. Share the join code to bring your members in.');
      navigate('/chapter', { replace: true });
    } catch (err) {
      toast.error('Could not register the chapter', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Chapter"
        title="Register your chapter"
        subtitle="Set up a home for your FBLA chapter: one leaderboard, one classroom, every member's progress in one place."
        back={{ to: '/chapter', label: 'Chapter' }}
      />
      <Page>
        {mine.loading ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <Skeleton className="h-[420px] w-full" rounded="rounded-[12px]" />
            <Skeleton className="h-[260px] w-full" rounded="rounded-[12px]" />
          </div>
        ) : mine.data ? (
          <EmptyState
            icon={<Users />}
            title={`You're already in ${mine.data.chapter.name}`}
            description="A player can belong to one chapter at a time. Leave your current chapter first if you want to register a new one."
            action={<ButtonLink to="/chapter">Go to my chapter</ButtonLink>}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <Card as="section">
              <form onSubmit={submit} className="grid gap-5" noValidate>
                <Input
                  label="Chapter name"
                  placeholder="e.g. KCB FBLA"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  error={nameError}
                  corner={`${name.length}/80`}
                  required
                  autoFocus
                />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="School"
                    placeholder="e.g. Kenner Collegiate"
                    value={school}
                    maxLength={120}
                    onChange={(e) => setSchool(e.target.value)}
                  />
                  <Select
                    label="Province or region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    options={REGIONS.map((r) => ({ value: r, label: r }))}
                  />
                </div>
                <Textarea
                  label="Description"
                  hint="What your chapter is about, when you meet, what you're aiming for this season."
                  placeholder="We meet Tuesdays at lunch in room 204. Goal: send 10 members to provincials."
                  value={description}
                  maxLength={1000}
                  rows={4}
                  onChange={(e) => setDescription(e.target.value)}
                  corner={`${description.length}/1000`}
                />
                <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted">You'll become president and can add executives right after.</p>
                  <Button type="submit" variant="accent" size="lg" loading={busy} leftIcon={<Crown className="size-5" />}>
                    Register chapter
                  </Button>
                </div>
              </form>
            </Card>

            <aside className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted">Preview</div>
              <div className="facets relative overflow-hidden rounded-[12px] p-5 text-white shadow-lg">
                <FacetArt className="opacity-80" />
                <div className="relative">
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-white/70">{region}</div>
                  <div className="mt-2 break-words font-display text-2xl font-extrabold leading-tight">
                    {name.trim() || 'Your chapter'}
                  </div>
                  <div className="mt-1 text-sm text-white/75">{school.trim() || 'Your school'}</div>
                  <div className="mt-5 flex items-center gap-3">
                    <Avatar src={profile?.avatar_url} name={profile?.display_name} size="sm" ring />
                    <div className="text-sm">
                      <div className="font-semibold">{profile?.display_name}</div>
                      <div className="text-white/70">President</div>
                    </div>
                  </div>
                </div>
              </div>
              <Card padded className="space-y-3 text-sm">
                {[
                  { icon: <Link2 className="size-4" />, text: 'Members join with a 6-character code or an invite link.' },
                  { icon: <Users className="size-4" />, text: 'Everyone starts at 0 Elo. Practice moves your chapter up the rankings.' },
                  { icon: <CheckCircle2 className="size-4" />, text: 'Track attendance, assign trainers per event and see who needs help.' },
                ].map((r, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="mt-0.5 text-blue dark:text-link">{r.icon}</span>
                    <span className="text-ink">{r.text}</span>
                  </div>
                ))}
              </Card>
            </aside>
          </div>
        )}
      </Page>
    </>
  );
}
