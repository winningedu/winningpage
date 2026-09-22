import { describe, expect, it, vi } from "vitest";

// site.ts는 import.meta.env.VITE_SITE를 모듈 최상단에서 한 번 읽어 `site`를
// 확정한다 — 값을 바꿔 재검증하려면 매번 vi.resetModules() 후 동적 import로
// 모듈을 새로 평가해야 한다(vitest.config.ts test.env 기본값은 "winning").
async function loadSite(siteKey: string) {
  vi.stubEnv("VITE_SITE", siteKey);
  vi.resetModules();
  return import("./site");
}

describe("site — winning", () => {
  it("brandName·로고 경로가 위닝에듀 정본이다", async () => {
    const { site } = await loadSite("winning");

    expect(site.brandName).toBe("위닝에듀");
    expect(site.logo.horizontal).toBe("/images/winning-logo-horizontal.svg");
    expect(site.logo.stacked).toBe("/images/winning-logo-stacked.svg");
  });

  it("favicon 4종(png96·apple-touch·ico·svg)을 모두 가진다", async () => {
    const { site } = await loadSite("winning");

    expect(site.favicon.png96).toBe("/favicon-96x96.png");
    expect(site.favicon.appleTouch).toBe("/apple-touch-icon.png");
    expect(site.favicon.ico).toBe("/favicon.ico");
    expect(site.favicon.svg).toBe("/favicon.svg");
  });
});
