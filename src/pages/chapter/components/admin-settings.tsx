// Admin > Settings: chapter details, presidency transfer and deletion (president only).
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, Input, Modal, Select, Textarea, cn, errorMessage, useToast } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import type { Chapter, ChapterRole } from '../../../lib/types';
import { deleteChapter, transferPresidency, updateChapter, type RosterMember } from '../../../api/chapter';
import { REGIONS, RoleBadge } from './admin-shared';

export function SettingsPanel({
  chapter,
  myId,
  myRole,
  members,
  onSaved,
  onTransferred,
}: {
  chapter: Chapter;
  myId: string;
  myRole: ChapterRole;
  members: RosterMember[] | undefined;
  onSaved: (c: Chapter) => void;
  onTransferred: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [name, setName] = useState(chapter.name);
  const [school, setSchool] = useState(chapter.school ?? '');
  const [region, setRegion] = useState(chapter.region ?? '');
  const [description, setDescription] = useState(chapter.description ?? '');
  const [saving, setSaving] = useState(false);
  const [heir, setHeir] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const president = myRole === 'president';

  useEffect(() => {
    setName(chapter.name);
    setSchool(chapter.school ?? '');
    setRegion(chapter.region ?? '');
    setDescription(chapter.description ?? '');
  }, [chapter]);

  const dirty =
    name.trim() !== chapter.name ||
    (school.trim() || null) !== chapter.school ||
    (region || null) !== chapter.region ||
    (description.trim() || null) !== chapter.description;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('The chapter needs a name', 'At least 2 characters.');
      return;
    }
    setSaving(true);
    try {
      const c = await updateChapter(chapter.id, { name, school, region, description });
      onSaved(c);
      toast.success('Chapter details saved');
    } catch (err) {
      toast.error('Could not save', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const others = (members ?? []).filter((m) => m.user_id !== myId);
  const heirMember = others.find((m) => m.user_id === heir);
  const regionOptions = REGIONS.includes(region) || !region ? REGIONS : [region, ...REGIONS];

  return (
    <div className="space-y-6">
      <Card as="section">
        <CardHeader title="Chapter details" subtitle="Shown on the chapter page, invite page and chapter leaderboard." />
        <form onSubmit={save} className="grid gap-5">
          <Input label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input label="School" value={school} maxLength={120} onChange={(e) => setSchool(e.target.value)} />
            <Select
              label="Province or region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              options={[{ value: '', label: 'Not set' }, ...regionOptions.map((r) => ({ value: r, label: r }))]}
            />
          </div>
          <Textarea
            label="Description"
            value={description}
            maxLength={1000}
            rows={4}
            onChange={(e) => setDescription(e.target.value)}
            corner={`${description.length}/1000`}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" className={cn(!president && 'opacity-90')}>
        <CardHeader
          title="Transfer presidency"
          subtitle={
            president
              ? "Hand the chapter to another member. You'll become an executive."
              : 'Only the president can hand over the chapter.'
          }
        />
        {president ? (
          others.length === 0 ? (
            <p className="text-sm text-muted">Invite at least one member before you can transfer the chapter.</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Select
                className="flex-1"
                label="New president"
                value={heir}
                onChange={(e) => setHeir(e.target.value)}
                placeholder="Choose a member"
                options={others
                  .slice()
                  .sort((a, b) => (a.role === 'executive' ? -1 : 0) - (b.role === 'executive' ? -1 : 0) || a.profile.display_name.localeCompare(b.profile.display_name))
                  .map((m) => ({ value: m.user_id, label: `${m.profile.display_name} (@${m.profile.username})${m.role === 'executive' ? ' · Executive' : ''}` }))}
              />
              <Button variant="secondary" disabled={!heir} onClick={() => setTransferOpen(true)}>
                Transfer
              </Button>
            </div>
          )
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <RoleBadge role="president" />
            <span className="text-muted">
              {(members ?? []).find((m) => m.role === 'president')?.profile.display_name ?? 'Unknown'}
            </span>
          </div>
        )}
      </Card>

      {president && (
        <Card as="section" className="border-danger/40">
          <CardHeader
            title="Delete chapter"
            subtitle="Removes the chapter, its classroom, tests, decks, assignments and attendance. Members keep their own stats and Elo."
          />
          <Button variant="danger" onClick={() => setDeleteOpen(true)} leftIcon={<Trash2 className="size-4" />}>
            Delete {chapter.name}
          </Button>
        </Card>
      )}

      <TransferModal
        open={transferOpen}
        heir={heirMember}
        chapterName={chapter.name}
        onClose={() => setTransferOpen(false)}
        onConfirm={async () => {
          if (!heirMember) return;
          await transferPresidency(chapter.id, heirMember.user_id);
          toast.success(`${heirMember.profile.display_name} is now president`, "You're an executive now.");
          setHeir('');
          onTransferred();
        }}
      />
      <DeleteModal
        open={deleteOpen}
        chapterName={chapter.name}
        memberCount={members?.length ?? 1}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async (typed) => {
          await deleteChapter(chapter.id, typed);
          await refreshProfile();
          toast.success('Chapter deleted');
          navigate('/chapter', { replace: true });
        }}
      />
    </div>
  );
}

function TransferModal({
  open,
  heir,
  chapterName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  heir: RosterMember | undefined;
  chapterName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      toast.error('Could not transfer', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Make ${heir?.profile.display_name ?? 'them'} president?`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" onClick={go} loading={busy}>
            Transfer presidency
          </Button>
        </>
      }
    >
      {heir && (
        <div className="flex items-center gap-3 rounded-[2px] border border-line p-3">
          <Avatar src={heir.profile.avatar_url} name={heir.profile.display_name} />
          <div>
            <div className="font-semibold">{heir.profile.display_name}</div>
            <div className="text-sm text-muted">@{heir.profile.username}</div>
          </div>
        </div>
      )}
      <p className="mt-4 text-sm text-ink">
        They take full control of {chapterName}, including deleting it. You become an executive and can't undo this
        yourself; only the new president can hand it back.
      </p>
    </Modal>
  );
}

function DeleteModal({
  open,
  chapterName,
  memberCount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  chapterName: string;
  memberCount: number;
  onClose: () => void;
  onConfirm: (typed: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const match = typed.trim().toLowerCase() === chapterName.trim().toLowerCase();
  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (!match) return;
    setBusy(true);
    try {
      await onConfirm(typed);
    } catch (err) {
      toast.error('Could not delete', errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Delete this chapter?"
      description={`This can't be undone. ${memberCount > 1 ? `All ${memberCount} members will be removed and notified.` : ''}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" type="submit" form="delete-chapter" disabled={!match} loading={busy} leftIcon={<Trash2 className="size-4" />}>
            Delete forever
          </Button>
        </>
      }
    >
      <form id="delete-chapter" onSubmit={go}>
        <Input
          label={
            <>
              Type <strong className="font-bold">{chapterName}</strong> to confirm
            </>
          }
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </form>
    </Modal>
  );
}
