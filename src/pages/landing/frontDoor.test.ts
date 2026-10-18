import { describe, expect, it } from "vitest";
import { renderRoute } from "../../entry-server";
import { assertPageContent } from "../../lib/prerender";

// The signed-out "/" exactly as the build prerenders it (scripts/prerender.mjs renders the real app tree through
// entry-server.tsx). The landing is the public front door, so it must never ship without the credits and the legal
// links the footer carries (review round 2: they came from fbla-trust, which this branch now includes).
describe('signed-out "/" (the prerendered front door)', () => {
  it("is the landing in full, with the credit line and the Terms and Privacy links", async () => {
    const html = await renderRoute("/");

    // a whole page: a <main> with its h1 and text, no Suspense boundary left for a script to fill in
    expect(() => assertPageContent(html)).not.toThrow();
    expect(html).toMatch(/<h1[^>]*id="hero-title"/);
    expect(html).toContain("Practise for FBLA.");
    // the sections below the hero are in the HTML too (not left to the client)
    for (const id of ["platform", "events", "preview", "join"])
      expect(html).toContain(`id="${id}"`);

    const footer = html.match(/<footer[\s\S]*<\/footer>/)?.[0] ?? "";
    expect(footer).toMatch(
      /Built with[\s\S]*?aria-label="love"[\s\S]*?by Joseph &amp; Kaden/,
    );
    expect(footer).toContain('href="/terms"');
    expect(footer).toContain('href="/privacy"');
  }, 60_000);
});
