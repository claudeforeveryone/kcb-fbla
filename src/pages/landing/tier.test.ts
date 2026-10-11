import { describe, expect, it } from "vitest";
import {
  isSoftwareRenderer,
  tierFor,
  widthChangesTier,
  type LandingEnv,
} from "./tier";

const desktop: LandingEnv = {
  width: 1440,
  cores: 12,
  memoryGb: 8,
  webgl2: true,
  software: false,
  touchOnly: false,
  declines: 0,
};

describe("tierFor", () => {
  it("gives the full room to a capable desktop", () => {
    expect(tierFor(desktop)).toBe("full");
  });

  it("uses the static frame when WebGL2 is missing or the GPU is a software rasteriser", () => {
    expect(tierFor({ ...desktop, webgl2: false })).toBe("poster");
    expect(tierFor({ ...desktop, software: true })).toBe("poster");
  });

  it("gives phones the static frame, never the WebGL room", () => {
    // phone-first: the room's mount and shader compile were 1.2-1.5 s of blocking time on a 4x-throttled phone
    expect(tierFor({ ...desktop, width: 390 })).toBe("poster");
    expect(tierFor({ ...desktop, width: 767 })).toBe("poster");
    expect(tierFor({ ...desktop, width: 768 })).toBe("full");
  });

  it("gives touch-only devices the static frame at any width (tablets, phones held sideways)", () => {
    expect(tierFor({ ...desktop, width: 844, touchOnly: true })).toBe("poster");
    expect(tierFor({ ...desktop, width: 1366, touchOnly: true })).toBe(
      "poster",
    );
  });

  it("uses the lite room on low-core and low-memory devices", () => {
    expect(tierFor({ ...desktop, cores: 4 })).toBe("lite");
    expect(tierFor({ ...desktop, memoryGb: 4 })).toBe("lite");
    expect(tierFor({ ...desktop, cores: null, memoryGb: null })).toBe("full");
  });

  it("uses the static frame on very low memory", () => {
    expect(tierFor({ ...desktop, memoryGb: 2 })).toBe("poster");
    expect(tierFor({ ...desktop, width: 1280, cores: 2, memoryGb: 1 })).toBe(
      "poster",
    );
  });

  it("steps down after one performance decline and to the static frame after two", () => {
    expect(tierFor({ ...desktop, declines: 1 })).toBe("lite");
    expect(tierFor({ ...desktop, declines: 2 })).toBe("poster");
  });
});

describe("isSoftwareRenderer", () => {
  it("spots the common CPU rasterisers", () => {
    expect(
      isSoftwareRenderer(
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
      ),
    ).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(
      isSoftwareRenderer(
        "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe(true);
  });

  it("accepts real GPUs and unknown renderers", () => {
    expect(
      isSoftwareRenderer(
        "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe(false);
    expect(isSoftwareRenderer("Apple GPU")).toBe(false);
    expect(isSoftwareRenderer("Adreno (TM) 640")).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});

describe("widthChangesTier: when a resize is worth re-reading the device", () => {
  it("a desktop window opened narrow and then widened past the phone width", () => {
    expect(widthChangesTier(700, 1200)).toBe(true);
  });

  it("a wide window narrowed below the phone width", () => {
    expect(widthChangesTier(1440, 600)).toBe(true);
  });

  it("resizes that stay on one side of the line change nothing", () => {
    expect(widthChangesTier(1440, 900)).toBe(false);
    expect(widthChangesTier(390, 700)).toBe(false);
  });

  it("the line itself counts as wide, as in tierFor", () => {
    expect(widthChangesTier(767, 768)).toBe(true);
    expect(widthChangesTier(768, 1024)).toBe(false);
    expect(tierFor({ ...desktop, width: 768 })).toBe("full");
    expect(tierFor({ ...desktop, width: 767 })).toBe("poster");
  });
});
