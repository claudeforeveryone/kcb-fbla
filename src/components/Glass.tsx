import { useEffect, useRef, useState } from "react";
import type { GlassText } from "./glass3d";

// The still rendition: the same award drawn flat, shown first and kept when WebGL isn't up to it.
function GlassStill({ text }: { text: GlassText }) {
  return (
    <svg
      viewBox="0 0 240 330"
      className="h-full w-auto"
      role="img"
      aria-label={`The FBLA Glass, engraved ${text.name}`}
    >
      <defs>
        <linearGradient id="gl-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".55" />
          <stop offset=".45" stopColor="#cfe0ff" stopOpacity=".18" />
          <stop offset="1" stopColor="#9cc0ff" stopOpacity=".35" />
        </linearGradient>
        <linearGradient id="gl-gold" x1="0" x2="1">
          <stop offset="0" stopColor="#c88f12" />
          <stop offset=".5" stopColor="#f6cd62" />
          <stop offset="1" stopColor="#c88f12" />
        </linearGradient>
      </defs>
      <polygon
        points="50,262 190,262 190,70 120,14 50,70"
        fill="url(#gl-body)"
        stroke="#e8f0ff"
        strokeOpacity=".8"
        strokeWidth="2"
      />
      <polygon
        points="58,256 182,256 182,74 120,24 58,74"
        fill="none"
        stroke="#ffffff"
        strokeOpacity=".25"
      />
      <polygon
        points="120,62 136,88 104,88"
        fill="none"
        stroke="#fff"
        strokeOpacity=".85"
        strokeWidth="2.5"
      />
      <g
        fill="#fff"
        fillOpacity=".9"
        textAnchor="middle"
        fontFamily="Barlow Condensed, Barlow, sans-serif"
        fontWeight="700"
      >
        <text x="120" y="118" fontSize="20">
          KCB FBLA
        </text>
        <text x="120" y="140" fontSize="10" fontWeight="600" letterSpacing="1">
          CHAPTER LEADER
        </text>
        <text x="120" y="176" fontSize={text.name.length > 12 ? 16 : 22}>
          {text.name.toUpperCase()}
        </text>
        <text x="120" y="198" fontSize="10" fontWeight="500">
          {text.line}
        </text>
        <text x="120" y="226" fontSize="9" fontWeight="500">
          {text.year}
        </text>
      </g>
      <rect x="30" y="262" width="180" height="44" fill="#0b2545" />
      <rect x="38" y="262" width="164" height="4" fill="#f0b323" />
      <rect x="60" y="276" width="120" height="18" fill="url(#gl-gold)" />
      <text
        x="120"
        y="290"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#0b2545"
        fontFamily="Barlow Condensed, sans-serif"
      >
        FIRST PLACE
      </text>
    </svg>
  );
}

export function Glass({ text }: { text: GlassText }) {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const key = `${text.name}|${text.line}|${text.year}`;
  useEffect(() => {
    if (new URLSearchParams(location.search).has("still")) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // wait for an idle moment so three.js never competes with the board's first paint
    const idle = (cb: () => void) =>
      "requestIdleCallback" in window
        ? requestIdleCallback(cb, { timeout: 1500 })
        : setTimeout(cb, 300);
    idle(async () => {
      try {
        const m = await import("./glass3d");
        if (cancelled || !host.current || !m.gpuOK()) return;
        await document.fonts?.ready;
        dispose = m.mountGlass(host.current, text, reduced);
        setLive(true);
      } catch {
        /* the still stays */
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
      setLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      {!live && (
        <div className="absolute inset-0 flex items-end justify-center pb-2">
          <GlassStill text={text} />
        </div>
      )}
    </div>
  );
}
