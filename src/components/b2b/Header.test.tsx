import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Header from "./Header";

vi.mock("@/hooks/useNavGroups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNavGroups")>();
  return {
    ...actual,
    useNavGroups: () => [
      {
        title: "목표성장서비스",
        to: "/services",
        items: [{ label: "학습진단", to: "/services/learning-diagnosis" }],
      },
      { title: "이용신청", to: "/apply", items: [] },
    ],
  };
});

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    logo: { horizontal: "/images/schoolmentor-logo-horizontal.png" },
  },
}));

const mockSignOut = vi.fn(async () => ({ error: null }));
const mockApiFetch = vi.fn();
vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock("@/hooks/useSignupEnabled", () => ({
  useSignupEnabled: () => true,
}));

let mockProfileRow: Record<string, unknown> | null = null;
let mockTenantRows: { id: string; name: string }[] = [];
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockProfileRow, error: null }),
        }),
      }),
    }),
    rpc: async () => ({ data: mockTenantRows, error: null }),
    auth: {
      signOut: (...args: unknown[]) => mockSignOut(...(args as [])),
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

describe("b2b Header 게스트 상태", () => {
  it("로그인과 선생님 버튼이 /login 으로 가고 회원가입은 없다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "선생님" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText("회원가입")).not.toBeInTheDocument();
  });
});

describe("b2b Header 메가 메뉴", () => {
  it("하위 항목이 있는 그룹만 알약으로 보이고, 올리면 항목만 있는 패널이 열린다", () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    expect(screen.queryByText("이용신청")).not.toBeInTheDocument();
    expect(screen.queryByText("학습진단")).not.toBeInTheDocument();

    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "목표성장서비스" }),
    );

    expect(screen.getByRole("link", { name: "학습진단" })).toHaveAttribute(
      "href",
      "/services/learning-diagnosis",
    );
    expect(screen.queryByText("MY페이지")).not.toBeInTheDocument();
    expect(screen.queryByText("로그인하기")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("학습진단")).not.toBeInTheDocument();
  });
});

describe("b2b Header 학생 상태", () => {
  it("이름 링크, 수능 D-day, 학교 칩, 로그아웃을 보여 주고 로그인 버튼은 없다", async () => {
    mockProfileRow = {
      id: "u1",
      email: "s@test.com",
      name: "홍길동",
      member_type: "student",
      role: "user",
    };
    mockTenantRows = [{ id: "t1", name: "세종고등학교" }];
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u1", email: "s@test.com" } },
      user: { id: "u1", email: "s@test.com" },
      isReady: true,
    });
    renderHeader();

    const nameLink = await screen.findByRole("link", {
      name: "홍길동 님 학생회원",
    });
    expect(nameLink).toHaveAttribute("href", "/mypage");
    expect(await screen.findByText("세종고등학교")).toBeInTheDocument();
    expect(screen.getByText(/^수능 D/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "로그아웃" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "로그인" }),
    ).not.toBeInTheDocument();
  });
});

describe("b2b Header 선생님 상태", () => {
  it("이름과 역할, 학교 칩, 관리 화면 링크, 로그아웃을 보여 주고 D-day와 마이페이지는 없다", async () => {
    mockProfileRow = {
      id: "u2",
      email: "t@test.com",
      name: "박지훈",
      member_type: "teacher",
      role: "user",
    };
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        teacher: { name: "박지훈", role: "homeroom" },
        tenant: { name: "한빛고등학교" },
      }),
    });
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u2", email: "t@test.com" } },
      user: { id: "u2", email: "t@test.com" },
      isReady: true,
    });
    renderHeader();

    expect(
      await screen.findByText("박지훈 선생님 담임교사"),
    ).toBeInTheDocument();
    expect(screen.getByText("한빛고등학교")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "관리 화면" })).toHaveAttribute(
      "href",
      "/teacher/dashboard",
    );
    expect(
      screen.getByRole("button", { name: "로그아웃" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^수능 D/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /마이페이지/ }),
    ).not.toBeInTheDocument();
  });
});

