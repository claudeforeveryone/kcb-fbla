// Chapter preview card and the join-by-code box (used by ChapterPage and JoinPage).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Ban, Crown, MapPin, School, Users } from 'lucide-react';
import { Button, FacetArt, Spinner, cn, errorMessage, useToast } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import type { ChapterPreview } from '../../../lib/types';
import { joinChapter, previewChapter } from '../../../api/chapter';

export function ChapterPreviewCard({ preview, footer, className }: { preview: ChapterPreview; footer?: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[12px] border border-line bg-surface shadow-sm', className)}>
      <div className="facets relative overflow-hidden px-5 pb-5 pt-6 text-white">
        <FacetArt className="opacity-80" />
        <div className="relative">
          {preview.region && (
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white/70">
              <MapPin className="size-3.5" aria-hidden /> {preview.region}
            </div>
          )}
          <div className="mt-2 break-words font-display text-2xl font-extrabold leading-tight">{preview.name}</div>
          {preview.school && (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
              <School className="size-4" aria-hidden /> {preview.school}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" aria-hidden />
            <span className="tabular font-semibold text-ink">{preview.member_count}</span>
            {preview.member_count === 1 ? 'member' : 'members'}
          </span>
          {preview.president_name && (
            <span className="inline-flex items-center gap-1.5">
              <Crown className="size-4" aria-hidden /> President <span className="font-semibold text-ink">{preview.president_name}</span>
            </span>
          )}
        </div>
        {preview.description && <p className="whitespace-pre-line text-[0.9375rem] text-ink">{preview.description}</p>}
        {footer}
      </div>
    </div>
  );
}

export function BannedNotice() {
  return (
    <div className="flex gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-ink" role="alert">
      <Ban className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <span>
        You've been banned from this chapter, so you can't join it. If you think this is a mistake, talk to the chapter's
        president or an executive.
      </span>
    </div>
  );
}

/** Six-box code entry with a live preview and a Join button. */
export function JoinByCode({ autoFocus }: { autoFocus?: boolean }) {
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<ChapterPreview | null | undefined>(undefined);
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (code.length !== 6) {
      setPreview(undefined);
      return;
    }
    let live = true;
    setLooking(true);
    previewChapter(code)
      .then((p) => live && setPreview(p))
      .catch(() => live && setPreview(null))
      .finally(() => live && setLooking(false));
    return () => {
      live = false;
    };
  }, [code]);

  const join = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!preview || preview.is_banned) return;
    setJoining(true);
    try {
      await joinChapter(code);
      await refreshProfile();
      toast.success(`Welcome to ${preview.name}`, 'You start at 0 Elo on the chapter board. Time to climb.');
      navigate('/chapter', { replace: true });
    } catch (err) {
      toast.error('Could not join', errorMessage(err));
    } finally {
      setJoining(false);
    }
  };

  return (
    <form onSubmit={join} className="space-y-4">
      <label htmlFor="join-code" className="text-sm font-semibold text-ink">
        Chapter join code
      </label>
      <div className="relative">
        <input
          id="join-code"
          value={code}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          maxLength={6}
          placeholder="ABC123"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          className="tabular h-14 w-full rounded-xl border border-line-strong bg-surface px-4 text-center font-display text-2xl font-extrabold uppercase tracking-[0.5em] text-heading outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15 placeholder:text-muted/40"
          aria-describedby="join-code-hint"
        />
        {looking && <Spinner className="absolute right-4 top-1/2 size-5 -translate-y-1/2 text-muted" />}
      </div>
      <p id="join-code-hint" className="text-[0.8125rem] text-muted">
        Six letters and numbers. Ask your chapter's president or an executive for it.
      </p>
      {preview === null && code.length === 6 && !looking && (
        <p className="text-sm font-medium text-danger" role="alert">
          No chapter uses that code. Check it, or ask for a fresh one.
        </p>
      )}
      {preview && (
        <ChapterPreviewCard
          preview={preview}
          className="animate-rise"
          footer={
            preview.is_banned ? (
              <BannedNotice />
            ) : preview.already_member ? (
              <Button type="button" block onClick={() => navigate('/chapter')}>
                You're already a member. Open chapter
              </Button>
            ) : (
              <Button type="submit" variant="accent" block size="lg" loading={joining} rightIcon={<ArrowRight className="size-5" />}>
                Join {preview.name}
              </Button>
            )
          }
        />
      )}
    </form>
  );
}
