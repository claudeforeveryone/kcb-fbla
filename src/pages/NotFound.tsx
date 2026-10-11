import { useLocation } from 'react-router-dom';
import { ArrowLeft, House, Target } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { FacetArt } from '../components/ui/PageHeader';

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-20">
      <div className="relative isolate overflow-hidden band rounded-[4px] border border-t-4 border-line border-t-red px-6 py-14 text-center text-white sm:px-12">
        <FacetArt className="w-full opacity-60" />
        <div className="relative">
          <p className="tabular font-display text-7xl font-extrabold tracking-tight text-white sm:text-8xl">
            4<span className="text-red">0</span>4
          </p>
          <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">This page is off the board</h1>
          <p className="mx-auto mt-3 max-w-md text-white/75">
            We could not find <code className="rounded-[2px] bg-white/10 px-1.5 py-0.5 text-sm">{pathname}</code>. It may have
            moved, or the link is out of date.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <ButtonLink to="/" variant="inverse" leftIcon={<House className="size-4" />}>
              Go home
            </ButtonLink>
            <ButtonLink to="/play" variant="accent" leftIcon={<Target className="size-4" />}>
              Practise an event
            </ButtonLink>
          </div>
        </div>
      </div>
      <div className="mt-6 text-center">
        <button type="button" onClick={() => window.history.back()} className="link inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" /> Back to the previous page
        </button>
      </div>
    </div>
  );
}
