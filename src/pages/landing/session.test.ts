import { describe, expect, it } from "vitest";
import supabaseSource from "../../lib/supabase.ts?raw";
import { AUTH_STORAGE_KEY, mayHaveSession } from "./session";

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
      mayHaveSession(store({}), "https://fblc.ca/#error_description=expired"),
    ).toBe(true);
    expect(
      mayHaveSession(
        store({}),
        "https://fblc.ca/update-password?type=recovery",
      ),
    ).toBe(true);
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
