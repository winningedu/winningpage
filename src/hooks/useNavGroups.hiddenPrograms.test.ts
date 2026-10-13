// removeHiddenProgramsFromNav 회귀 테스트 - site.features.hiddenPrograms에 든 신규 서비스는
// 메뉴 트리에서 빠지고, 빈 배열이면 트리가 그대로다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ hidden: [] as string[] }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      premium: true,
      get hiddenPrograms() {
        return siteState.hidden;
      },
    },
  },
}));

const { removeHiddenProgramsFromNav } = await import("./useNavGroups");

function buildGroups() {
  return [
    {
      title: "서비스",
      to: "/services/goal",
      items: [
        { label: "목표관리", to: "/services/goal", sortOrder: 1 },
        { label: "성장설계", to: "/services/growth", sortOrder: 2 },
        { label: "자기평가", to: "/services/self-assessment", sortOrder: 3 },
        { label: "심화탐구", to: "/services/research", sortOrder: 4 },
      ],
    },
  ];
}

describe("removeHiddenProgramsFromNav", () => {
  it("숨김 목록이 비어 있으면 그대로 돌려준다", () => {
    siteState.hidden = [];
    const groups = buildGroups();

    expect(removeHiddenProgramsFromNav(groups)).toEqual(groups);
  });

  it("growth를 숨기면 성장설계 항목만 빠진다", () => {
    siteState.hidden = ["growth"];

    const labels = removeHiddenProgramsFromNav(buildGroups())[0]!.items.map(
      (item) => item.label,
    );

    expect(labels).toEqual(["목표관리", "자기평가", "심화탐구"]);
  });
});
