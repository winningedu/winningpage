import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header";

// jsdom에는 ResizeObserver가 없다 — 로그인 메가 패널 회색존 좌측 정렬(2026-09-03)이
// useLayoutEffect에서 계정 그룹 ref에 ResizeObserver를 붙이므로, 이 스텁이 없으면 로그인
// 상태를 렌더하는 테스트가 "ResizeObserver is not defined"로 즉시 실패한다. observe/
// disconnect만 no-op으로 두면 충분하다 — 실측 좌표(getBoundingClientRect)는 jsdom에서
// 항상 0이라 어차피 픽셀 단위 검증은 여기서 하지 않는다(계산 근거는 커밋 보고 참고).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// QA 행241·242·327 회귀 테스트. useNavGroups는 실제 구현(cleanText·isSameObject 등)을
// 그대로 쓰고 그룹 목록만 고정값으로 바꾼다 — 실 Supabase 조회가 테스트에 영향을 주지
// 않게 하기 위함이다(Onboarding.test.tsx의 useAuth 스텁 관례를 따른다).
vi.mock("@/hooks/useNavGroups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNavGroups")>();
  return {
    ...actual,
    useNavGroups: () => [
      { title: "서비스", to: "/services", items: [] },
      { title: "프리미엄", to: "/premium", items: [] },
      { title: "입시정보", to: "/info", items: [] },
      { title: "이용신청", to: "/apply", items: [] },
      { title: "고객안내", to: "/support", items: [] },
    ],
  };
});

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

// 가입 오픈 여부 게이트(WC074) — 이 파일의 기존 테스트는 전부 signup_enabled=true
// 전제(회원가입 CTA가 항상 보임)라 실제 조회 대신 true로 고정한다. 게이트 자체의
// 숨김 동작은 useSignupEnabled 자체 테스트/별도 케이스가 다룰 영역이다.
vi.mock("@/hooks/useSignupEnabled", () => ({
  useSignupEnabled: () => true,
}));

// Header가 세션 확정 후 profiles 테이블을 조회한다(queryProfileById 등) — 실제 네트워크
// 대신 이 mock으로 프로필 행을 즉시/항상 돌려준다. queryProfileById가 byId?.name으로
// 곧장 성공하므로 select/eq 체인 어떤 필드로 불려도 이 한 응답으로 충분하다.
let mockProfileRow: Record<string, unknown> | null = null;
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockProfileRow, error: null }),
        }),
      }),
    }),
    // src/lib/queryClient.ts가 모듈 로드 시점에 구독한다(전역 SIGNED_OUT 캐시 클리어) —
    // Header import 체인에 딸려오므로 구독 해제 함수까지 최소 형태로 스텁한다.
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header — 햄버거 표시 조건(2026-09-03, QA 행242 폐기)", () => {
  it("모든 화면 크기에서 보이도록 desktop:hidden 클래스를 갖지 않는다", () => {
    mockUseAuth.mockReturnValue({
      session: null,
      user: null,
      isReady: true,
    });
    renderHeader();

    const hamburger = screen.getByRole("button", { name: "전체 메뉴 열기" });
    expect(hamburger.className).not.toContain("desktop:hidden");
  });
});

describe("Header — 로그인 상태 계정 그룹(QA 행241)", () => {
  it("프로필 로딩 완료 시 이름 칩이 /mypage 링크가 되고, 별도 마이페이지 버튼은 없다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();

    const nameChip = await screen.findByRole("link", { name: "마이페이지" });
    expect(nameChip).toHaveAttribute("href", "/mypage");
    expect(nameChip.textContent).toContain("홍길동");

    // "마이페이지"라는 별도 텍스트를 가진 버튼/링크가 더 없어야 한다(이름 칩 자체가
    // aria-label="마이페이지"인 유일한 마이페이지 진입점).
    expect(screen.getAllByRole("link", { name: "마이페이지" })).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "마이페이지" }),
    ).not.toBeInTheDocument();

    // 로그아웃도 shadcn Button(data-slot=button)으로 렌더된다(2026-09-03).
    expect(screen.getByRole("button", { name: "로그아웃" })).toHaveAttribute(
      "data-slot",
      "button",
    );
  });

  it("로그인은 됐지만 프로필이 없으면 마이페이지 버튼 없이 로그아웃만 보인다", async () => {
    mockProfileRow = null;
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u2", email: "loading@test.com" } },
      user: { id: "u2", email: "loading@test.com" },
      isReady: true,
    });

    renderHeader();

    await screen.findByRole("button", { name: "로그아웃" });
    expect(
      screen.queryByRole("link", { name: "마이페이지" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "마이페이지" }),
    ).not.toBeInTheDocument();
  });
});

