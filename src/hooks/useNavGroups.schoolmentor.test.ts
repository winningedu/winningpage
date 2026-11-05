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

describe("getFallbackNavGroups", () => {
  it("스쿨멘토는 확정 메뉴 이름의 fallback 트리를 쓰고 위닝 항목을 담지 않는다", async () => {
    vi.resetModules();
    vi.doMock("@/config/site", () => ({
      site: {
        company: { kakaoChannelUrl: "https://pf.kakao.com/x" },
        features: { premium: false, hiddenPrograms: [], b2bMenu: true },
      },
    }));
    const { getFallbackNavGroups } = await import("./useNavGroups");

    const groups = getFallbackNavGroups();
    const labels = (title: string) =>
      groups.find((g) => g.title === title)?.items.map((i) => i.label);

    expect(groups.map((g) => g.title)).toEqual([
      "목표성장서비스",
      "수행심화서비스",
      "입시정보",
      "고객안내",
    ]);
    expect(labels("목표성장서비스")).toEqual([
      "학습진단",
      "목표관리",
      "성장설계",
    ]);
    expect(labels("수행심화서비스")).toEqual([
      "수행평가",
      "심화탐구",
      "자기평가",
    ]);
    expect(labels("입시정보")).toEqual([
      "대입모집요강",
      "입결정보",
      "칼럼-교육청소식",
    ]);
    expect(labels("고객안내")).toEqual([
      "공지-회사소개",
      "교육-정보안내",
      "자주하는 질문",
      "온라인문의",
    ]);
    const links = groups.flatMap((g) => g.items.map((i) => i.to));
    expect(links).not.toContain("/services/callmentor");
    expect(links).not.toContain("/pricing");
  });

  it("위닝은 기존 FALLBACK_NAV_GROUPS를 그대로 쓴다", async () => {
    vi.resetModules();
    vi.doMock("@/config/site", () => ({
      site: {
        company: { kakaoChannelUrl: "https://pf.kakao.com/x" },
        features: { premium: true, hiddenPrograms: [] },
      },
    }));
    const { getFallbackNavGroups } = await import("./useNavGroups");
    const { FALLBACK_NAV_GROUPS } = await import("@/data/navigation");

    expect(getFallbackNavGroups()).toBe(FALLBACK_NAV_GROUPS);
  });
});

describe("removeCallmentorWhenHidden", () => {
  const groups = [
    group("서비스", [
      ["수행평가", "/services/performance"],
      ["콜멘토", "/services/callmentor"],
    ]),
  ];

  async function load(callmentor: boolean) {
    vi.resetModules();
    vi.doMock("@/config/site", () => ({
      site: {
        company: { kakaoChannelUrl: "https://pf.kakao.com/x" },
        features: { premium: true, hiddenPrograms: [], callmentor },
      },
    }));
    return import("./useNavGroups");
  }

  it("콜멘토를 닫는 사이트는 최종 메뉴에서 콜멘토 항목을 뺀다", async () => {
    const { composeFinalNavGroups } = await load(false);

    const labels = composeFinalNavGroups(groups).flatMap((g) =>
      g.items.map((i) => i.label),
    );

    expect(labels).not.toContain("콜멘토");
    expect(labels).toContain("수행평가");
  });

  it("콜멘토를 여는 사이트는 그대로 둔다", async () => {
    const { composeFinalNavGroups } = await load(true);

    const labels = composeFinalNavGroups(groups).flatMap((g) =>
      g.items.map((i) => i.label),
    );

    expect(labels).toContain("콜멘토");
  });
});
