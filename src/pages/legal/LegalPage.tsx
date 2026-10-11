import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useScrollToHash } from '../../lib/hydration';
import { CONTACT_EMAIL } from '../../lib/seo';

export type LegalSectionMeta = { id: string; title: string };

/**
 * Shared frame for the Terms and Privacy pages: the page band, then a contents list (a fold-out on phones, a sticky
 * column from laptop width up) beside a plain reading column.
 */
export function LegalPage({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSectionMeta[];
  children: ReactNode;
}) {
  // A shared link to one section (/privacy#choices) opens at that section, also for signed-in members.
  useScrollToHash();
  return (
    <>
      {/* Balanced lines: at desktop width the intro otherwise leaves its last two words alone on a second line. */}
      <PageHeader size="sm" title={title} subtitle={intro} className="[&_p]:text-balance" />
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:grid lg:grid-cols-[14rem_minmax(0,68ch)] lg:gap-16 lg:px-10 xl:gap-24">
        <Contents sections={sections} />
        <article className="min-w-0 text-base leading-[1.7] text-ink">{children}</article>
      </div>
    </>
  );
}

function Contents({ sections }: { sections: LegalSectionMeta[] }) {
  const list = (
    <ol className="text-sm">
      {sections.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="block py-2 text-ink underline-offset-4 transition-colors hover:text-link hover:underline lg:py-1.5"
          >
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <details className="group mb-8 border border-line bg-surface lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-display font-semibold text-heading [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown aria-hidden className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-4 py-2">{list}</div>
      </details>
      <nav aria-label="On this page" className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
        <h2 className="mb-2 font-display text-sm font-bold text-heading">On this page</h2>
        {list}
      </nav>
    </>
  );
}

export function LegalSection({ id, title, children }: LegalSectionMeta & { children: ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-28 first:mt-0">
      <h2 className="font-display text-xl font-bold tracking-tight text-heading md:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** The plain-language summary at the top of each page. Flat surface, no coloured side rule. */
export function ShortVersion({ children }: { children: ReactNode }) {
  return (
    <aside className="mb-12 border border-line bg-surface-2 p-5 md:p-6" aria-labelledby="short-version">
      <h2 id="short-version" className="font-display text-lg font-bold text-heading">
        The short version
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-red">{children}</ul>
    </aside>
  );
}

/** A label and an explanation. Stacks on phones, two columns from tablet width up. */
export function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4 md:grid-cols-[10rem_1fr] md:gap-6">
      <dt className="font-semibold text-heading">{term}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

export function Items({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-line border-y border-line">{children}</dl>;
}

/** Underlined in running text, so links never rely on colour alone. */
export const PROSE_LINK = 'font-semibold text-link underline underline-offset-[3px] hover:text-heading';

export function ContactEmail() {
  return (
    <a className={PROSE_LINK} href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  );
}
