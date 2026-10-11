import { Link } from 'react-router-dom';
import { ExternalLink, Heart } from 'lucide-react';
import { cn } from '../ui/cn';
import { useCurrentYear } from '../../lib/hydration';
import { LOGO_WHITE } from './Brand';

const LINK = 'text-white/85 underline-offset-4 hover:text-white hover:underline';
/** Footer list links: a 44 px row on phones (thumb-sized), plain text rows from md up. */
const ROW = cn('inline-flex min-h-11 items-center gap-1 md:min-h-0', LINK);

export function Footer({ className }: { className?: string }) {
  // Prerendered with the build year; the visitor's own year replaces it right after hydration.
  const year = useCurrentYear();
  return (
    <footer className={cn('mt-16 bg-[#001E60] text-white', className)}>
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] md:gap-8 lg:px-10">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-3">
            <img src={LOGO_WHITE} alt="" className="h-10 w-auto" />
            <div>
              <div className="font-display text-lg font-extrabold text-white">FBLC</div>
              <div className="text-xs text-white/70">Practise. Compete. Lead.</div>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm text-white/80">
            FBLA-style practice exams, vocab and 1v1 duels for FBL Canada members, plus the tools our chapter
            executives use to run the club.
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-white">
            Built with
            <Heart aria-label="love" role="img" className="size-4 shrink-0 fill-current text-[#ff7d98]" />
            by Joseph &amp; Kaden
          </p>
        </div>
        <nav aria-label="Practice" className="text-sm">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/60 md:mb-3">Practice</div>
          <ul className="md:space-y-2">
            <li><Link className={ROW} to="/play">Exams by event</Link></li>
            <li><Link className={ROW} to="/vocab">Vocab decks</Link></li>
            <li><Link className={ROW} to="/arena">Arena duels</Link></li>
            <li><Link className={ROW} to="/leaderboard">Leaderboard</Link></li>
          </ul>
        </nav>
        <nav aria-label="Resources" className="text-sm">
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-white/60 md:mb-3">Resources</div>
          <ul className="md:space-y-2">
            <li><Link className={ROW} to="/chapter">Your chapter</Link></li>
            <li>
              <a
                className={ROW}
                href="https://fblc.ca/cnlc-resources"
                target="_blank"
                rel="noreferrer"
              >
                FBLC CNLC resources <ExternalLink className="size-3.5" />
              </a>
            </li>
            <li>
              <a className={ROW} href="https://fblc.ca" target="_blank" rel="noreferrer">
                fblc.ca <ExternalLink className="size-3.5" />
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="bg-[#00143f]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-4 py-3 text-xs text-white/75 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-6 lg:px-10">
          <p className="max-w-3xl leading-relaxed">
            &copy; {year} Joseph &amp; Kaden. An independent student study site, not affiliated with or endorsed by FBLA-PBL
            or FBL Canada. Practice questions are unofficial and written for study.
          </p>
          <nav aria-label="Legal" className="-mx-2 flex shrink-0">
            <Link className={cn('inline-flex min-h-11 items-center px-2 sm:min-h-9', LINK)} to="/terms">
              Terms of use
            </Link>
            <Link className={cn('inline-flex min-h-11 items-center px-2 sm:min-h-9', LINK)} to="/privacy">
              Privacy policy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
