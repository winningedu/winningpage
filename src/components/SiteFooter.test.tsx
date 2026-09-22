import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteConfig } from "@/config/site";
import SiteFooter from "./SiteFooter";

type MockSite = Pick<SiteConfig, "brandName" | "logo" | "company">;

// 사이트별 브랜드(로고·회사정보) — 기본값은 위닝에듀 정본과 동일해 기존 테스트의
// alt/src/사업자 문구 단언이 그대로 통과한다. Header.test.tsx와 동일한 관례
// (vi.hoisted + vi.mock("@/config/site"))를 쓴다.
const siteState = vi.hoisted(() => ({
  current: {
    brandName: "위닝에듀",
    logo: {
      horizontal: "/images/winning-logo-horizontal.svg",
      stacked: "/images/winning-logo-stacked.svg",
    },
    company: {
      name: "주식회사 위닝에듀",
      ceo: "강원석",
      corpRegNo: "180111-0161411",
      patentNo: "10-2024-0048889",
      bizRegNo: "266-88-03449",
      mailOrderNo: "제2026-세종아름-0264호",
      address: "(본점) 세종특별자치시 마음안1로 61, 404호",
      supportChannelLabel: "카카오 채널 '위닝에듀'",
    },
  } as MockSite,
}));
vi.mock("@/config/site", () => ({
  get site() {
    return siteState.current;
  },
}));

const WINNING_SITE = structuredClone(siteState.current);
afterEach(() => {
  siteState.current = structuredClone(WINNING_SITE);
});

// 푸터 회귀 테스트(dev 레이아웃 기준). useNavGroups는 실제 구현을 쓰지 않고 5개 그룹
// 고정값으로 대체한다(Header.test.tsx의 관례를 따름) — 실 Supabase 조회가 테스트에
// 영향을 주지 않게 하기 위함이다.
vi.mock("@/hooks/useNavGroups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNavGroups")>();
  return {
    ...actual,
    useNavGroups: () => [
      {
        title: "서비스",
        to: "/services",
        items: [{ label: "학습진단", to: "/diagnosis", sortOrder: 0 }],
      },
      {
        title: "프리미엄",
        to: "/premium",
        items: [{ label: "프리미엄 안내", to: "/premium", sortOrder: 0 }],
      },
      {
        title: "입시정보",
        to: "/info",
        items: [{ label: "대학모집요강", to: "/info/admission", sortOrder: 0 }],
      },
      {
        title: "이용신청",
        to: "/apply",
        items: [{ label: "상담신청", to: "/apply/consult", sortOrder: 0 }],
      },
      {
        title: "고객안내",
        to: "/support",
        items: [{ label: "자주묻는질문", to: "/support/faq", sortOrder: 0 }],
      },
    ],
  };
});

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  );
}

describe("SiteFooter", () => {
  it("5개 컬럼 제목을 모두 렌더한다", () => {
    renderFooter();
    for (const title of [
      "서비스",
      "프리미엄",
      "입시정보",
      "이용신청",
      "고객안내",
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it("정본 로고(winning-logo-stacked.svg)를 alt와 함께 렌더한다", () => {
    renderFooter();
    const logos = screen.getAllByAltText("위닝에듀");
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      expect(logo).toHaveAttribute("src", "/images/winning-logo-stacked.svg");
    }
  });

  it("이용약관·개인정보처리방침 링크의 href가 올바르다", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "개인정보처리방침" }),
    ).toHaveAttribute("href", "/privacy");
  });

  it("사업자 정보 두 줄을 문자 단위로 정확히 렌더한다", () => {
    renderFooter();
    expect(
      screen.getByText(
        "상호명: 주식회사 위닝에듀 | 대표: 강원석 | 법인등록번호: 180111-0161411 | 특허출원: 10-2024-0048889 | 사업자 등록번호: 266-88-03449 | 통신판매업 신고번호: 제2026-세종아름-0264호",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "주소: (본점) 세종특별자치시 마음안1로 61, 404호 | 온라인고객센터 : 카카오 채널 '위닝에듀'",
      ),
    ).toBeInTheDocument();
  });
});

describe("SiteFooter — 스쿨멘토 사이트", () => {
  it("로고 alt·src가 스쿨멘토 정본이고, 선택 필드가 없으면 해당 문구가 보이지 않는다", () => {
    siteState.current = {
      brandName: "스쿨멘토",
      logo: {
        horizontal: "/images/schoolmentor-logo-horizontal.png",
        stacked: "/images/schoolmentor-logo-stacked.png",
      },
      company: {
        name: "주식회사 위닝로직",
        ceo: "강원석",
        corpRegNo: "164711-0016571",
        bizRegNo: "783-81-04298",
        address:
          "세종특별자치시 마음안1로 61, 404-B호 (고운동, 세종 리치먼드힐2 타운하우스)",
      },
    };

    renderFooter();

    const logos = screen.getAllByAltText("스쿨멘토");
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      expect(logo).toHaveAttribute(
        "src",
        "/images/schoolmentor-logo-stacked.png",
      );
    }

    expect(screen.getByText(/상호명: 주식회사 위닝로직/)).toBeInTheDocument();
    expect(screen.getByText(/783-81-04298/)).toBeInTheDocument();
    expect(screen.queryByText(/특허출원/)).not.toBeInTheDocument();
    expect(screen.queryByText(/통신판매업/)).not.toBeInTheDocument();
    expect(screen.queryByText(/온라인고객센터/)).not.toBeInTheDocument();
    expect(screen.queryByText(/카카오 채널/)).not.toBeInTheDocument();
  });
});
