// 스쿨멘토 5그룹 메뉴(목표성장서비스, 수행심화서비스, ...)에서도 학습진단 주입, 성장설계 주입,
// 서비스 항목 정렬이 위닝 '서비스' 그룹과 같은 규칙으로 동작하는지 확인한다.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: {
    company: { kakaoChannelUrl: "https://pf.kakao.com/x" },
    features: { premium: true, hiddenPrograms: [] },
  },
}));

const { injectGrowthAndArrangeServiceItems, ensureLearningDiagnosisInService } =
  await import("./useNavGroups");

function group(title: string, items: Array<[string, string]>) {
  return {
    title,
    to: items[0]?.[1] ?? "/",
    items: items.map(([label, to], i) => ({ label, to, sortOrder: i + 1 })),
  };
}

const GOAL_GROUP = "목표성장서비스";
const PERFORMANCE_GROUP = "수행심화서비스";

describe("injectGrowthAndArrangeServiceItems - 스쿨멘토 그룹", () => {
  it("목표성장서비스에 성장설계를 넣고 학습진단, 목표관리, 성장설계 순으로 맞춘다", () => {
    const result = injectGrowthAndArrangeServiceItems([
      group(GOAL_GROUP, [
        ["목표관리", "/services/goal"],
        ["학습진단", "/services/learning-diagnosis"],
      ]),
    ]);

    expect(result[0]?.items.map((i) => i.label)).toEqual([
      "학습진단",
      "목표관리",
      "성장설계",
    ]);
  });

  it("수행심화서비스는 성장설계 없이 수행평가, 심화탐구, 자기평가 순으로 맞춘다", () => {
    const result = injectGrowthAndArrangeServiceItems([
      group(PERFORMANCE_GROUP, [
        ["자기평가", "/services/self-assessment"],
        ["심화탐구", "/services/research"],
        ["수행평가", "/services/performance"],
      ]),
    ]);

    expect(result[0]?.items.map((i) => i.label)).toEqual([
      "수행평가",
      "심화탐구",
      "자기평가",
    ]);
  });
});

describe("ensureLearningDiagnosisInService - 스쿨멘토 그룹", () => {
  it("목표성장서비스 맨 앞에만 학습진단을 넣고 수행심화서비스에는 넣지 않는다", () => {
    const result = ensureLearningDiagnosisInService([
      group(GOAL_GROUP, [["목표관리", "/services/goal"]]),
      group(PERFORMANCE_GROUP, [["수행평가", "/services/performance"]]),
    ]);

    expect(result[0]?.items.map((i) => i.label)).toEqual([
      "학습진단",
      "목표관리",
    ]);
    expect(result[1]?.items.map((i) => i.label)).toEqual(["수행평가"]);
  });
});
