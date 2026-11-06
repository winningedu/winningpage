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

  it("manifest 경로가 /site.webmanifest다", async () => {
    const { site } = await loadSite("winning");

    expect(site.manifest).toBe("/site.webmanifest");
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
    expect(site.company.address).toBe(
      "(본점) 세종특별자치시 마음안1로 61, 404호",
    );
    expect(site.company.patentNo).toBe("10-3038224-0000");
    expect(site.company.mailOrderNo).toBe("제2026-세종아름-0264호");
    expect(site.company.supportChannelLabel).toBe("카카오 채널 '위닝에듀'");
    expect(site.company.tel).toBe("010-3664-0081");
    expect(site.company.centerTel).toBe("051-902-0080");
    expect(site.company.kakao).toBe("winningedu_official");
    expect(site.company.kakaoChannelUrl).toBe("https://pf.kakao.com/_EfjwX");
    expect(site.company.naverBlogUrl).toBe("https://blog.naver.com/winningedu");
    expect(site.company.youtubeUrl).toBe(
      "https://www.youtube.com/@winningedu-100",
    );
    expect(site.company.instagramUrl).toBe(
      "https://www.instagram.com/winningedu.official/",
    );
    expect(site.company.naverClipUrl).toBe(
      "https://clip.naver.com/@winningedu",
    );
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

  it("manifest 경로가 /schoolmentor/site.webmanifest다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.manifest).toBe("/schoolmentor/site.webmanifest");
  });

  it("favicon은 /schoolmentor/ 경로 3종만 있고 svg는 없다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.favicon.png96).toBe("/schoolmentor/favicon-96x96.png");
    expect(site.favicon.appleTouch).toBe("/schoolmentor/apple-touch-icon.png");
    expect(site.favicon.ico).toBe("/schoolmentor/favicon.ico");
    expect(site.favicon.svg).toBeUndefined();
  });

  it("company는 필수 필드만 있고 선택 필드(특허·통신판매업·고객센터·연락처, 카카오 채널 주소 제외)는 없다", async () => {
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
    expect(site.company.naverBlogUrl).toBeUndefined();
    expect(site.company.youtubeUrl).toBeUndefined();
    expect(site.company.instagramUrl).toBeUndefined();
    expect(site.company.naverClipUrl).toBeUndefined();
  });
});

describe("site - 프리미엄 노출 플래그", () => {
  it("winning은 프리미엄을 노출한다", async () => {
    const { site } = await loadSite("winning");

    expect(site.features.premium).toBe(true);
  });

  it("schoolmentor는 프리미엄을 노출하지 않는다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.features.premium).toBe(false);
  });
});

describe("site - 콜멘토 노출 플래그", () => {
  it("winning은 콜멘토를 노출하고 schoolmentor는 닫는다", async () => {
    expect((await loadSite("winning")).site.features.callmentor).toBe(true);
    expect((await loadSite("schoolmentor")).site.features.callmentor).toBe(
      false,
    );
  });
});

describe("site - 서비스 이름 '위닝 ' 접두어 제거 플래그", () => {
  it("winning은 접두어를 유지하고 schoolmentor는 뺀다", async () => {
    expect((await loadSite("winning")).site.features.stripWinningPrefix).toBe(
      false,
    );
    expect(
      (await loadSite("schoolmentor")).site.features.stripWinningPrefix,
    ).toBe(true);
  });
});

describe("site - 배너 빈 상태 안내 플래그", () => {
  it("winning은 배너가 없으면 영역을 숨긴다(안내 문구 없음)", async () => {
    const { site } = await loadSite("winning");

    expect(site.features.bannerEmptyNotice).toBe(false);
  });

  it("schoolmentor는 배너가 없으면 안내 문구를 보여준다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.features.bannerEmptyNotice).toBe(true);
  });
});

describe("site - 서버 로그인 플래그", () => {
  it("winning은 클라이언트에서 직접 로그인한다", async () => {
    const { site } = await loadSite("winning");

    expect(site.features.serverLogin).toBe(false);
  });

  it("schoolmentor는 서버 로그인을 쓴다", async () => {
    const { site } = await loadSite("schoolmentor");

    expect(site.features.serverLogin).toBe(true);
  });
});

describe("site - 숨길 프로그램 플래그", () => {
  it("env가 없으면 기본값은 빈 배열이다(두 사이트 모두)", async () => {
    vi.stubEnv("VITE_HIDDEN_PROGRAMS", "");

    expect((await loadSite("winning")).site.features.hiddenPrograms).toEqual(
      [],
    );
    expect(
      (await loadSite("schoolmentor")).site.features.hiddenPrograms,
    ).toEqual([]);
  });

  it("VITE_HIDDEN_PROGRAMS 쉼표 목록으로 덮어쓴다(공백, 모르는 키 무시)", async () => {
    vi.stubEnv("VITE_HIDDEN_PROGRAMS", " growth, nope ,inquiry");

    expect((await loadSite("winning")).site.features.hiddenPrograms).toEqual([
      "growth",
      "inquiry",
    ]);
    expect(
      (await loadSite("schoolmentor")).site.features.hiddenPrograms,
    ).toEqual(["growth", "inquiry"]);
  });
});

describe("site - 카카오 채널 주소", () => {
  it("스쿨멘토는 위닝과 같은 카카오 채널 주소를 써서 온라인문의 메뉴가 남는다", async () => {
    const winning = (await loadSite("winning")).site;
    const schoolmentor = (await loadSite("schoolmentor")).site;

    expect(winning.company.kakaoChannelUrl).toBeTruthy();
    expect(schoolmentor.company.kakaoChannelUrl).toBe(
      winning.company.kakaoChannelUrl,
    );
  });
});

describe("site — 잘못된 VITE_SITE", () => {
  it("winning/schoolmentor가 아니면 throw한다", async () => {
    vi.stubEnv("VITE_SITE", "tokyo");
    vi.resetModules();

    await expect(import("./site")).rejects.toThrow(/VITE_SITE 누락\/오류/);
  });
});

describe("site - 학교 학생 가입 플래그", () => {
  it("winning은 기존 가입 흐름을 쓰고 schoolmentor는 학교 가입 흐름을 쓴다", async () => {
    expect((await loadSite("winning")).site.features.schoolSignup).toBe(false);
    expect((await loadSite("schoolmentor")).site.features.schoolSignup).toBe(
      true,
    );
  });
});

describe("site - 학적 셀프서비스 스위치", () => {
  it("스쿨멘토만 학적(학급 입력, 수정요청, 고유코드)을 마이페이지에 보인다", async () => {
    const schoolmentor = await loadSite("schoolmentor");
    expect(schoolmentor.site.features.studentEnrollment).toBe(true);

    const winning = await loadSite("winning");
    expect(winning.site.features.studentEnrollment).toBe(false);
  });
});

describe("site - 본사 기관 관리 스위치", () => {
  it("스쿨멘토만 본사 기관 관리 화면(기관 상세, 학교 관리자)을 연다", async () => {
    expect((await loadSite("schoolmentor")).site.features.hqTenantAdmin).toBe(
      true,
    );
    expect((await loadSite("winning")).site.features.hqTenantAdmin).toBe(false);
  });
});
