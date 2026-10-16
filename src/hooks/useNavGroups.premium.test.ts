// removePremiumWhenHidden 회귀 테스트 - 스쿨멘토(site.features.premium=false)는
// 프리미엄 그룹과 이용신청의 '프리미엄 이용'(/premium-apply)을 메뉴에서 노출하지 않는다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({ premium: true }));
vi.mock("@/config/site", () => ({
  site: {
    company: {},
    features: {
      get premium() {
        return siteState.premium;
      },
    },
  },
}));

const { removePremiumWhenHidden } = await import("./useNavGroups");

function buildGroups() {
  return [
    {
      title: "서비스",
      to: "/services/goal",
      items: [{ label: "목표관리", to: "/services/goal", sortOrder: 1 }],
    },
    {
      title: "프리미엄",
      to: "/page/premium/admission-consulting/a",
      items: [
        {
          label: "대입컨설팅",
          to: "/page/premium/admission-consulting/a",
          sortOrder: 1,
        },
      ],
    },
    {
      title: "이용신청",
      to: "/pricing",
      items: [
        { label: "서비스요금", to: "/pricing", sortOrder: 1 },
        { label: "프리미엄 이용", to: "/premium-apply", sortOrder: 2 },
        { label: "프리미엄 이용", to: "/page/premium-apply", sortOrder: 3 },
        { label: "멘토신청", to: "/mentor-apply", sortOrder: 4 },
      ],
    },
  ];
}

describe("removePremiumWhenHidden - 프리미엄 노출(winning)", () => {
  it("메뉴 트리를 그대로 둔다", () => {
    siteState.premium = true;
    const groups = buildGroups();

    expect(removePremiumWhenHidden(groups)).toEqual(groups);
  });
});

describe("removePremiumWhenHidden - 프리미엄 숨김(schoolmentor)", () => {
  it("프리미엄 그룹을 제거한다", () => {
    siteState.premium = false;

    const result = removePremiumWhenHidden(buildGroups());

    expect(result.map((group) => group.title)).toEqual(["서비스", "이용신청"]);
  });

  it("이용신청의 프리미엄 이용 항목(신구 경로)을 제거하고 나머지는 유지한다", () => {
    siteState.premium = false;

    const result = removePremiumWhenHidden(buildGroups());
    const apply = result.find((group) => group.title === "이용신청");

    expect(apply?.items.map((item) => item.label)).toEqual([
      "서비스요금",
      "멘토신청",
    ]);
  });
});
