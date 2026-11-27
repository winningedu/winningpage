import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITES, type SiteConfig, type SiteKey } from "@/config/sites";
import type { FooterOperatorImage } from "@/hooks/useFooterOperatorImage";
import { trackEvent } from "@/lib/analytics";
import SiteFooter from "./SiteFooter";

// 두 사이트가 같은 푸터를 쓴다. 사이트 값은 sites.ts 정본을 그대로 읽는다.
const siteState = vi.hoisted(() => ({ key: "schoolmentor" as SiteKey }));
vi.mock("@/config/site", async () => {
  const { SITES } = await import("@/config/sites");
  return {
    site: new Proxy({} as SiteConfig, {
      get: (_target, prop) => Reflect.get(SITES[siteState.key], prop),
    }),
  };
});

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const operatorImage = vi.hoisted(() => ({
  value: null as FooterOperatorImage | null,
}));
vi.mock("@/hooks/useFooterOperatorImage", () => ({
  useFooterOperatorImage: () => operatorImage.value,
}));

beforeEach(() => {
  siteState.key = "schoolmentor";
  operatorImage.value = null;
});

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  );
}

const SOCIAL_LABELS = ["네이버 블로그", "네이버 클립", "유튜브", "인스타그램"];

// 시안(운영위탁 줄 세 개)과 글자 그대로 같아야 한다.
const COMPANY_LINES = [
  "(운영위탁) 상호명: 주식회사 위닝로직 | 대표: 강원석 | 소프트웨어 사업자",
  "사업자 등록번호: 783-81-04298 | 특허등록: 10-3038224",
  "주소: 세종특별자치시 마음안1로 61, 404-B호",
];

function expectCommonFooterContent(footer: HTMLElement) {
  expect(within(footer).getByText("WINNING LOGIC")).toBeInTheDocument();
  expect(
    within(footer).getByRole("link", { name: "개인정보처리방침" }),
  ).toHaveAttribute("href", "/privacy");
  expect(
    within(footer).getByRole("link", { name: "이용약관" }),
  ).toHaveAttribute("href", "/terms");
  // 결정 26: 저작권보호정책 페이지가 생기기 전까지 링크를 그리지 않는다.
  expect(within(footer).queryByText("저작권보호정책")).not.toBeInTheDocument();
  for (const line of COMPANY_LINES) {
    const paragraph = within(footer).getByText(
      (_, element) => element?.tagName === "P" && element.textContent === line,
    );
    expect(paragraph).toBeInTheDocument();
  }
  expect(
    within(footer).getByText("Copyright © WINNING LOGIC. All rights reserved."),
  ).toBeInTheDocument();
  expect(within(footer).queryByText(/통신판매업/)).not.toBeInTheDocument();
  expect(within(footer).queryByText(/법인등록번호/)).not.toBeInTheDocument();
  // 호스팅 제공자와 사업자정보 확인은 통신판매업자(위닝)만 보인다.
  expect(within(footer).queryByText(/호스팅서비스/)).not.toBeInTheDocument();
  expect(
    within(footer).queryByRole("link", { name: "사업자정보 확인" }),
  ).not.toBeInTheDocument();
}

