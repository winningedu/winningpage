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

  it("company에 사업자 정보 전체 필드를 담는다", async () => {
    const { site } = await loadSite("winning");

    expect(site.company.name).toBe("주식회사 위닝에듀");
    expect(site.company.ceo).toBe("강원석");
    expect(site.company.corpRegNo).toBe("180111-0161411");
    expect(site.company.bizRegNo).toBe("266-88-03449");
    expect(site.company.address).toBe("(본점) 세종특별자치시 마음안1로 61, 404호");
    expect(site.company.patentNo).toBe("10-2024-0048889");
    expect(site.company.mailOrderNo).toBe("제2026-세종아름-0264호");
    expect(site.company.supportChannelLabel).toBe("카카오 채널 '위닝에듀'");
    expect(site.company.tel).toBe("010-3664-0081");
    expect(site.company.centerTel).toBe("051-902-0080");
    expect(site.company.kakao).toBe("winningedu_official");
    expect(site.company.kakaoChannelUrl).toBe("https://pf.kakao.com/_EfjwX");
  });
});

describe("site — schoolmentor", () => {
  it("brandName·로고 경로가 스쿨멘토 정본이다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.brandName).toBe("스쿨멘토");
    expect(site.logo.horizontal).toBe(
      "/images/schoolmentor-logo-horizontal.png",
    );
    expect(site.logo.stacked).toBe("/images/schoolmentor-logo-stacked.png");
  });

  it("favicon은 /schoolmentor/ 경로 3종만 있고 svg는 없다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.favicon.png96).toBe("/schoolmentor/favicon-96x96.png");
    expect(site.favicon.appleTouch).toBe(
      "/schoolmentor/apple-touch-icon.png",
    );
    expect(site.favicon.ico).toBe("/schoolmentor/favicon.ico");
    expect(site.favicon.svg).toBeUndefined();
  });

  it("company는 필수 필드만 있고 선택 필드(특허·통신판매업·고객센터·연락처)는 전부 없다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.company.name).toBe("주식회사 위닝로직");
    expect(site.company.ceo).toBe("강원석");
    expect(site.company.corpRegNo).toBe("164711-0016571");
    expect(site.company.bizRegNo).toBe("783-81-04298");
    expect(site.company.address).toBe(
      "세종특별자치시 마음안1로 61, 404-B호 (고운동, 세종 리치먼드힐2 타운하우스)",
    );
    expect(site.company.patentNo).toBeUndefined();
    expect(site.company.mailOrderNo).toBeUndefined();
    expect(site.company.supportChannelLabel).toBeUndefined();
    expect(site.company.tel).toBeUndefined();
    expect(site.company.centerTel).toBeUndefined();
    expect(site.company.kakao).toBeUndefined();
    expect(site.company.kakaoChannelUrl).toBeUndefined();
  });
});

describe("site — 잘못된 VITE_SITE", () => {
  it("winning/schoolmentor가 아니면 throw한다", async () => {
    vi.stubEnv("VITE_SITE", "tokyo");
    vi.resetModules();

    await expect(import("./site")).rejects.toThrow(
      /VITE_SITE 누락\/오류/,
    );
  });
});