describe("Header — 비로그인 상태", () => {
  it("로그인/회원가입 링크를 보여준다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("게스트 메가 패널은 프로모 카드(로그인하기 CTA)를 보여주고 MY 항목은 없다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    // nav mock 그룹은 items: []라 hasDropdown이 false다(§8 오픈 트리거는 nav 항목
    // 자체가 아니라 로고로도 검증 가능 — 로고는 hasDropdown과 무관하게 항상 연다).
    const logo = screen.getByRole("link", { name: "위닝에듀" });
    fireEvent.mouseOver(logo);

    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("MY페이지")).not.toBeInTheDocument();
  });

  it("헤더 로고는 가로형 정본 svg를 쓴다(2026-09-03 — 스택형 폐기)", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    const logo = screen.getByRole("link", { name: "위닝에듀" });
    const img = logo.querySelector("img");

    expect(img).toHaveAttribute("src", "/images/winning-logo-horizontal.svg");
  });

  it("로그인·회원가입·햄버거는 shadcn Button(data-slot=button)으로 렌더된다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "data-slot",
      "button",
    );
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute(
      "data-slot",
      "button",
    );
    expect(
      screen.getByRole("button", { name: "전체 메뉴 열기" }),
    ).toHaveAttribute("data-slot", "button");
  });
});

describe("Header — 관리자 단독 버튼 부재(2026-09-03 시안 §6-1)", () => {
  it("관리자 로그인 시에도 별도 '관리자' 버튼/링크가 없다", async () => {
    mockProfileRow = {
      id: "u3",
      email: "admin@test.com",
      name: "관리자짱",
      member_type: "admin",
      role: "admin",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u3", email: "admin@test.com" } },
      user: { id: "u3", email: "admin@test.com" },
      isReady: true,
    });

    renderHeader();

    await screen.findByRole("link", { name: "마이페이지" });

    expect(
      screen.queryByRole("link", { name: "관리자" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "관리자" }),
    ).not.toBeInTheDocument();
  });
});

describe("Header — 메가 패널 chevron 회전(§6-2·§8)", () => {
  it("이름 칩 hover로 패널이 열리면 chevron이 90도 회전 클래스를 갖는다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();

    const nameChip = await screen.findByRole("link", { name: "마이페이지" });
    const chevron = screen.getByTestId("header-mega-chevron");

    expect(chevron.className).not.toContain("rotate-90");

    fireEvent.mouseOver(nameChip.parentElement?.parentElement as Element);

    expect(chevron.className).toContain("rotate-90");
  });
});

