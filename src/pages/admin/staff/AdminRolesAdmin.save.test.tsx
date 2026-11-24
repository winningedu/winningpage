// 권한 묶음의 저장. 등록은 POST 뒤 PUT, 수정은 PATCH 뒤 PUT 으로 계약 본문 그대로 보낸다.

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
import { renderRoles, routeApi } from "./testHelpers";

const OPS = {
  id: "r1",
  name: "운영팀",
  description: "운영 담당",
  is_super: false,
  is_system: false,
  permissions: [{ resourceKey: "popups", level: "view" }],
};
const SAVED = { ...OPS, created_at: null, updated_at: null };

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
        {
          key: "banners",
          group_title: "메인 관리",
          label: "배너",
          sort_order: 2,
        },
      ],
    },
    "admin/roles/r1": OPS,
  });
  http.put.mockReturnValue({ json: async () => ({ items: [] }) });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const title = () => document.querySelector('[data-slot="toast-title"]');
const description = () =>
  document.querySelector('[data-slot="toast-description"]');

const rejecting = (status: number, code: string, detail: string) => ({
  json: async () => {
    throw new ApiError({ status, code, detail });
  },
});

async function fillNew() {
  const rendered = renderRoles("/admin/adminRoles/new");
  fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
    target: { value: " 재무팀 " },
  });
  fireEvent.change(screen.getByLabelText("설명"), {
    target: { value: " 정산 담당 " },
  });
  fireEvent.click(screen.getByRole("radio", { name: "배너 수정 가능" }));
  return rendered;
}

test("등록하면 POST 로 묶음을 만들고 PUT 으로 권한을 넣은 뒤 목록으로 간다", async () => {
  http.post.mockReturnValue({
    json: async () => ({ ...SAVED, id: "r-new", name: "재무팀" }),
  });
  const { router } = await fillNew();

  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(title()).toHaveTextContent("저장했습니다."));
  expect(http.post).toHaveBeenCalledWith("admin/roles", {
    json: { name: "재무팀", description: "정산 담당" },
  });
  expect(http.put).toHaveBeenCalledWith("admin/roles/r-new/permissions", {
    json: { items: [{ resourceKey: "banners", level: "edit" }] },
  });
  expect(router.state.location.pathname).toBe("/admin/adminRoles");
});

test("설명을 비우면 null 로 보낸다", async () => {
  http.post.mockReturnValue({ json: async () => ({ ...SAVED, id: "r-new" }) });
  renderRoles("/admin/adminRoles/new");
  fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
    target: { value: "재무팀" },
  });

  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(http.post).toHaveBeenCalled());
  expect(http.post.mock.calls[0]?.[1]).toEqual({
    json: { name: "재무팀", description: null },
  });
});

test("이름이 비면 요청 없이 자동으로 닫히지 않는 경고를 보인다", async () => {
  const addSpy = vi.spyOn(toast, "add");
  renderRoles("/admin/adminRoles/new");

  fireEvent.click(await screen.findByRole("button", { name: "저장" }));

  await waitFor(() =>
    expect(title()).toHaveTextContent("권한 묶음 이름을 입력해 주세요."),
  );
  expect(addSpy).toHaveBeenCalledWith(
    expect.objectContaining({ type: "warning", priority: "high", timeout: 0 }),
  );
  expect(http.post).not.toHaveBeenCalled();
});

test("묶음을 만들지 못하면 저장 실패와 서버 안내를 보이고 권한은 보내지 않는다", async () => {
  http.post.mockReturnValue(
    rejecting(400, "VALIDATION_FAILED", "권한 묶음 이름을 입력해 주세요."),
  );
  await fillNew();

  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => {
    expect(title()).toHaveTextContent("저장 실패");
    expect(description()).toHaveTextContent("권한 묶음 이름을 입력해 주세요.");
  });
  expect(http.put).not.toHaveBeenCalled();
});

test("권한 항목 저장이 실패하면 그 제목으로 알리고, 다시 저장해도 묶음을 또 만들지 않는다", async () => {
  http.post.mockReturnValue({ json: async () => ({ ...SAVED, id: "r-new" }) });
  http.patch.mockReturnValue({ json: async () => ({ ...SAVED, id: "r-new" }) });
  http.put.mockReturnValueOnce(
    rejecting(400, "VALIDATION_FAILED", "요청 값을 확인해 주세요."),
  );
  const { router } = await fillNew();

  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(title()).toHaveTextContent("권한 항목 저장 실패"));
  expect(router.state.location.pathname).toBe("/admin/adminRoles/new");

  fireEvent.click(await screen.findByRole("button", { name: "저장" }));
  await waitFor(() => expect(http.put).toHaveBeenCalledTimes(2));
  expect(http.post).toHaveBeenCalledTimes(1);
  expect(http.patch).toHaveBeenCalledWith("admin/roles/r-new", {
    json: { name: "재무팀", description: "정산 담당" },
  });
});

test("수정하면 PATCH 뒤 PUT 으로 보내고 목록으로 간다", async () => {
  http.patch.mockReturnValue({ json: async () => SAVED });
  const { router } = renderRoles("/admin/adminRoles/r1");
  fireEvent.change(await screen.findByLabelText("권한 묶음 이름"), {
    target: { value: "운영본부" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "팝업 수정 가능" }));

  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(title()).toHaveTextContent("저장했습니다."));
  expect(http.patch).toHaveBeenCalledWith("admin/roles/r1", {
    json: { name: "운영본부", description: "운영 담당" },
  });
  expect(http.put).toHaveBeenCalledWith("admin/roles/r1/permissions", {
    json: { items: [{ resourceKey: "popups", level: "edit" }] },
  });
  expect(http.post).not.toHaveBeenCalled();
  expect(router.state.location.pathname).toBe("/admin/adminRoles");
});

test("저장하는 동안 버튼은 눌리지 않는다", async () => {
  http.patch.mockReturnValue({ json: () => new Promise(() => {}) });
  renderRoles("/admin/adminRoles/r1");

  fireEvent.click(await screen.findByRole("button", { name: "저장" }));

  expect(
    await screen.findByRole("button", { name: "저장 중..." }),
  ).toBeDisabled();
});
