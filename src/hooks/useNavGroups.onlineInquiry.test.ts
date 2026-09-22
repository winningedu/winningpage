// removeOnlineInquiryWithoutKakao 회귀 테스트 — "온라인문의"(→ /online-inquiry)는
// 카카오톡 채널 상담 랜딩으로 연결되는 코드 정의 메뉴 항목(navigation.ts)이다.
// 스쿨멘토처럼 site.company.kakaoChannelUrl이 없는 사이트에서는 안내 문구만 남는
// 죽은 페이지로 이어지므로, 최종 메뉴 트리에서 이 항목 자체를 제거한다.
import { describe, expect, it, vi } from "vitest";

const siteState = vi.hoisted(() => ({
  kakaoChannelUrl: "https://pf.kakao.com/_test" as string | undefined,
}));
vi.mock("@/config/site", () => ({
  site: {
    company: {
      get kakaoChannelUrl() {
        return siteState.kakaoChannelUrl;
      },
    },
  },
}));

const { removeOnlineInquiryWithoutKakao } = await import("./useNavGroups");

describe("removeOnlineInquiryWithoutKakao — kakaoChannelUrl 있음(winning)", () => {
  it("메뉴 트리를 그대로 둔다", () => {
    siteState.kakaoChannelUrl = "https://pf.kakao.com/_test";
    const groups = [
      {
        title: "고객안내",
        to: "/company-news",
        items: [
          { label: "공지사항", to: "/events", sortOrder: 1 },
          { label: "온라인문의", to: "/online-inquiry", sortOrder: 4 },
        ],
      },
    ];

    expect(removeOnlineInquiryWithoutKakao(groups)).toEqual(groups);
  });
});

describe("removeOnlineInquiryWithoutKakao — kakaoChannelUrl 없음(schoolmentor)", () => {
  it("/online-inquiry 항목을 제거하고 나머지는 유지한다", () => {
    siteState.kakaoChannelUrl = undefined;
    const groups = [
      {
        title: "고객안내",
        to: "/company-news",
        items: [
          { label: "공지사항", to: "/events", sortOrder: 1 },
          { label: "온라인문의", to: "/online-inquiry", sortOrder: 4 },
        ],
      },
    ];

    const result = removeOnlineInquiryWithoutKakao(groups);

    expect(result[0]?.items.map((item) => item.label)).toEqual(["공지사항"]);
  });
});
