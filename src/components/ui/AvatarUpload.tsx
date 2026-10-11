// Your own avatar with a "Change photo" overlay. Hover (or tap on touch screens) opens the file picker; the photo
// is downscaled, uploaded and the signed-in profile is refreshed so every avatar on the site updates at once.
import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Avatar, type AvatarSize } from './Avatar';
import { cn } from './cn';
import { errorMessage, useToast } from './Toast';
import { useAuth } from '../../lib/auth';
import { AVATAR_ACCEPT, prepareAvatar, uploadMyAvatar } from '../../api/me';

export function AvatarUpload({
  src,
  name,
  size = '2xl',
  ring,
  className,
  onChanged,
}: {
  src?: string | null;
  name?: string | null;
  size?: AvatarSize;
  ring?: boolean;
  className?: string;
  onChanged?: (url: string) => void;
}) {
  const { patchProfile, refreshProfile } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const image = await prepareAvatar(file);
      const url = await uploadMyAvatar(image);
      patchProfile({ avatar_url: url });
      void refreshProfile();
      onChanged?.(url);
      toast.success('New photo saved');
    } catch (err) {
      toast.error('Could not change your photo', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="group relative inline-flex shrink-0 rounded-full">
      {/* key forces a fresh <img> (and resets its broken state) whenever the URL changes */}
      <Avatar key={src ?? 'none'} src={src} name={name} size={size} ring={ring} className={className} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label="Change photo"
        title="Change photo"
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-[#001E60]/0 text-xs font-bold text-white opacity-0 transition-[opacity,background-color] duration-150',
          'hover:bg-[#001E60]/65 hover:opacity-100 focus-visible:bg-[#001E60]/65 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          busy && 'bg-[#001E60]/65 opacity-100',
        )}
      >
        {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
        <span className="max-sm:hidden">{busy ? 'Uploading' : 'Change photo'}</span>
      </button>
      {/* always-visible badge so touch users can see the photo is editable */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 right-0.5 grid size-8 place-items-center rounded-full border-2 border-white bg-[#BF0D3E] text-white transition-opacity group-hover:opacity-0"
      >
        <Camera className="size-4" />
      </span>
      <input
        ref={fileRef}
        type="file"
        accept={AVATAR_ACCEPT.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="avatar-file"
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </span>
  );
}