describe("SiteFooter - 스쿨멘토", () => {
  it("운영기관 이미지가 없으면 이미지와 구분선 없이 WINNING LOGIC 블록만 보여 준다", () => {
    renderFooter();

    const footer = screen.getByRole("contentinfo");
    expectCommonFooterContent(footer);
    expect(within(footer).queryByRole("img")).not.toBeInTheDocument();
    expect(within(footer).queryByRole("separator")).not.toBeInTheDocument();
  });

  it("운영기관 이미지가 있으면 왼쪽에 alt 와 함께 보이고 구분선이 따라오며 나머지 문구는 그대로다", () => {
    operatorImage.value = {
      imageUrl: "https://cdn.example/footer/hansol.png",
      title: "한솔고등학교",
    };
    renderFooter();

    const footer = screen.getByRole("contentinfo");
    const image = within(footer).getByRole("img", { name: "한솔고등학교" });
    expect(image).toHaveAttribute(
      "src",
      "https://cdn.example/footer/hansol.png",
    );
    expect(image).toHaveAttribute("loading", "lazy");
    const divider = within(footer).getByRole("separator");
    // 이미지, 구분선, 회사 블록 순서(DOM 순서가 모바일 세로 순서이기도 하다).
    expect(
      image.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      divider.compareDocumentPosition(
        within(footer).getByText("WINNING LOGIC"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expectCommonFooterContent(footer);
  });

  it("줄바꿈은 항목 사이에서만 일어나고 링크 묶음은 줄어들지 않는다", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");

    // "|" 로 이은 항목은 항목 안에서 줄이 바뀌지 않는다(예: 소프트웨어 사업자가 중간에서 끊기지 않는다).
    const nameLine = within(footer).getByText(
      (_, element) =>
        element?.tagName === "P" && element.textContent === COMPANY_LINES[0],
    );
    const registrationLine = within(footer).getByText(
      (_, element) =>
        element?.tagName === "P" && element.textContent === COMPANY_LINES[1],
    );
    expect(
      Array.from(nameLine.children).map((item) => item.textContent),
    ).toEqual([
      "(운영위탁) 상호명: 주식회사 위닝로직",
      "대표: 강원석",
      "소프트웨어 사업자",
    ]);
    expect(
      Array.from(registrationLine.children).map((item) => item.textContent),
    ).toEqual(["사업자 등록번호: 783-81-04298", "특허등록: 10-3038224"]);
    for (const item of [...nameLine.children, ...registrationLine.children]) {
      expect(item).toHaveClass("whitespace-nowrap");
    }
    // 항목이 없는 주소 줄은 단어 중간이 아니라 띄어쓰기에서만 끊긴다.
    const addressLine = within(footer).getByText(COMPANY_LINES[2] as string);
    expect(addressLine.closest(".break-keep")).not.toBeNull();

    for (const name of ["개인정보처리방침", "이용약관"]) {
      const link = within(footer).getByRole("link", { name });
      expect(link).toHaveClass("whitespace-nowrap");
      expect(link.parentElement).toHaveClass("shrink-0");
    }
  });
});

const WINNING_LINES = [
  "상호명: 주식회사 위닝에듀 | 대표: 강원석",
  "사업자 등록번호: 266-88-03449 | 특허등록: 10-3038224 | 통신판매업 신고번호: 제2026-세종아름-0264호",
  "주소: (본점) 세종특별자치시 마음안1로 61, 404호 | 온라인고객센터 : 카카오 채널 '위닝에듀'",
  "호스팅서비스 제공자: Vercel Inc. | 사업자정보 확인",
];

describe("SiteFooter - 위닝", () => {
  beforeEach(() => {
    siteState.key = "winning";
  });

  it("시안 줄과 호스팅 제공자 줄을 보이고 법인등록번호와 운영위탁은 없다", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");

    for (const line of WINNING_LINES) {
      expect(
        within(footer).getByText(
          (_, element) =>
            element?.tagName === "P" && element.textContent === line,
        ),
      ).toBeInTheDocument();
    }
    expect(
      within(footer).getByText("© All rights reserved."),
    ).toBeInTheDocument();
    expect(within(footer).queryByText(/법인등록번호/)).not.toBeInTheDocument();
    expect(within(footer).queryByText(/운영위탁/)).not.toBeInTheDocument();
    expect(within(footer).queryByText("WINNING LOGIC")).not.toBeInTheDocument();
  });

  it("브랜드 자리에 흰색 위닝에듀 로고를 보인다", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");

    expect(
      within(footer).getByRole("img", { name: "위닝에듀" }),
    ).toHaveAttribute("src", "/images/winning-logo-horizontal-white.svg");
  });

  it("사업자정보 확인은 공정위 사업자정보 페이지를 새 창으로 연다", () => {
    renderFooter();
    const link = screen.getByRole("link", { name: "사업자정보 확인" });

    expect(link).toHaveAttribute(
      "href",
      "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=2668803449",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("옛 푸터의 메뉴 컬럼은 없다", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");

    expect(within(footer).queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("SiteFooter - 위닝 SNS 아이콘", () => {
  beforeEach(() => {
    siteState.key = "winning";
  });

  it("네이버 블로그, 네이버 클립, 유튜브, 인스타그램 순서로 새 탭 링크를 보이고 카카오 링크는 없다", () => {
    renderFooter();
    const footer = screen.getByRole("contentinfo");
    const links = within(footer)
      .getAllByRole("link")
      .filter((link) =>
        SOCIAL_LABELS.includes(link.getAttribute("aria-label") ?? ""),
      );

    // 모바일(로고 아래)과 데스크톱(오른쪽) 자리에 한 벌씩, 화면 크기에 따라 하나만 보인다.
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      ...SOCIAL_LABELS,
      ...SOCIAL_LABELS,
    ]);
    expect(links.slice(0, 4).map((link) => link.getAttribute("href"))).toEqual([
      "https://blog.naver.com/winningedu",
      "https://clip.naver.com/@winningedu",
      "https://www.youtube.com/@winningedu-100",
      "https://www.instagram.com/winningedu.official/",
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
    expect(
      footer.querySelector('[aria-label="카카오톡 채널"]'),
    ).not.toBeInTheDocument();
    expect(
      within(footer)
        .getAllByRole("link")
        .some((link) => link.getAttribute("href")?.includes("pf.kakao.com")),
    ).toBe(false);
  });
});

describe("SiteFooter - 스쿨멘토 SNS 아이콘", () => {
  it("카카오 채널 주소가 있어도 SNS 아이콘을 그리지 않고 링크 묶음은 그대로다", () => {
    siteState.key = "schoolmentor";
    renderFooter();
    const footer = screen.getByRole("contentinfo");

    for (const label of SOCIAL_LABELS) {
      expect(
        footer.querySelector(`[aria-label="${label}"]`),
      ).not.toBeInTheDocument();
    }
    expect(within(footer).getAllByRole("link")).toHaveLength(2);
  });
});

describe("SiteFooter - 위닝 SNS 주소가 없는 아이콘", () => {
  const naverClipUrl = SITES.winning.company.naverClipUrl as string;

  beforeEach(() => {
    siteState.key = "winning";
  });
  afterEach(() => {
    SITES.winning.company.naverClipUrl = naverClipUrl;
  });

  it("주소가 없는 링크는 그리지 않고 나머지 순서는 그대로다", () => {
    Reflect.deleteProperty(SITES.winning.company, "naverClipUrl");
    renderFooter();
    const footer = screen.getByRole("contentinfo");

    expect(
      footer.querySelector('[aria-label="네이버 클립"]'),
    ).not.toBeInTheDocument();
    expect(
      within(footer)
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-label"))
        .filter((label) => SOCIAL_LABELS.includes(label ?? "")),
    ).toEqual([
      "네이버 블로그",
      "유튜브",
      "인스타그램",
      "네이버 블로그",
      "유튜브",
      "인스타그램",
    ]);
  });
});

describe("SiteFooter - 위닝 소셜 클릭 이벤트", () => {
  beforeEach(() => {
    siteState.key = "winning";
    vi.mocked(trackEvent).mockClear();
  });

  it("푸터 소셜 링크를 눌러도 kakao_inquiry_click을 보내지 않는다", () => {
    renderFooter();

    for (const link of screen.getAllByRole("link", { name: "유튜브" })) {
      fireEvent.click(link);
    }

    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe.each(["winning", "schoolmentor"] as const)(
  "SiteFooter 약관 링크(%s)",
  (key) => {
    beforeEach(() => {
      siteState.key = key;
    });

    it("개인정보처리방침이 이용약관 앞에 오고 굵기와 색으로 구별된다", () => {
      renderFooter();
      const privacy = screen.getByRole("link", { name: "개인정보처리방침" });
      const terms = screen.getByRole("link", { name: "이용약관" });

      expect(
        privacy.compareDocumentPosition(terms) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(privacy).toHaveClass("font-bold", "text-footer-b2b-privacy");
      expect(terms).not.toHaveClass("font-bold");
      expect(terms).not.toHaveClass("text-footer-b2b-privacy");
    });
  },
);
