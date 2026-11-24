// 권한 묶음의 하위 주소. 목록, 등록(new), 편집(:roleId)이 각각 주소를 가지고, 새로고침해도 같은 화면이 열린다.

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
import { renderRoles, routeApi } from "./testHelpers";

const OPS = {
  id: "r1",
  name: "운영팀",
  description: "운영 담당",
  is_super: false,
  is_system: false,
  permissions: [{ resourceKey: "popups", level: "view" }],
};
const SUPER = {
  id: "r2",
  name: "최고 관리자",
  description: null,
  is_super: true,
  is_system: true,
  permissions: [],
};

function mockServer(overrides: Record<string, unknown> = {}) {
  routeApi(http.get, {
    "admin/roles": {
      items: [OPS, SUPER],
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
    "admin/roles/r1": OPS,
    "admin/roles/r2": SUPER,
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

test("등록하기를 누르면 new 주소로 이동해 빈 편집 화면을 보인다", async () => {
  const { router } = renderRoles();

  fireEvent.click(await screen.findByRole("button", { name: "등록하기" }));

  expect(await screen.findByText("권한 묶음 등록")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/adminRoles/new");
  expect(screen.getByLabelText("권한 묶음 이름")).toHaveValue("");
  expect(screen.getByRole("radio", { name: "팝업 미지정" })).toBeChecked();
  expect(http.get).not.toHaveBeenCalledWith(
    "admin/roles/new",
    expect.anything(),
  );
});

test("수정을 누르면 그 묶음의 주소로 이동해 저장된 값을 채운다", async () => {
  const { router } = renderRoles();

  fireEvent.click((await screen.findAllByRole("button", { name: "수정" }))[0]!);

  expect(await screen.findByText("권한 묶음 수정")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/adminRoles/r1");
  expect(screen.getByLabelText("권한 묶음 이름")).toHaveValue("운영팀");
  expect(screen.getByLabelText("설명")).toHaveValue("운영 담당");
  expect(screen.getByRole("radio", { name: "팝업 읽기 전용" })).toBeChecked();
});

test("편집 주소로 바로 들어와도 묶음과 메뉴 목록을 불러온다", async () => {
  renderRoles("/admin/adminRoles/r1");

  expect(await screen.findByText("권한 묶음 수정")).toBeInTheDocument();
  expect(http.get).toHaveBeenCalledWith("admin/roles/r1", expect.anything());
  expect(http.get).toHaveBeenCalledWith("admin/roles", expect.anything());
  expect(screen.getByText("FAQ")).toBeInTheDocument();
});

test("최고 관리자 묶음에는 안내를 보인다", async () => {
  renderRoles("/admin/adminRoles/r2");

  expect(
    await screen.findByText(/최고 관리자 묶음은 권한 항목을 갖지 않습니다/),
  ).toBeInTheDocument();
});

test("대분류의 일괄 버튼은 그 분류의 메뉴를 한 번에 고른다", async () => {
  renderRoles("/admin/adminRoles/new");

  fireEvent.click(
    await screen.findByRole("button", { name: "메인 관리 수정 가능 일괄" }),
  );

  expect(screen.getByRole("radio", { name: "팝업 수정 가능" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "배너 수정 가능" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "FAQ 미지정" })).toBeChecked();

  fireEvent.click(
    screen.getByRole("button", { name: "메인 관리 미지정 일괄" }),
  );
  expect(screen.getByRole("radio", { name: "팝업 미지정" })).toBeChecked();
});

test("취소를 누르면 목록으로 돌아간다", async () => {
  const { router } = renderRoles("/admin/adminRoles/r1");
  await screen.findByText("권한 묶음 수정");

  fireEvent.click(screen.getByRole("button", { name: "취소" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminRoles"),
  );
  expect(await screen.findByText("운영팀")).toBeInTheDocument();
});

test("브라우저 뒤로가기는 목록으로 돌아간다", async () => {
  const { router } = renderRoles();
  fireEvent.click((await screen.findAllByRole("button", { name: "수정" }))[0]!);
  await screen.findByText("권한 묶음 수정");

  await act(async () => {
    await router.navigate(-1);
  });

  expect(
    await screen.findByRole("button", { name: "등록하기" }),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/adminRoles");
});

test("없는 묶음이면 찾을 수 없다는 안내와 목록 링크를 보인다", async () => {
  mockServer({
    "admin/roles/none": new ApiError({
      status: 404,
      code: "NOT_FOUND",
      detail: "권한 묶음을 찾을 수 없습니다.",
    }),
  });
  const { router } = renderRoles("/admin/adminRoles/none");

  expect(
    await screen.findByText("권한 묶음을 찾을 수 없습니다."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "목록으로" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminRoles"),
  );
});
