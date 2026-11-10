import { describe, expect, it, vi } from "vitest";

async function loadWording(stripWinningPrefix: boolean) {
  vi.resetModules();
  vi.doMock("@/config/site", () => ({
    site: { brandName: "스쿨멘토", features: { stripWinningPrefix } },
  }));
  return import("./wording");
}

describe("siteWording - 접두어를 빼는 사이트(schoolmentor)", () => {
  it.each([
    ["위닝 수행평가", "수행평가"],
    ["위닝 자기평가서", "자기평가"],
    ["위닝 학습진단", "학습진단"],
    ["위닝 성장설계", "성장설계"],
    ["위닝 심화탐구", "심화탐구"],
    ["위닝 목표관리", "목표관리"],
    ["위닝 자기평가서에서 하기", "자기평가에서 하기"],
    [
      "자기평가서는 학생이 제출하는 문서예요",
      "자기평가서는 학생이 제출하는 문서예요",
    ],
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

  it.each([
    ["위닝 내부 추정이에요.", "서비스 내부 추정이에요."],
    ["위닝 A부터 E 5축 진단", "A부터 E 5축 진단"],
    ["위닝 A~E 5축", "A~E 5축"],
    ["위닝에 저장된 활동", "스쿨멘토에 저장된 활동"],
    ["위닝에서 만든 기록", "스쿨멘토에서 만든 기록"],
    ["다른 위닝 서비스에서도", "다른 스쿨멘토 서비스에서도"],
    ["위닝 채팅", "스쿨멘토 채팅"],
    ["위닝에듀", "위닝에듀"],
    ["무료진단에서 가져옴", "학습진단에서 가져옴"],
    ["저장된 활동에서 확인", "이미 채워진 항목"],
    [
      "저장된 활동에서 확인한 3문항을 미리 채웠어요",
      "저장된 활동에서 확인한 3문항을 미리 채웠어요",
    ],
  ])("'%s'는 '%s'가 된다", async (input, expected) => {
    const { siteWording } = await loadWording(true);

    expect(siteWording(input)).toBe(expected);
  });
});

describe("siteWording - 접두어를 유지하는 사이트(winning)", () => {
  it("문구를 그대로 돌려준다", async () => {
    const { siteWording } = await loadWording(false);

    const input =
      "위닝 수행평가, 위닝 자기평가서, 위닝 학습진단, 위닝 내부 기준, 위닝 내부 추정, 위닝 A부터 E, 위닝 A~E, 위닝에 저장된 활동, 위닝 채팅, 무료진단, 저장된 활동에서 확인, 진행단계";

    expect(siteWording(input)).toBe(input);
  });
});
