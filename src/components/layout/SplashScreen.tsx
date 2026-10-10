import { LOGO_WHITE } from './Brand';

/** Full-screen navy loader shown while the session is restored. */
export function SplashScreen() {
  return (
    <div className="facets fixed inset-0 z-[100] grid place-items-center" role="status" aria-label="Loading KCB FBLA">
      <div className="flex flex-col items-center gap-5">
        <img src={LOGO_WHITE} alt="" className="h-16 w-auto animate-pulse" />
        <div className="h-1 w-28 overflow-hidden rounded-full bg-white/15">
          <div className="animate-shimmer h-full w-full bg-[length:200%_100%] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.85),transparent)]" />
        </div>
      </div>
    </div>
  );
}

/** In-page loader for lazy route chunks (keeps the shell visible). */
export function RouteFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="Loading page">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 animate-bounce rounded-full bg-navy dark:bg-link"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
