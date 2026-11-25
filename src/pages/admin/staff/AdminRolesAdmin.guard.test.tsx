// 저장하지 않은 권한 묶음 폼이 있을 때만 화면을 나가기 전에 묻는다.

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
import { renderRoles, routeApi } from "./testHelpers";

const OPS = {
  id: "r1",
  name: "운영팀",
  description: null,
  is_super: false,
  is_system: false,
  permissions: [],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/roles": {
      items: [OPS],
      resources: [
        {
          key: "popups",
          group_title: "메인 관리",
          label: "팝업",
          sort_order: 1,
        },
      ],
    },
    "admin/roles/r1": OPS,
  });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const cancel = () =>
  fireEvent.click(screen.getByRole("button", { name: "취소" }));

test("이름을 고친 채 취소하면 확인을 묻고 계속 수정하면 머문다", async () => {
  const { router } = renderRoles("/admin/adminRoles/r1");
  fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
    target: { value: "운영본부" },
  });

  cancel();

  expect(
    await screen.findByText("저장하지 않은 변경이 있어요"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "계속 수정" }));
  await waitFor(() =>
    expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull(),
  );
  expect(router.state.location.pathname).toBe("/admin/adminRoles/r1");
});

test("나가기를 고르면 목록으로 이동한다", async () => {
  const { router } = renderRoles("/admin/adminRoles/r1");
  fireEvent.click(await screen.findByRole("radio", { name: "팝업 수정 가능" }));

  cancel();
  fireEvent.click(await screen.findByRole("button", { name: "나가기" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminRoles"),
  );
});

test("고치지 않았으면 막지 않는다", async () => {
  const { router } = renderRoles("/admin/adminRoles/r1");
  await screen.findByText("권한 묶음 수정");

  cancel();

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminRoles"),
  );
});

test("등록 화면은 입력이 있을 때만 묻는다", async () => {
  const { router } = renderRoles("/admin/adminRoles/new");
  await screen.findByText("권한 묶음 등록");

  fireEvent.change(screen.getByLabelText("설명"), {
    target: { value: "메모" },
  });
  cancel();

  expect(
    await screen.findByText("저장하지 않은 변경이 있어요"),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/adminRoles/new");
});

test("저장하고 목록으로 갈 때는 묻지 않는다", async () => {
  http.patch.mockReturnValue({ json: async () => ({ ...OPS }) });
  http.put.mockReturnValue({ json: async () => ({ items: [] }) });
  const { router } = renderRoles("/admin/adminRoles/r1");
  fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
    target: { value: "운영본부" },
  });

  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/adminRoles"),
  );
  expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull();
});
