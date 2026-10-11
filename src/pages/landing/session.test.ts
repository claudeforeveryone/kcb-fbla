import { describe, expect, it } from "vitest";
import supabaseSource from "../../lib/supabase.ts?raw";
import { AUTH_IN_URL, AUTH_STORAGE_KEY, mayHaveSession } from "./session";

// fbla-trust's rule (src/lib/sessionHint.ts AUTH_LINK_RE, repeated in its index.html head script). Its main.tsx
// hydrates the prerendered landing when that rule says "signed out", so IndexRoute must agree on every URL, or React
// throws the server HTML away (hydration mismatch) and the page flashes the splash.
const TRUST_AUTH_LINK_RE = /access_token=|[?&]code=|type=(recovery|signup|invite|magiclink)/;

const store = (items: Record<string, string>) => ({
  getItem: (k: string) => (k in items ? items[k] : null),
});

describe("mayHaveSession", () => {
  it("uses the same storage key as the Supabase client", () => {
    expect(supabaseSource).toContain(`storageKey: '${AUTH_STORAGE_KEY}'`);
  });

  it("is false for a first visit: nothing stored, nothing in the URL", () => {
    expect(mayHaveSession(store({}), "https://fblc.ca/")).toBe(false);
    expect(mayHaveSession(store({}), "https://fblc.ca/#platform")).toBe(false);
  });

  it("is true when a session is stored", () => {
    expect(
      mayHaveSession(store({ [AUTH_STORAGE_KEY]: "{}" }), "https://fblc.ca/"),
    ).toBe(true);
  });

  it("is true while a sign-in link is being completed", () => {
    expect(
      mayHaveSession(store({}), "https://fblc.ca/#access_token=x&type=signup"),
    ).toBe(true);
    expect(mayHaveSession(store({}), "https://fblc.ca/?code=abc")).toBe(true);
    expect(
      mayHaveSession(
        store({}),
        "https://fblc.ca/update-password?type=recovery",
      ),
    ).toBe(true);
  });

  it("uses exactly fbla-trust's auth-link rule", () => {
    expect(AUTH_IN_URL.source).toBe(TRUST_AUTH_LINK_RE.source);
    expect(AUTH_IN_URL.flags).toBe(TRUST_AUTH_LINK_RE.flags);
  });

  it("agrees with fbla-trust on links that only look like auth links", () => {
    // an expired email link falls back to the site URL with an error in the hash: no session comes of it
    for (const href of [
      "https://fblc.ca/#error=access_denied&error_description=expired",
      "https://fblc.ca/#code=abc",
      "https://fblc.ca/?barcode=1",
      "https://fblc.ca/terms?type=print",
    ]) {
      expect(mayHaveSession(store({}), href), href).toBe(
        TRUST_AUTH_LINK_RE.test(href),
      );
      expect(mayHaveSession(store({}), href), href).toBe(false);
    }
  });

  it("keeps the splash when storage cannot be read", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(mayHaveSession(broken, "https://fblc.ca/")).toBe(true);
    expect(mayHaveSession(null, "https://fblc.ca/")).toBe(true);
  });
});
