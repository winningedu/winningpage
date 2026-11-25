// 저장하지 않은 폼이 있을 때만 화면을 나가기 전에 묻는다. 같은 관리자의 탭 이동은 막지 않는다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
import { renderMembers, routeApi } from "./testHelpers";

let saved = { department: "운영팀" };

const member = () => ({
  profile_id: "p1",
  role_id: "role-1",
  department: saved.department,
  status: "active",
  member_name: "김관리",
  member_email: "kim@example.com",
});

beforeEach(() => {
  saved = { department: "운영팀" };
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/staff": () => ({
      items: [member()],
      roles: [{ id: "role-1", name: "운영자", is_super: false }],
      resources: [
        {
          key: "popups",
          group_title: "메인 관리",
          label: "팝업",
          sort_order: 1,
        },
      ],
    }),
    "admin/staff/p1": () => ({
      member: member(),
      overrides: [],
      effective: [],
    }),
  });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const goToList = () =>
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

async function editDepartment() {
  const rendered = renderMembers("/admin/adminMembers/p1");
  fireEvent.change(await screen.findByLabelText("부서"), {
    target: { value: "재무팀" },
  });
  return rendered;
}

test("부서를 고친 채 목록으로 나가면 확인을 묻고 계속 수정하면 머문다", async () => {
  const { router } = await editDepartment();

  goToList();

  expect(
    await screen.findByText("저장하지 않은 변경이 있어요"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "계속 수정" }));
  await waitFor(() =>
    expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull(),
  );
  expect(router.state.location.pathname).toBe("/admin/adminMembers/p1");
});

test("나가기를 고르면 목록으로 이동한다", async () => {
  const { router } = await editDepartment();

  goToList();
  fireEvent.click(await screen.findByRole("button", { name: "나가기" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers"),
  );
});

test("고친 채 탭을 옮겨도 막지 않고, 고친 값은 그대로 남는다", async () => {
  const { router } = await editDepartment();

  fireEvent.click(screen.getByRole("tab", { name: "개별 권한 설정" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers/p1/perm"),
  );
  expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull();

  fireEvent.click(screen.getByRole("tab", { name: "직원 정보" }));
  expect(await screen.findByLabelText("부서")).toHaveValue("재무팀");
});

test("고치지 않았으면 막지 않는다", async () => {
  const { router } = renderMembers("/admin/adminMembers/p1");
  await screen.findByText("kim@example.com");

  goToList();

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers"),
  );
});

test("개별 권한을 고친 채 나가도 묻는다", async () => {
  const { router } = renderMembers("/admin/adminMembers/p1/perm");
  fireEvent.click(await screen.findByRole("radio", { name: "팝업 수정 가능" }));

  goToList();

  expect(
    await screen.findByText("저장하지 않은 변경이 있어요"),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/adminMembers/p1/perm");
});

test("저장한 뒤에는 막지 않는다", async () => {
  http.patch.mockImplementation(() => ({
    json: async () => {
      saved = { department: "재무팀" };
      return member();
    },
  }));
  const { router } = await editDepartment();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByText("저장했습니다.");

  goToList();

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminMembers"),
  );
});
