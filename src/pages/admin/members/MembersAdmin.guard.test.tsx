// 저장하지 않은 폼이 있을 때만 화면을 나가기 전에 묻는다. 같은 회원의 탭 이동은 막지 않는다.

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
import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  id: "p-kim",
  name: "김학생",
  member_type: "student",
  tenant_id: "t-1",
  guardian_phone: "010-0000-0000",
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/members": { items: [KIM] },
    "admin/members/p-kim": KIM,
    "admin/members/p-kim/links": { items: [] },
    "admin/members/p-kim/orders": { items: [] },
    "admin/tenant-options": {
      items: [
        { id: "t-1", name: "가나고", org_type: "학교", is_catch_all: false },
        { id: "t-2", name: "다라고", org_type: "학교", is_catch_all: false },
      ],
    },
  });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function editGuardianPhone() {
  const rendered = renderMembers("/admin/members/p-kim");
  fireEvent.click(await screen.findByRole("button", { name: "마스킹 해제" }));
  fireEvent.change(await screen.findByLabelText("학부모 핸드폰"), {
    target: { value: "01099998888" },
  });
  return rendered;
}

const goToList = () =>
  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));

test("학부모 핸드폰을 고친 채 목록으로 나가면 확인을 묻고 계속 수정하면 머문다", async () => {
  const { router } = await editGuardianPhone();

  goToList();

  expect(
    await screen.findByText("저장하지 않은 변경이 있어요"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "계속 수정" }));
  await waitFor(() =>
    expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull(),
  );
  expect(router.state.location.pathname).toBe("/admin/members/p-kim");
});

test("나가기를 고르면 목록으로 이동한다", async () => {
  const { router } = await editGuardianPhone();

  goToList();
  fireEvent.click(await screen.findByRole("button", { name: "나가기" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members"),
  );
});

test("고친 채 탭을 옮겨도 막지 않는다", async () => {
  const { router } = await editGuardianPhone();

  fireEvent.click(screen.getByRole("tab", { name: "결제내역" }));

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members/p-kim/pay"),
  );
  expect(screen.queryByText("저장하지 않은 변경이 있어요")).toBeNull();
});

test("고치지 않았으면 막지 않는다", async () => {
  const { router } = renderMembers("/admin/members/p-kim");
  await screen.findByText("기본 정보");

  goToList();

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members"),
  );
});

test("저장한 뒤에는 막지 않는다", async () => {
  http.patch.mockReturnValue({
    json: async () => ({ ...KIM, guardian_phone: "010-9999-8888" }),
  });
  const { router } = await editGuardianPhone();
  const input = screen.getByLabelText("학부모 핸드폰");
  const row = input.closest("div")?.parentElement as HTMLElement;
  fireEvent.click(
    Array.from(row.querySelectorAll("button")).find(
      (button) => button.textContent === "저장",
    ) as HTMLButtonElement,
  );
  await screen.findByText("학부모 핸드폰을 저장했습니다.");

  goToList();

  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/admin/members"),
  );
});

test("이동 폼에 입력이 있으면 나갈 때 묻는다", async () => {
  const { router } = renderMembers("/admin/members/p-kim");
  const select = await screen.findByRole("combobox", { name: "소속" });
  await screen.findByRole("option", { name: "다라고" });
  fireEvent.change(select, { target: { value: "t-2" } });
  const row = select.closest("div")?.parentElement
    ?.parentElement as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "저장" }));
  fireEvent.change(await screen.findByLabelText("학년"), {
    target: { value: "고2" },
  });

  goToList();

  expect(
    await screen.findByText("저장하지 않은 변경이 있어요"),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/admin/members/p-kim");
});
