// 회원 상세의 저장 동작이 서버 API 로 나가는 모양과, 성공과 실패 안내.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

// 마스킹 해제 게이트는 비밀번호 재확인을 거치므로 테스트에서는 바로 통과시킨다.
vi.mock("@/pages/admin/shared/SensitiveActionGate", () => ({
  useSensitiveActionGate: () => ({
    requestAccess: (options: { onGranted: () => void }) => options.onGranted(),
    gate: null,
  }),
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({
    rows,
    onEdit,
  }: {
    rows: { id: string; name: string }[];
    onEdit: (row: unknown) => void;
  }) => (
    <div>
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => onEdit(row)}>
          {`열기 ${row.name}`}
        </button>
      ))}
    </div>
  ),
}));

import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { memberKeys } from "./api";
import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  id: "p-kim",
  name: "김학생",
  member_type: "student",
  guardian_phone: "010-0000-0000",
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/members": { items: [KIM] },
    "admin/members/p-kim": KIM,
    "admin/members/p-kim/links": { items: [] },
    "admin/tenant-options": { items: [] },
  });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const toastTitle = () => document.querySelector('[data-slot="toast-title"]');
const toastDescription = () =>
  document.querySelector('[data-slot="toast-description"]');

async function openGuardianPhone() {
  const rendered = renderMembers("/admin/members/p-kim");
  fireEvent.click(await screen.findByRole("button", { name: "마스킹 해제" }));
  const input = await screen.findByLabelText("학부모 핸드폰");
  const row = input.closest("div")?.parentElement as HTMLElement;
  return {
    ...rendered,
    input,
    save: () =>
      fireEvent.click(within(row).getByRole("button", { name: "저장" })),
  };
}

test("학부모 핸드폰은 그 필드만 PATCH 로 보내고 상세와 목록 캐시를 맞춘다", async () => {
  http.patch.mockReturnValue({
    json: async () => ({ ...KIM, guardian_phone: "010-1111-2222" }),
  });
  const { input, save, queryClient } = await openGuardianPhone();

  fireEvent.change(input, { target: { value: "01011112222" } });
  save();

  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith("admin/members/p-kim", {
      json: { guardian_phone: "010-1111-2222" },
    }),
  );
  await waitFor(() =>
    expect(toastTitle()).toHaveTextContent("학부모 핸드폰을 저장했습니다."),
  );
  expect(
    queryClient.getQueryData<typeof KIM>(memberKeys.detail("p-kim"))
      ?.guardian_phone,
  ).toBe("010-1111-2222");
  // 저장 뒤 다시 읽지 않는다.
  expect(
    http.get.mock.calls.filter((call) => call[0] === "admin/members/p-kim"),
  ).toHaveLength(1);
});

test("학부모 핸드폰을 비워 저장하면 null 로 보낸다", async () => {
  http.patch.mockReturnValue({
    json: async () => ({ ...KIM, guardian_phone: null }),
  });
  const { input, save } = await openGuardianPhone();

  fireEvent.change(input, { target: { value: "" } });
  save();

  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith("admin/members/p-kim", {
      json: { guardian_phone: null },
    }),
  );
});

test("학부모 핸드폰 저장이 실패하면 서버 안내를 토스트로 보인다", async () => {
  http.patch.mockReturnValue({
    json: async () => {
      throw new ApiError({
        status: 403,
        code: "FORBIDDEN",
        detail: "회원 관리 수정 권한이 없습니다.",
      });
    },
  });
  const { input, save } = await openGuardianPhone();

  fireEvent.change(input, { target: { value: "01011112222" } });
  save();

  await waitFor(() => {
    expect(toastTitle()).toHaveTextContent("학부모 핸드폰 저장 실패");
    expect(toastDescription()).toHaveTextContent(
      "회원 관리 수정 권한이 없습니다.",
    );
  });
});

test("저장하는 동안 저장 버튼이 잠긴다", async () => {
  http.patch.mockReturnValue({ json: () => new Promise(() => {}) });
  const { input, save } = await openGuardianPhone();

  fireEvent.change(input, { target: { value: "01011112222" } });
  save();

  expect(
    await screen.findByRole("button", { name: "저장 중..." }),
  ).toBeDisabled();
});