describe("Header — MY 컬럼 역할별 항목(§6-3, buildMyMenu 단일 소스)", () => {
  async function openMyColumn() {
    const nameChip = await screen.findByRole("link", { name: "마이페이지" });
    fireEvent.mouseOver(nameChip.parentElement?.parentElement as Element);
  }

  it("학생은 MY페이지·나의 서비스·신청 내역·내 정보 수정 4개를 본다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();
    await openMyColumn();

    expect(screen.getByText("MY페이지")).toBeInTheDocument();
    expect(screen.getByText("나의 서비스")).toBeInTheDocument();
    expect(screen.getByText("신청 내역")).toBeInTheDocument();
    expect(screen.getByText("내 정보 수정")).toBeInTheDocument();
    expect(screen.queryByText("자녀 등록 및 수정")).not.toBeInTheDocument();
  });

  it("학부모는 MY페이지·자녀 등록 및 수정·신청 내역·내 정보 수정 4개를 본다", async () => {
    mockProfileRow = {
      id: "u2",
      email: "parent@test.com",
      name: "이혜진",
      member_type: "parent",
      role: "parent",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u2", email: "parent@test.com" } },
      user: { id: "u2", email: "parent@test.com" },
      isReady: true,
    });

    renderHeader();
    await openMyColumn();

    expect(screen.getByText("MY페이지")).toBeInTheDocument();
    expect(screen.getByText("자녀 등록 및 수정")).toBeInTheDocument();
    expect(screen.getByText("신청 내역")).toBeInTheDocument();
    expect(screen.getByText("내 정보 수정")).toBeInTheDocument();
    expect(screen.queryByText("나의 서비스")).not.toBeInTheDocument();
  });

  it("관리자는 MY페이지·관리자 메뉴·내 정보 수정 3개를 본다", async () => {
    mockProfileRow = {
      id: "u3",
      email: "admin@test.com",
      name: "관리자짱",
      member_type: "admin",
      role: "admin",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u3", email: "admin@test.com" } },
      user: { id: "u3", email: "admin@test.com" },
      isReady: true,
    });

    renderHeader();
    await openMyColumn();

    expect(screen.getByText("MY페이지")).toBeInTheDocument();
    expect(screen.getByText("관리자 메뉴")).toBeInTheDocument();
    expect(screen.getByText("내 정보 수정")).toBeInTheDocument();
    expect(screen.queryByText("나의 서비스")).not.toBeInTheDocument();
    expect(screen.queryByText("자녀 등록 및 수정")).not.toBeInTheDocument();
  });
});

describe("Header — 로그인 회색존 상단 정렬(2026-09-03, 빈 제목 줄 제거)", () => {
  it("MY 컬럼은 빈 제목 줄 없이 pt-6로 시작하고 항목이 존의 첫 콘텐츠다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();
    const nameChip = await screen.findByRole("link", { name: "마이페이지" });
    fireEvent.mouseOver(nameChip.parentElement?.parentElement as Element);

    const myPageLink = await screen.findByText("MY페이지");
    const itemsContainer = myPageLink.parentElement;
    const zoneBox = itemsContainer?.parentElement;

    // 다른 5개 컬럼의 py-6(상단 1.5rem)과 맞추기 위해 상단만 pt-6를 쓰고, 좌/우/하단은
    // 계정 그룹 축 기준 p-10 계열을 유지한다(pl-10/pr-10/pb-10) — 균일 p-10은 더 이상
    // 아니다.
    expect(zoneBox?.className).toContain("pt-6");
    expect(zoneBox?.className).not.toMatch(/(?:^|\s)p-10(?:\s|$)/);

    // 빈 제목 <p aria-hidden> 줄이 사라져 아이템 목록(itemsContainer)이 존의 첫 자식이다.
    expect(zoneBox?.firstElementChild).toBe(itemsContainer);
  });

  it("게스트 회색존은 변경 없이 균일 p-10을 유지한다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    const logo = screen.getByRole("link", { name: "위닝에듀" });
    fireEvent.mouseOver(logo);

    const ctaLink = screen.getByRole("link", { name: "로그인하기" });
    // 카드(ctaLink의 조부모) → 회색존(카드의 부모)까지 두 단계 위로 올라간다.
    const zoneBox = ctaLink.parentElement?.parentElement;
    expect(zoneBox?.className).toMatch(/(?:^|\s)p-10(?:\s|$)/);
  });
});

