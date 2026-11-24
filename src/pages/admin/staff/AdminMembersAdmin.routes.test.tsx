// 관리자 계정의 하위 주소. 목록, 상세, 개별 권한 탭이 각각 주소를 가지고, 새로고침해도 같은 화면이 열린다.

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  profile_id: "p1",
  role_id: "role-1",
  department: "운영팀",
  status: "active",
  member_name: "김관리",
  member_email: "kim@example.com",
  member_phone: "010-1111-2222",
};
const LEE = {
  profile_id: "p2",
  status: "active",
  member_name: "이운영",
  member_email: "lee@example.com",
};

function mockServer(overrides: Record<string, unknown> = {}) {
  routeApi(http.get, {
    "admin/staff": {
      items: [KIM, LEE],
      roles: [
        { id: "role-1", name: "운영자", is_super: false },
        { id: "role-2", name: "최고 관리자", is_super: true },
      ],
      resources: [
        {
          key: "popups",
          group_title: "메인 관리",
          label: "팝업",
          sort_order: 1,
        },
        {
          key: "banners",
          group_title: "메인 관리",
          label: "배너",
          sort_order: 2,
        },
        { key: "faq", group_title: "게시판 관리", label: "FAQ", sort_order: 3 },
      ],
    },
    "admin/staff/p1": {
      member: KIM,
      overrides: [{ resourceKey: "popups", level: "view" }],
      effective: [
        { resourceKey: "popups", level: "view" },
        { resourceKey: "banners", level: "edit" },
      ],
    },
    ...overrides,
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockServer();
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

test("더보기를 누르면 상세 주소로 이동해 직원 정보를 보인다", async () => {
  const { router } = renderMembers();

  fireEvent.click(
    (
      await screen.findAllByRole("button", { name: "더보기" })
    )[0] as HTMLElement,
  );

  expect(await screen.findByText("010-1111-2222")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/adminMembers/p1");
  expect(http.get).toHaveBeenCalledWith("admin/staff/p1", expect.anything());
});

test("상세 주소로 바로 들어와도 상세와 권한 묶음 선택지를 불러온다", async () => {
  renderMembers("/admin/adminMembers/p1");

  expect(await screen.findByText("010-1111-2222")).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "최고 관리자" }),
  ).toBeInTheDocument();
  expect(http.get).toHaveBeenCalledWith("admin/staff/p1", expect.anything());
  expect(http.get).toHaveBeenCalledWith("admin/staff", expect.anything());
});

test("탭은 role=tab 이고 누르면 주소가 바뀐다", async () => {
  const { router } = renderMembers("/admin/adminMembers/p1");

  const info = await screen.findByRole("tab", { name: "직원 정보" });
  const perm = screen.getByRole("tab", { name: "개별 권한 설정" });
  expect(info).toHaveAttribute("aria-selected", "true");

  fireEvent.click(perm);

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers/p1/perm"),
  );
  expect(perm).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText(/개별 권한은 권한 묶음을 덮어씁니다/)).toBeVisible();
  expect(screen.queryByText("kim@example.com")).not.toBeInTheDocument();

  fireEvent.click(info);
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers/p1"),
  );
});

test("개별 권한 탭 주소로 바로 들어오면 덮어쓴 값과 최종 권한을 보인다", async () => {
  renderMembers("/admin/adminMembers/p1/perm");

  const popupsView = await screen.findByRole("radio", {
    name: "팝업 읽기 전용",
  });
  expect(popupsView).toBeChecked();
  expect(screen.getByRole("radio", { name: "배너 미지정" })).toBeChecked();
  // 최종 권한 열: 묶음이 준 배너 수정 가능, 행이 없는 FAQ 는 접근 불가.
  const bannerRow = screen.getByText("배너").closest("div")?.parentElement;
  expect(bannerRow).toHaveTextContent("수정 가능");
  const faqRow = screen.getByText("FAQ").closest("div")?.parentElement;
  expect(faqRow).toHaveTextContent("접근 불가");
});

test("알 수 없는 탭 주소는 정보 탭으로 돌아간다", async () => {
  const { router } = renderMembers("/admin/adminMembers/p1/nope");

  await screen.findByText("010-1111-2222");
  expect(router.state.location.pathname).toBe("/admin/adminMembers/p1");
});

test("목록으로를 누르면 목록 주소로 돌아간다", async () => {
  const { router } = renderMembers("/admin/adminMembers/p1");
  await screen.findByText("010-1111-2222");

  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers"),
  );
  expect(await screen.findByText("이운영")).toBeInTheDocument();
});

test("브라우저 뒤로가기는 목록으로 돌아간다", async () => {
  const { router } = renderMembers();
  fireEvent.click(
    (
      await screen.findAllByRole("button", { name: "더보기" })
    )[0] as HTMLElement,
  );
  await screen.findByText("010-1111-2222");

  await act(async () => {
    await router.navigate(-1);
  });

  expect(await screen.findByText("이운영")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/adminMembers");
});

test("없는 관리자면 찾을 수 없다는 안내와 목록 링크를 보인다", async () => {
  mockServer({
    "admin/staff/p-none": new ApiError({
      status: 404,
      code: "NOT_FOUND",
      detail: "관리자를 찾을 수 없습니다.",
    }),
  });
  const { router } = renderMembers("/admin/adminMembers/p-none");

  expect(
    await screen.findByText("관리자를 찾을 수 없습니다."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "목록으로" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers"),
  );
});
