import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { company: {}, features: { premium: true } },
}));

const { arrangeServiceItems } = await import("./useNavGroups");

const CANONICAL = [
  "학습진단",
  "목표관리",
  "성장설계",
  "수행평가",
  "심화탐구",
  "자기평가",
  "콜멘토",
];

function item(
  label: string,
  to = label === "성장설계" ? "/services/growth" : `/x/${label}`,
) {
  return { label, to, sortOrder: 1 };
}

function serviceGroup(labels: string[]) {
  return {
    title: "서비스",
    to: "/services",
    items: labels.map((l) => item(l)),
  };
}

function labelsOf(groups: ReturnType<typeof arrangeServiceItems>) {
  return groups.find((g) => g.title === "서비스")?.items.map((i) => i.label);
}

describe("arrangeServiceItems", () => {
  it("DB 순서가 섞여 와도 정본 순서로 돌려주고 성장설계를 넣는다", () => {
    const shuffled = [
      "콜멘토",
      "자기평가",
      "심화탐구",
      "수행평가",
      "목표관리",
      "학습진단",
    ];

    expect(labelsOf(arrangeServiceItems([serviceGroup(shuffled)]))).toEqual(
      CANONICAL,
    );
  });

  it("이미 성장설계가 있어도 중복 없이 정본 순서를 유지한다", () => {
    const once = arrangeServiceItems([
      serviceGroup(["자기평가", "성장설계", "목표관리"]),
    ]);
    const twice = arrangeServiceItems(once);

    expect(labelsOf(twice)).toEqual(["목표관리", "성장설계", "자기평가"]);
  });

  it("라벨 공백은 무시하고 정본 배열에 없는 항목은 기존 순서대로 뒤에 둔다", () => {
    const result = arrangeServiceItems([
      serviceGroup(["기타B", "자기 평가", "기타A", "목표관리"]),
    ]);

    expect(labelsOf(result)).toEqual([
      "목표관리",
      "성장설계",
      "자기 평가",
      "기타B",
      "기타A",
    ]);
  });

  it("서비스 외 그룹은 건드리지 않는다", () => {
    const other = {
      title: "이용신청",
      to: "/pricing",
      items: [item("서비스요금"), item("멘토신청")],
    };

    expect(arrangeServiceItems([serviceGroup(["콜멘토"]), other])[1]).toEqual(
      other,
    );
  });
});
