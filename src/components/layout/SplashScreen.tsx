import { LOGO_WHITE } from './Brand';

/** Full-screen navy loader shown while the session is restored. */
export function SplashScreen() {
  return (
    <div className="fixed inset-0 bg-navy z-[100] grid place-items-center" role="status" aria-label="Loading FBLA United">
      <div className="flex flex-col items-center gap-5">
        <img src={LOGO_WHITE} alt="" className="h-16 w-auto" />
        <div className="h-1 w-28 overflow-hidden bg-white/15">
          <div className="h-full w-1/3 animate-[splash-bar_1.1s_ease-in-out_infinite] bg-white/85 motion-reduce:animate-none" />
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
            className="size-2 animate-bounce bg-navy dark:bg-link"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
