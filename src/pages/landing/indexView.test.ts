import { describe, expect, it } from "vitest";
import { indexView } from "./indexView";

const session = { user: { id: "u1" } };
const profile = { id: "u1" };

describe("indexView: what '/' shows", () => {
  it("a first visit with no stored session gets the landing while auth loads (no splash first)", () => {
    expect(
      indexView({
        loading: true,
        signedOutAtLoad: true,
        session: null,
        profile: null,
      }),
    ).toBe("landing");
  });

  it("a visitor who may be signed in sees the splash while auth loads, never the landing", () => {
    expect(
      indexView({
        loading: true,
        signedOutAtLoad: false,
        session: null,
        profile: null,
      }),
    ).toBe("splash");
  });

  it("no session once auth has loaded is the landing, whatever the first guess was", () => {
    for (const signedOutAtLoad of [true, false]) {
      expect(
        indexView({
          loading: false,
          signedOutAtLoad,
          session: null,
          profile: null,
        }),
      ).toBe("landing");
    }
  });

  it("a session without a profile goes to onboarding", () => {
    expect(
      indexView({
        loading: false,
        signedOutAtLoad: false,
        session,
        profile: null,
      }),
    ).toBe("onboarding");
  });

  it("a member with a profile gets Home, never the landing", () => {
    for (const signedOutAtLoad of [true, false]) {
      expect(
        indexView({ loading: false, signedOutAtLoad, session, profile }),
      ).toBe("home");
    }
  });
});
