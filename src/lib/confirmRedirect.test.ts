import { describe, expect, it } from "vitest";
import { confirmRedirectPath } from "./auth";

describe("where the confirmation email link lands", () => {
  it("is onboarding, carrying the page the visitor was headed for", () => {
    // the landing's "Practise Business Law" goes to /signup?next=%2Fplay%2Fbusiness-law
    expect(confirmRedirectPath("/play/business-law")).toBe(
      "onboarding?next=%2Fplay%2Fbusiness-law",
    );
    expect(confirmRedirectPath("/chapter/join/abc?x=1")).toBe(
      "onboarding?next=%2Fchapter%2Fjoin%2Fabc%3Fx%3D1",
    );
  });

  it("is plain onboarding when there is nowhere else to go", () => {
    expect(confirmRedirectPath(undefined)).toBe("onboarding");
    expect(confirmRedirectPath("/")).toBe("onboarding");
  });

  it("never carries a path off the site", () => {
    expect(confirmRedirectPath("https://evil.example/x")).toBe("onboarding");
    expect(confirmRedirectPath("//evil.example/x")).toBe("onboarding");
  });
});
