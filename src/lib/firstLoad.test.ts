// What every visit downloads before the first paint is the app's main chunk: main.tsx and everything it imports
// statically. The Supabase client (supabase-js, about a third of that chunk) is not needed to paint any page, and a
// signed-out visitor on "/" or another prerendered page may never need it, so the modules on that path reach it only
// through loadSupabase() (a dynamic import). Pages that are lazy chunks may import ./supabase directly.
import { describe, expect, it } from "vitest";

const globbed = import.meta.glob(
  ["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;
// keys as paths from src/ ("../lib/auth.tsx"): the glob names this folder's own files "./auth.tsx"
const sources: Record<string, string> = Object.fromEntries(
  Object.entries(globbed).map(([k, v]) => [k.replace(/^\.\//, "../lib/"), v]),
);

/** Static import specifiers that bring in runtime code (type-only imports are erased by the compiler). */
function runtimeImports(src: string): string[] {
  const out: string[] = [];
  const re =
    /(?:^|\n)\s*(?:import|export)\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    const clause = (m[1] ?? "").trim();
    if (/^type\b/.test(clause)) continue;
    // import { type A, type B } from '...'
    if (/^\{\s*(type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,?\s*)+\}$/.test(clause))
      continue;
    out.push(m[2] ?? m[3]);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return spec;
  const parts = from.split("/").slice(0, -1);
  for (const p of spec.split("/")) {
    if (p === "..") parts.pop();
    else if (p !== ".") parts.push(p);
  }
  const base = parts.join("/");
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"])
    if (sources[base + ext] !== undefined) return base + ext;
  return null; // css, images, fonts, html
}

/** Every module main.tsx reaches through static imports, with the module that first imported it. */
function firstLoadGraph(): Map<string, string | null> {
  const seen = new Map<string, string | null>([["../main.tsx", null]]);
  const queue = ["../main.tsx"];
  while (queue.length) {
    const file = queue.shift()!;
    for (const spec of runtimeImports(sources[file] ?? "")) {
      const to = resolve(file, spec);
      if (!to || seen.has(to)) continue;
      seen.set(to, file);
      if (sources[to] !== undefined) queue.push(to);
    }
  }
  return seen;
}

function chain(graph: Map<string, string | null>, to: string): string {
  const path = [to];
  for (let at = graph.get(to); at; at = graph.get(at)) path.push(at);
  return path.reverse().join(" -> ");
}

describe("the first-load chunk", () => {
  it("finds the app shell (the walk itself works)", () => {
    const graph = firstLoadGraph();
    expect(graph.has("../lib/auth.tsx")).toBe(true);
    expect(graph.has("../components/layout/AppShell.tsx")).toBe(true);
    expect(graph.has("react-router-dom")).toBe(true);
  });

  it("does not contain the Supabase client: modules on the first-load path use loadSupabase()", () => {
    const graph = firstLoadGraph();
    const leaks = [...graph.keys()].filter(
      (m) => m === "../lib/supabase.ts" || m.startsWith("@supabase/"),
    );
    expect(leaks.map((m) => chain(graph, m))).toEqual([]);
  });
});
