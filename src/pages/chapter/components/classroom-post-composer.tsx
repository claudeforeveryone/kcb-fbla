import { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote } from 'lucide-react';
import { Button, Input, Modal, SegmentedControl, Select, Switch, cn, errorMessage, useToast } from '../../../components/ui';
import type { PostKind } from '../../../lib/types';
import {
  canManage,
  canWriteNewsletter,
  createPost,
  isAdmin,
  normaliseUrl,
  updatePost,
  type ClassPost,
  type ClassroomContext,
} from '../../../api/classroom';
import { Markdown } from './classroom-markdown';
import { POST_META, eventOptions } from './classroom-shared';

const NEWSLETTER_TEMPLATE = `## This week
A quick recap of what happened at our last meeting.

## Coming up
- **Meeting:** day, time, room
- **Deadline:**

## Study focus
Which events to practise this week, and why.

## Shout-outs
Members who climbed the leaderboard or aced a practice paper.
`;

function weekTitle() {
  const d = new Date();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `Week of ${monday.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
}

export function PostComposer({
  open,
  onClose,
  ctx,
  initialKind = 'announcement',
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  ctx: ClassroomContext;
  initialKind?: PostKind;
  editing?: ClassPost | null;
  onSaved: (post: ClassPost, created: boolean) => void;
}) {
  const toast = useToast();
  const admin = isAdmin(ctx);
  const kinds = useMemo(
    () => (['announcement', 'newsletter', 'link', 'resource'] as PostKind[]).filter((k) => k !== 'newsletter' || canWriteNewsletter(ctx)),
    [ctx],
  );
  const [kind, setKind] = useState<PostKind>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [event, setEvent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTab('write');
    if (editing) {
      setKind(editing.kind);
      setTitle(editing.title);
      setBody(editing.body ?? '');
      setUrl(editing.url ?? '');
      setEvent(editing.event ?? '');
      setPinned(editing.pinned);
    } else {
      const k = kinds.includes(initialKind) ? initialKind : kinds[0];
      setKind(k);
      setTitle(k === 'newsletter' ? weekTitle() : '');
      setBody(k === 'newsletter' ? NEWSLETTER_TEMPLATE : '');
      setUrl('');
      setEvent(admin ? '' : (ctx.trainerEvents[0] ?? ''));
      setPinned(false);
    }
  }, [open, editing, initialKind, kinds, admin, ctx.trainerEvents]);

  const switchKind = (k: PostKind) => {
    setKind(k);
    if (!editing && k === 'newsletter' && !body.trim()) {
      setBody(NEWSLETTER_TEMPLATE);
      if (!title.trim()) setTitle(weekTitle());
    }
  };

  const wrap = (before: string, after = before, placeholder = 'text') => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + before + sel + after + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const linePrefix = (prefix: string) => {
    const el = area.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = body.lastIndexOf('\n', s - 1) + 1;
    setBody(body.slice(0, lineStart) + prefix + body.slice(lineStart));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give it a title.';
    if (kind === 'link' && !url.trim()) e.url = 'Paste the link to share.';
    if (url.trim()) {
      try {
        new URL(normaliseUrl(url)!);
      } catch {
        e.url = 'That does not look like a web address.';
      }
    }
    if (kind === 'newsletter' && body.trim().length < 20) e.body = 'Write a little more for the newsletter.';
    if ((kind === 'announcement' || kind === 'resource') && !body.trim() && !url.trim()) e.body = 'Add a message.';
    if (kind !== 'newsletter' && !canManage(ctx, event || null)) e.event = 'Pick one of the events you train.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const input = { kind, title, body, url, event: kind === 'newsletter' ? null : event || null, pinned };
      const saved = editing ? await updatePost(editing.id, input) : await createPost(ctx.chapter.id, input);
      toast.success(
        editing ? 'Saved' : kind === 'newsletter' ? 'Newsletter published' : 'Posted',
        editing ? undefined : kind === 'newsletter' || kind === 'announcement' ? 'Members have been notified.' : undefined,
      );
      onSaved(saved, !editing);
      onClose();
    } catch (e) {
      toast.error('Could not save', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const meta = POST_META[kind];
  const evOpts = eventOptions(ctx, { allowNone: admin ? 'Whole chapter (no event)' : undefined, manageableOnly: !admin });

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      size="lg"
      title={editing ? `Edit ${meta.label.toLowerCase()}` : kind === 'newsletter' ? 'Write a newsletter' : 'New post'}
      description={meta.blurb}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={kind === 'newsletter' ? 'accent' : 'primary'} onClick={save} loading={busy}>
            {editing ? 'Save changes' : kind === 'newsletter' ? 'Publish newsletter' : 'Post to classroom'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!editing && kinds.length > 1 && (
          <SegmentedControl
            aria-label="Post type"
            block
            size="sm"
            value={kind}
            onChange={switchKind}
            options={kinds.map((k) => {
              const M = POST_META[k];
              const short = k === 'announcement' ? 'News' : k === 'newsletter' ? 'Letter' : M.label;
              return {
                value: k,
                label: (
                  <>
                    <span className="min-[420px]:hidden">{short}</span>
                    <span className="hidden min-[420px]:inline">{M.label}</span>
                  </>
                ),
              };
            })}
          />
        )}

        <Input
          label="Title"
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder={kind === 'link' ? 'e.g. CNLC competition guidelines' : kind === 'resource' ? 'e.g. Accounting formula sheet' : 'e.g. Meeting moved to Thursday'}
          data-autofocus
        />

        {kind !== 'newsletter' && (
          <Select
            label="Event"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            options={evOpts}
            error={errors.event}
            hint={admin ? 'Tag an event so members can filter by it.' : 'Trainers post for the events they train.'}
            placeholder={admin ? undefined : 'Choose an event'}
          />
        )}

        {(kind === 'link' || kind === 'resource') && (
          <Input
            label={kind === 'link' ? 'Link' : 'Link (optional)'}
            value={url}
            inputMode="url"
            placeholder="https://"
            onChange={(e) => setUrl(e.target.value)}
            error={errors.url}
          />
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{kind === 'link' ? 'Note (optional)' : 'Message'}</span>
            <SegmentedControl
              size="sm"
              aria-label="Editor mode"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'write', label: 'Write' },
                { value: 'preview', label: 'Preview' },
              ]}
            />
          </div>
          {tab === 'write' ? (
            <div
              className={cn(
                'overflow-hidden rounded-[2px] border bg-surface transition-[border-color,box-shadow] focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/15',
                errors.body ? 'border-danger' : 'border-line-strong',
              )}
            >
              <div className="flex flex-wrap gap-0.5 border-b border-line bg-surface-2 px-1.5 py-1" role="toolbar" aria-label="Formatting">
                {[
                  { label: 'Bold', icon: Bold, run: () => wrap('**') },
                  { label: 'Italic', icon: Italic, run: () => wrap('*') },
                  { label: 'Heading', icon: Heading2, run: () => linePrefix('## ') },
                  { label: 'Bulleted list', icon: List, run: () => linePrefix('- ') },
                  { label: 'Numbered list', icon: ListOrdered, run: () => linePrefix('1. ') },
                  { label: 'Quote', icon: Quote, run: () => linePrefix('> ') },
                  { label: 'Link', icon: Link2, run: () => wrap('[', '](https://)', 'link text') },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={b.run}
                    title={b.label}
                    aria-label={b.label}
                    className="grid size-8 place-items-center rounded-[2px] text-muted transition-colors hover:bg-surface hover:text-heading"
                  >
                    <b.icon className="size-4" />
                  </button>
                ))}
              </div>
              <textarea
                ref={area}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={kind === 'newsletter' ? 14 : 6}
                maxLength={20000}
                aria-label="Message"
                aria-invalid={errors.body ? true : undefined}
                placeholder={kind === 'newsletter' ? 'Write this week’s newsletter…' : 'Write something for your chapter…'}
                className="block w-full resize-y bg-transparent px-3 py-2.5 text-[0.9375rem] leading-relaxed text-ink outline-none placeholder:text-muted/70"
              />
            </div>
          ) : (
            <div className="min-h-40 rounded-[2px] border border-line bg-surface-2 px-4 py-3">
              {body.trim() ? <Markdown text={body} size={kind === 'newsletter' ? 'md' : 'sm'} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
            </div>
          )}
          {errors.body ? (
            <p className="mt-1.5 text-[0.8125rem] font-medium text-danger" role="alert">
              {errors.body}
            </p>
          ) : (
            <p className="mt-1.5 text-[0.8125rem] text-muted">
              Supports **bold**, *italic*, ## headings, - lists, &gt; quotes and links.
            </p>
          )}
        </div>

        <Switch
          checked={pinned}
          onChange={setPinned}
          label="Pin to the top of the classroom"
          description="Pinned posts stay above everything else until you unpin them."
        />

        {kind === 'newsletter' && !editing && (
          <div className="rounded-[2px] border border-line border-l-4 border-l-blue bg-surface-2 px-3.5 py-3 text-sm">
            <p
 className="text-ink/90">
              Every member gets a notification, and members who allow email receive the newsletter in their inbox.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
