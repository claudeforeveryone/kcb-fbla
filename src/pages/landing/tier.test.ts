import { describe, expect, it } from "vitest";
import { isSoftwareRenderer, tierFor, type LandingEnv } from "./tier";

const desktop: LandingEnv = {
  width: 1440,
  cores: 12,
  memoryGb: 8,
  webgl2: true,
  software: false,
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

  it("uses the lite room on phone widths", () => {
    expect(tierFor({ ...desktop, width: 390 })).toBe("lite");
    expect(tierFor({ ...desktop, width: 767 })).toBe("lite");
    expect(tierFor({ ...desktop, width: 768 })).toBe("full");
  });

  it("uses the lite room on low-core and low-memory devices", () => {
    expect(tierFor({ ...desktop, cores: 4 })).toBe("lite");
    expect(tierFor({ ...desktop, memoryGb: 4 })).toBe("lite");
    expect(tierFor({ ...desktop, cores: null, memoryGb: null })).toBe("full");
  });

  it("uses the static frame on very low memory", () => {
    expect(tierFor({ ...desktop, memoryGb: 2 })).toBe("poster");
    expect(tierFor({ ...desktop, width: 390, memoryGb: 1 })).toBe("poster");
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
