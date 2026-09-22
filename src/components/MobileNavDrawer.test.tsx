import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import MobileNavDrawer from "./MobileNavDrawer";
import type { MyMenuRole } from "./myMenuItems";

// 가입 오픈 여부 게이트(WC074) — 이 파일의 기존 테스트는 전부 signup_enabled=true
// 전제(회원가입 CTA가 항상 보임)라 실제 supabase 조회 대신 true로 고정한다.
vi.mock("@/hooks/useSignupEnabled", () => ({
  useSignupEnabled: () => true,
}));

const navGroups = [
  {
    title: "서비스",
    to: "/services",
    items: [
      { label: "학습진단", to: "/services/learning-diagnosis", sortOrder: 1 },
    ],
  },
  {
    title: "프리미엄",
    to: "/premium",
    items: [{ label: "프리미엄 소개", to: "/premium/intro", sortOrder: 1 }],
  },
];

function renderDrawer(
  overrides: Partial<React.ComponentProps<typeof MobileNavDrawer>> = {},
) {
  const triggerRef = createRef<HTMLButtonElement>();
  return render(
    <MemoryRouter>
      <MobileNavDrawer
        open
        onClose={vi.fn()}
        navGroups={navGroups}
        shouldShowLoggedInHeader
        isLoggedIn
        displayName="홍길동"
        memberLabel="학생회원"
        myMenuRole="student"
        csatDDay="D-100"
        onLogout={vi.fn()}
        triggerRef={triggerRef}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

// MY 메뉴 라벨·href는 myMenuItems.buildMyMenu 계약을 그대로 따른다(역할별 단일 소스).
const EXPECTED_BY_ROLE: Record<MyMenuRole, { label: string; href: string }[]> =
  {
    student: [
      { label: "MY페이지", href: "/mypage" },
      { label: "나의 서비스", href: "/mypage?tab=services" },
      { label: "신청 내역", href: "/mypage?tab=payments" },
      { label: "내 정보 수정", href: "/mypage?tab=profile" },
    ],
    parent: [
      { label: "MY페이지", href: "/mypage" },
      { label: "자녀 등록 및 수정", href: "/mypage?tab=children" },
      { label: "신청 내역", href: "/mypage?tab=payments" },
      { label: "내 정보 수정", href: "/mypage?tab=profile" },
    ],
    admin: [
      { label: "MY페이지", href: "/mypage" },
      { label: "관리자 메뉴", href: "/admin" },
      { label: "내 정보 수정", href: "/mypage?tab=profile" },
    ],
  };

describe.each(["student", "parent", "admin"] as const)(
  "MobileNavDrawer — MY 섹션(role=%s)",
  (role) => {
    it("역할에 해당하는 MY 메뉴 항목만 라벨·href 그대로 노출한다", () => {
      renderDrawer({ myMenuRole: role });

      for (const { label, href } of EXPECTED_BY_ROLE[role]) {
        expect(screen.getByRole("link", { name: label })).toHaveAttribute(
          "href",
          href,
        );
      }

      // 목록 교체로 자연 소멸한 항목 — 별도 링크로 남아 있으면 안 된다.
      expect(
        screen.queryByRole("link", { name: "환불신청" }),
      ).not.toBeInTheDocument();

      // 단독 "관리자" 항목(구 버전, Settings 아이콘)은 role과 무관하게 없어야 한다.
      // "관리자 메뉴"(admin role의 buildMyMenu 항목)와는 별개다.
      expect(
        screen.queryByRole("link", { name: "관리자" }),
      ).not.toBeInTheDocument();
    });

    it("로그아웃 버튼은 유지된다", () => {
      renderDrawer({ myMenuRole: role });
      expect(
        screen.getByRole("button", { name: "로그아웃" }),
      ).toBeInTheDocument();
    });
  },
);

describe("MobileNavDrawer — 스크롤 컨테이너와 하단 블록 고정", () => {
  it("그룹 아코디언은 ScrollArea(OverlayScrollbars) 안에 있다", () => {
    renderDrawer();

    const scrollArea = document.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).not.toBeNull();
    expect(
      scrollArea?.contains(screen.getByRole("button", { name: "서비스" })),
    ).toBe(true);
  });

  it("MY 섹션은 ScrollArea 밖, 드로어 하단 고정 블록에 있다", () => {
    renderDrawer();

    const scrollArea = document.querySelector('[data-slot="scroll-area"]');
    const myPageLink = screen.getByRole("link", { name: "MY페이지" });
    expect(scrollArea?.contains(myPageLink)).toBe(false);

    // 드로어 루트는 flex-col이고, 하단 블록(MY 섹션+로그아웃)이 ScrollArea 다음
    // 마지막 자식이라 콘텐츠가 짧아도 바닥에 붙는다.
    const popup = document.getElementById("mobile-nav-drawer");
    expect(popup).toHaveClass("flex", "flex-col");
    expect(popup?.lastElementChild?.contains(myPageLink)).toBe(true);
  });
});

describe("MobileNavDrawer — Sheet 오버레이 농도", () => {
  it("shadcn Sheet 기본값(bg-black/10)이 아니라 원래 농도(bg-black/40)를 쓴다", () => {
    renderDrawer();

    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveClass("bg-black/40");
    expect(overlay).not.toHaveClass("bg-black/10");
  });
});

describe("MobileNavDrawer — 그룹 헤더 아코디언(단일 열림)", () => {
  it("그룹 헤더는 이동 링크가 아니라 토글 버튼이다", () => {
    renderDrawer();

    expect(screen.getByRole("button", { name: "서비스" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "서비스" }),
    ).not.toBeInTheDocument();
  });

  it("헤더 클릭 시 이동하지 않고 해당 그룹만 열린다", () => {
    renderDrawer();

    const serviceHeader = screen.getByRole("button", { name: "서비스" });
    expect(serviceHeader).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(serviceHeader);

    expect(serviceHeader).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "학습진단" })).toBeInTheDocument();
  });

  it("다른 그룹을 열면 이전에 열려 있던 그룹은 닫힌다", () => {
    renderDrawer();

    const serviceHeader = screen.getByRole("button", { name: "서비스" });
    const premiumHeader = screen.getByRole("button", { name: "프리미엄" });

    fireEvent.click(serviceHeader);
    expect(serviceHeader).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(premiumHeader);
    expect(premiumHeader).toHaveAttribute("aria-expanded", "true");
    expect(serviceHeader).toHaveAttribute("aria-expanded", "false");
  });

  it("같은 그룹 헤더를 다시 클릭하면 닫힌다", () => {
    renderDrawer();

    const serviceHeader = screen.getByRole("button", { name: "서비스" });
    fireEvent.click(serviceHeader);
    expect(serviceHeader).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(serviceHeader);
    expect(serviceHeader).toHaveAttribute("aria-expanded", "false");
  });

  it("하위 항목 클릭 시 onClose가 호출된다", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "서비스" }));
    fireEvent.click(screen.getByRole("link", { name: "학습진단" }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe("MobileNavDrawer — 게스트(비로그인)", () => {
  it("로그인/회원가입 링크를 보여주고 MY 섹션은 노출하지 않는다", () => {
    renderDrawer({
      shouldShowLoggedInHeader: false,
      isLoggedIn: false,
      myMenuRole: "student",
    });

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute(
      "href",
      "/signup",
    );

    for (const role of ["student", "parent", "admin"] as const) {
      for (const { label } of EXPECTED_BY_ROLE[role]) {
        expect(
          screen.queryByRole("link", { name: label }),
        ).not.toBeInTheDocument();
      }
    }
  });
});