describe("b2b Header 선생님 조회 실패와 로그아웃", () => {
  it("콘솔 조회가 403이면 학생 상태로 보이고, 로그아웃은 세션만 끊는다", async () => {
    mockProfileRow = {
      id: "u3",
      email: "x@test.com",
      name: "김교사",
      member_type: "teacher",
      role: "user",
    };
    mockTenantRows = [];
    mockApiFetch.mockResolvedValue({ ok: false, status: 403 });
    mockUseAuth.mockReturnValue({
      session: { user: { id: "u3", email: "x@test.com" } },
      user: { id: "u3", email: "x@test.com" },
      isReady: true,
    });
    renderHeader();

    expect(
      await screen.findByRole("link", { name: "김교사 님 멘토회원" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "관리 화면" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() =>
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" }),
    );
  });
});

describe("b2b Header 드로어 연결", () => {
  it("게스트가 햄버거를 누르면 드로어 하단에 로그인과 선생님이 있고 회원가입은 없다", async () => {
    mockUseAuth.mockReturnValue({ session: null, user: null, isReady: true });
    renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "전체 메뉴 열기" }));

    const drawer = await screen.findByRole("dialog");
    expect(
      within(drawer).getByRole("link", { name: "선생님" }),
    ).toHaveAttribute("href", "/login");
    expect(within(drawer).queryByText("회원가입")).not.toBeInTheDocument();
  });
});

function loginAs(profile: { member_type: string; role: string }) {
  mockProfileRow = {
    id: "u9",
    email: "m@test.com",
    name: "최관리",
    ...profile,
  };
  mockTenantRows = [];
  mockUseAuth.mockReturnValue({
    session: { user: { id: "u9", email: "m@test.com" } },
    user: { id: "u9", email: "m@test.com" },
    isReady: true,
  });
}

async function renderAs(profile: { member_type: string; role: string }) {
  loginAs(profile);
  renderHeader();
  await screen.findByRole("link", { name: /최관리 님/ });
}

async function openDrawer() {
  fireEvent.click(screen.getByRole("button", { name: "전체 메뉴 열기" }));
  return within(await screen.findByRole("dialog"));
}

describe("b2b Header MY 메뉴 역할", () => {
  it("관리자는 드로어에서 관리자 메뉴 링크로 /admin 에 갈 수 있다", async () => {
    await renderAs({ member_type: "student", role: "admin" });

    const drawer = await openDrawer();

    expect(drawer.getByRole("link", { name: "관리자 메뉴" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("학부모는 드로어에서 자녀 등록 및 수정을 보고 나의 서비스는 보지 못한다", async () => {
    await renderAs({ member_type: "parent", role: "user" });

    const drawer = await openDrawer();

    expect(
      drawer.getByRole("link", { name: "자녀 등록 및 수정" }),
    ).toHaveAttribute("href", "/mypage?tab=children");
    expect(
      drawer.queryByRole("link", { name: "나의 서비스" }),
    ).not.toBeInTheDocument();
  });

  it("학생은 드로어에서 관리자 메뉴를 보지 못한다", async () => {
    await renderAs({ member_type: "student", role: "user" });

    const drawer = await openDrawer();

    expect(
      drawer.queryByRole("link", { name: "관리자 메뉴" }),
    ).not.toBeInTheDocument();
  });

  it("관리자는 데스크톱 계정 영역에 관리자 메뉴 링크가 있다", async () => {
    await renderAs({ member_type: "student", role: "admin" });

    expect(screen.getByRole("link", { name: "관리자 메뉴" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("학생은 데스크톱 계정 영역에 관리자 메뉴 링크가 없다", async () => {
    await renderAs({ member_type: "student", role: "user" });

    expect(
      screen.queryByRole("link", { name: "관리자 메뉴" }),
    ).not.toBeInTheDocument();
  });
});
