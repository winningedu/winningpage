import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ hidden: [] as string[] }));
vi.mock("@/config/site", () => ({
  site: {
    company: { kakaoChannelUrl: "https://pf.kakao.com/x" },
    features: {
      premium: true,
      get hiddenPrograms() {
        return siteState.hidden;
      },
    },
  },
}));

const { injectGrowthAndArrangeServiceItems, composeFinalNavGroups } =
  await import("./useNavGroups");

const CANONICAL = [
  "학습진단",
  "목표관리",
  "성장설계",
  "수행평가",
  "심화탐구",
  "자기평가",
  "콜멘토",
];

const PATH_BY_LABEL: Record<string, string> = {
  학습진단: "/services/learning-diagnosis",
  목표관리: "/services/goal",
  성장설계: "/services/growth",
  수행평가: "/services/performance",
  심화탐구: "/services/research",
  자기평가: "/services/self-assessment",
  콜멘토: "/services/callmentor",
};

function item(label: string, to = PATH_BY_LABEL[label] ?? `/x/${label}`) {
  return { label, to, sortOrder: 1 };
}

function serviceGroup(labels: string[]) {
  return {
    title: "서비스",
    to: "/services",
    items: labels.map((l) => item(l)),
  };
}

function labelsOf(
  groups: ReturnType<typeof injectGrowthAndArrangeServiceItems>,
) {
  return groups.find((g) => g.title === "서비스")?.items.map((i) => i.label);
}

describe("injectGrowthAndArrangeServiceItems", () => {
  it("DB 순서가 섞여 와도 정본 순서로 돌려주고 성장설계를 넣는다", () => {
    const shuffled = [
      "콜멘토",
      "자기평가",
      "심화탐구",
      "수행평가",
      "목표관리",
      "학습진단",
    ];

    expect(
      labelsOf(injectGrowthAndArrangeServiceItems([serviceGroup(shuffled)])),
    ).toEqual(CANONICAL);
  });

  it("이미 성장설계가 있어도 중복 없이 정본 순서를 유지한다", () => {
    const once = injectGrowthAndArrangeServiceItems([
      serviceGroup(["자기평가", "성장설계", "목표관리"]),
    ]);
    const twice = injectGrowthAndArrangeServiceItems(once);

    expect(labelsOf(twice)).toEqual(["목표관리", "성장설계", "자기평가"]);
  });

  it("정본 배열에 없는 경로의 항목은 기존 순서대로 뒤에 둔다", () => {
    const result = injectGrowthAndArrangeServiceItems([
      serviceGroup(["기타B", "자기평가", "기타A", "목표관리"]),
    ]);

    expect(labelsOf(result)).toEqual([
      "목표관리",
      "성장설계",
      "자기평가",
      "기타B",
      "기타A",
    ]);
  });

  it("DB 라벨이 바뀌어도 링크 경로로 정본 순서를 맞춘다", () => {
    const renamed = {
      title: "서비스",
      to: "/services",
      items: [
        item("자기평가 서비스", "/services/self-assessment"),
        item("골 매니지먼트", "/services/goal"),
        item("콜 멘토", "/services/callmentor"),
      ],
    };

    expect(labelsOf(injectGrowthAndArrangeServiceItems([renamed]))).toEqual([
      "골 매니지먼트",
      "성장설계",
      "자기평가 서비스",
      "콜 멘토",
    ]);
  });

  it("서비스 외 그룹은 건드리지 않는다", () => {
    const other = {
      title: "이용신청",
      to: "/pricing",
      items: [item("서비스요금"), item("멘토신청")],
    };

    expect(
      injectGrowthAndArrangeServiceItems([serviceGroup(["콜멘토"]), other])[1],
    ).toEqual(other);
  });
});

describe("composeFinalNavGroups", () => {
  it("성장설계를 숨기면 주입된 성장설계도 최종 결과에서 빠진다", () => {
    siteState.hidden = ["growth"];

    const result = composeFinalNavGroups([
      serviceGroup(["목표관리", "콜멘토"]),
    ]);

    expect(labelsOf(result)).toEqual(["목표관리", "콜멘토"]);
    siteState.hidden = [];
  });

  it("숨김 목록이 비면 성장설계가 정본 위치에 들어간다", () => {
    siteState.hidden = [];

    const result = composeFinalNavGroups([
      serviceGroup(["콜멘토", "목표관리"]),
    ]);

    expect(labelsOf(result)).toContain("성장설계");
  });
});