describe("Header — 햄버거 위치(§6-7, 2026-09-03 계정 그룹 마지막으로 이동)", () => {
  it("햄버거는 로고와 함께 좌표계 1 밴드(justify-between)의 마지막 자식에 위치한다", () => {
    // nav는 0d3f8487 이전 구조로 되돌아가 좌표계 2(2026-09-03부터 fixed overlay, 이전
    // 좌측선 재조정 커밋 참고)에 별도로 뜬다 — 더는 이 밴드의 형제가 아니라서 nav 대비
    // DOM 순서로는 검증할 수 없다. 대신 "로고
    // 옆에 붙는" 버그(§6-7)의 실제 원인이었던 구조 — 좌표계 1 밴드가 정확히 [로고,
    // 햄버거+계정 그룹] 2개 자식만 갖고 justify-between으로 배치되는지를 검증한다.
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    const hamburger = screen.getByRole("button", { name: "전체 메뉴 열기" });
    const band = hamburger.closest("header")?.firstElementChild;

    expect(band?.className).toContain("justify-between");
    expect(band?.children).toHaveLength(2);
    expect(band?.lastElementChild?.contains(hamburger)).toBe(true);
  });

  it("nav 오버레이는 메가 패널과 동일한 fixed 포지셔닝을 쓴다(2026-09-03 좌측선 재조정)", () => {
    // nav가 absolute(조상 header의 fixed에 얹힌 containing block)였을 때 메가 컬럼
    // 좌측선과 실측으로 8px(1440~1680)/5px(1920) 어긋났다 — 메가 패널과 동일하게
    // `fixed left-0 top-0 w-full`로 통일해 두 계산식을 실제로 같게 만든다.
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    const { container } = renderHeader();
    const nav = container.querySelector("header > nav");

    expect(nav?.className).toContain("fixed");
    expect(nav?.className).not.toMatch(/(?:^|\s)absolute(?:\s|$)/);
    expect(nav?.className).toContain("left-0");
    expect(nav?.className).toContain("w-full");
  });

  it("nav 오버레이는 header와 같은 63px 내용 행이 되도록 투명 테두리를 진다(2026-09-06 1px 정렬)", () => {
    // `<header>`는 border-box `h-16`(4rem) 안에 `border-b`(1px)가 포함돼 실제 내용 행이
    // 63px다(로고/계정 그룹은 h-full로 그 63px을 그대로 받는다). 이 nav는 테두리가 없어
    // `h-16`이 64px 내용 행이 됐고, 서로 다른 높이 안에서 각자 `items-center`가 nav
    // 라벨을 로고/계정 그룹보다 0.5px 아래로 밀었다 — 투명 `border-b`로 같은 1px을
    // 내부로 밀어 넣어 내용 행 높이를 실제로 맞춘다.
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    const { container } = renderHeader();
    const nav = container.querySelector("header > nav");

    expect(nav?.className).toContain("h-16");
    expect(nav?.className).toContain("border-b");
    expect(nav?.className).toContain("border-transparent");
  });

  it("메가 컬럼 wrapper는 grid item이 아니라 nav와 동일한 순수 block mx-auto다(2026-09-03 좌측선 재조정 2차)", () => {
    // 실측 결과 컬럼 wrapper가 회색존과 같은 grid cell(col-start-1 row-start-1)을 공유할 때
    // CSS Grid의 auto-margin 정렬이 두 형제 사이에서 다르게 계산돼(nav의 순수 block
    // mx-auto와 달리) 8px(1440~1680)/5px(1920) 어긋났다 — 컬럼 wrapper를 grid item에서
    // 빼고(col-start-1 제거) 회색존은 absolute로 분리해 서로 영향을 주지 않게 한다.
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    const columnTitle = screen.getByText("서비스", { selector: "p" });
    const columnWrapper =
      columnTitle.parentElement?.parentElement?.parentElement;
    const outerRelative = columnWrapper?.parentElement;

    expect(columnWrapper?.className).not.toMatch(/col-start-1/);
    expect(columnWrapper?.className).toContain("mx-auto");
    expect(columnWrapper?.className).toContain("max-w-content");
    expect(outerRelative?.className).toContain("relative");
  });

  it("게스트 상태에서 햄버거는 계정 그룹(로그인·회원가입) 다음의 마지막 자식이다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    const hamburger = screen.getByRole("button", { name: "전체 메뉴 열기" });
    const signup = screen.getByRole("link", { name: "회원가입" });
    const wrapper = hamburger.parentElement;

    expect(wrapper?.lastElementChild).toBe(hamburger);
    expect(
      signup.compareDocumentPosition(hamburger) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("로그인 상태에서 햄버거는 로그아웃 버튼 다음의 마지막 자식이다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "student@test.com",
      name: "홍길동",
      member_type: "student",
      role: "student",
    };
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "student@test.com" } },
      user: { id: "u1", email: "student@test.com" },
      isReady: true,
    });

    renderHeader();
    await screen.findByRole("link", { name: "마이페이지" });

    const hamburger = screen.getByRole("button", { name: "전체 메뉴 열기" });
    const logout = screen.getByRole("button", { name: "로그아웃" });
    const wrapper = hamburger.parentElement;

    expect(wrapper?.lastElementChild).toBe(hamburger);
    expect(
      logout.compareDocumentPosition(hamburger) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
