import { describe, expect, it, vi } from "vitest";

// PremiumCtaBanner의 secondaryCta(전화 상담)를 site.company.centerTel에서 만든다 —
// centerTel이 없으면(스쿨멘토) 호출부가 secondaryCta 자체를 넘기지 않도록
// undefined를 돌려준다. site.ts처럼 vi.resetModules()로 매번 새로 평가한다.
async function loadBuildPhoneSecondaryCta(siteKey: string) {
  vi.stubEnv("VITE_SITE", siteKey);
  vi.resetModules();
  return import("./premiumContact");
}

describe("buildPhoneSecondaryCta — winning(centerTel 있음)", () => {
  it("라벨은 점 구분, href는 tel: + 숫자만으로 만든다", async () => {
    const { buildPhoneSecondaryCta } =
      await loadBuildPhoneSecondaryCta("winning");

    expect(buildPhoneSecondaryCta()).toEqual({
      label: "전화 상담 051.902.0080",
      href: "tel:0519020080",
    });
  });
});

describe("buildPhoneSecondaryCta — schoolmentor(centerTel 없음)", () => {
  it("undefined를 돌려준다", async () => {
    const { buildPhoneSecondaryCta } =
      await loadBuildPhoneSecondaryCta("schoolmentor");

    expect(buildPhoneSecondaryCta()).toBeUndefined();
  });
});
