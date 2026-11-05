import { describe, expect, it, vi } from "vitest";

async function loadWording(stripWinningPrefix: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    site: { features: { stripWinningPrefix } },
  }));
  return import("./wording");
}

describe("siteWording - 접두어를 빼는 사이트(schoolmentor)", () => {
  it.each([
    ["위닝 수행평가", "수행평가"],
    ["위닝 자기평가서", "자기평가서"],
    ["위닝 성장설계", "성장설계"],
    ["위닝 심화탐구", "심화탐구"],
    ["위닝 목표관리", "목표관리"],
    ["위닝 자기평가서에서 하기", "자기평가서에서 하기"],
    ["위닝 성장설계 리포트 발행", "성장설계 리포트 발행"],
  ])("'%s'는 '%s'가 된다", async (input, expected) => {
    const { siteWording } = await loadWording(true);

    expect(siteWording(input)).toBe(expected);
  });

  it("'위닝 내부 기준'은 '서비스 내부 기준'이 된다", async () => {
    const { siteWording } = await loadWording(true);

    expect(
      siteWording(
        "평가는 위닝 내부 기준이에요. 합격 가능성을 예측하지 않아요.",
      ),
    ).toBe("평가는 서비스 내부 기준이에요. 합격 가능성을 예측하지 않아요.");
  });

  it("'진행단계'는 '진행 단계'가 된다(결정 14)", async () => {
    const { siteWording } = await loadWording(true);

    expect(siteWording("진행단계")).toBe("진행 단계");
  });

  it("브랜드 이름 '위닝에듀'와 다른 문장은 그대로 둔다", async () => {
    const { siteWording } = await loadWording(true);

    expect(siteWording("위닝에듀 위닝 A~E 5축")).toBe("위닝에듀 위닝 A~E 5축");
  });
});

describe("siteWording - 접두어를 유지하는 사이트(winning)", () => {
  it("문구를 그대로 돌려준다", async () => {
    const { siteWording } = await loadWording(false);

    expect(siteWording("위닝 수행평가, 위닝 내부 기준, 진행단계")).toBe(
      "위닝 수행평가, 위닝 내부 기준, 진행단계",
    );
  });
});
