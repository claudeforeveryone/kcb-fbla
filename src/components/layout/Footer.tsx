import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { cn } from '../ui/cn';
import { LOGO_WHITE } from './Brand';

export function Footer({ className }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={cn('mt-16 border-t border-line bg-surface', className)}>
      <div className="mx-auto grid w-full max-w-[1440px] lg:px-10 gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-[2px] bg-navy">
              <img src={LOGO_WHITE} alt="" className="h-7 w-auto" />
            </span>
            <div>
              <div className="font-display text-lg font-extrabold text-heading">FBLC</div>
              <div className="text-xs text-muted">Practise. Compete. Lead.</div>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted">
            Official-style practice exams, vocab and 1v1 duels for FBL Canada members, plus the tools our chapter
            executives use to run the club.
          </p>
        </div>
        <nav aria-label="Practice" className="text-sm">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Practice</div>
          <ul className="space-y-2">
            <li><Link className="text-ink hover:text-link" to="/play">Exams by event</Link></li>
            <li><Link className="text-ink hover:text-link" to="/vocab">Vocab decks</Link></li>
            <li><Link className="text-ink hover:text-link" to="/arena">Arena duels</Link></li>
            <li><Link className="text-ink hover:text-link" to="/leaderboard">Leaderboard</Link></li>
          </ul>
        </nav>
        <nav aria-label="Resources" className="text-sm">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Resources</div>
          <ul className="space-y-2">
            <li><Link className="text-ink hover:text-link" to="/chapter">Your chapter</Link></li>
            <li>
              <a
                className="inline-flex items-center gap-1 text-ink hover:text-link"
                href="https://fblc.ca/cnlc-resources"
                target="_blank"
                rel="noreferrer"
              >
                FBLC CNLC resources <ExternalLink className="size-3.5" />
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-1 text-ink hover:text-link"
                href="https://fblc.ca"
                target="_blank"
                rel="noreferrer"
              >
                fblc.ca <ExternalLink className="size-3.5" />
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1440px] lg:px-10 flex-col gap-1 px-4 py-4 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
          <span>&copy; {year} FBLC. Student-run practice platform.</span>
          <span>Practice questions are unofficial and written for study.</span>
        </div>
      </div>
    </footer>
  );
}
