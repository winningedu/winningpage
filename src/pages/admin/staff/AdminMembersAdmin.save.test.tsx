// 관리자 상세의 저장. 직원 정보는 PATCH, 개별 권한은 PUT 으로 계약 본문 그대로 보낸다.

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
import { ApiError } from "@/lib/http/client";
import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  profile_id: "p1",
  role_id: "role-1",
  department: "운영팀",
  status: "active",
  member_name: "김관리",
  member_email: "kim@example.com",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/staff": {
      items: [KIM],
      roles: [
        { id: "role-1", name: "운영자", is_super: false },
        { id: "role-2", name: "재무", is_super: false },
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
      ],
    },
    "admin/staff/p1": {
      member: KIM,
      overrides: [{ resourceKey: "popups", level: "view" }],
      effective: [],
    },
  });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const title = () => document.querySelector('[data-slot="toast-title"]');
const description = () =>
  document.querySelector('[data-slot="toast-description"]');

async function openInfo() {
  renderMembers("/admin/adminMembers/p1");
  await screen.findByText("kim@example.com");
}

test("직원 정보를 저장하면 계약 본문으로 PATCH 하고 성공 토스트를 보인다", async () => {
  http.patch.mockReturnValue({ json: async () => KIM });
  await openInfo();

  fireEvent.change(screen.getByLabelText("권한 묶음"), {
    target: { value: "role-2" },
  });
  fireEvent.change(screen.getByLabelText("부서"), {
    target: { value: "  재무팀 " },
  });
  fireEvent.change(screen.getByLabelText("상태"), {
    target: { value: "suspended" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(title()).toHaveTextContent("저장했습니다."));
  expect(http.patch).toHaveBeenCalledWith("admin/staff/p1", {
    json: { roleId: "role-2", department: "재무팀", status: "suspended" },
  });
});

test("권한 묶음을 없음으로 두고 부서를 비우면 null 로 보낸다", async () => {
  http.patch.mockReturnValue({ json: async () => KIM });
  await openInfo();

  fireEvent.change(screen.getByLabelText("권한 묶음"), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("부서"), { target: { value: " " } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(http.patch).toHaveBeenCalled());
  expect(http.patch.mock.calls[0]?.[1]).toEqual({
    json: { roleId: null, department: null, status: "active" },
  });
});

test("저장하는 동안 버튼은 눌리지 않고, 끝나면 상세를 다시 불러온다", async () => {
  let finish: (value: unknown) => void = () => {};
  http.patch.mockReturnValue({
    json: () => new Promise((resolve) => (finish = resolve)),
  });
  await openInfo();
  const callsBefore = http.get.mock.calls.length;

  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  expect(
    await screen.findByRole("button", { name: "저장 중..." }),
  ).toBeDisabled();
  finish(KIM);
  await waitFor(() => expect(title()).toHaveTextContent("저장했습니다."));
  expect(http.get.mock.calls.length).toBeGreaterThan(callsBefore);
});

test("마지막 최고 관리자 보호로 거절되면 서버 안내를 저장 실패로 보인다", async () => {
  http.patch.mockReturnValue({
    json: async () => {
      throw new ApiError({
        status: 409,
        code: "LAST_SUPER_ADMIN",
        detail: "최고 관리자가 1명뿐이라 강등, 정지, 삭제할 수 없습니다.",
      });
    },
  });
  await openInfo();

  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => {
    expect(title()).toHaveTextContent("저장 실패");
    expect(description()).toHaveTextContent("최고 관리자가 1명뿐이라");
  });
});

test("개별 권한을 저장하면 고른 항목만 PUT 으로 보낸다", async () => {
  http.put.mockReturnValue({ json: async () => ({ items: [] }) });
  renderMembers("/admin/adminMembers/p1/perm");

  fireEvent.click(await screen.findByRole("radio", { name: "배너 수정 가능" }));
  fireEvent.click(screen.getByRole("button", { name: "개별 권한 저장" }));

  await waitFor(() =>
    expect(title()).toHaveTextContent("개별 권한을 저장했습니다."),
  );
  expect(http.put).toHaveBeenCalledWith("admin/staff/p1/permissions", {
    json: {
      items: [
        { resourceKey: "popups", level: "view" },
        { resourceKey: "banners", level: "edit" },
      ],
    },
  });
});

test("개별 권한 저장이 실패하면 저장 실패 토스트를 보인다", async () => {
  http.put.mockReturnValue({
    json: async () => {
      throw new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        detail: "요청 값을 확인해 주세요.",
      });
    },
  });
  renderMembers("/admin/adminMembers/p1/perm");

  fireEvent.click(
    await screen.findByRole("button", { name: "개별 권한 저장" }),
  );

  await waitFor(() => {
    expect(title()).toHaveTextContent("저장 실패");
    expect(description()).toHaveTextContent("요청 값을 확인해 주세요.");
  });
});
