// MembersAdmin 상세의 탭 전환과 부분 실패 안내.
// 탭은 role="tab"이고, 상세를 다시 열면 첫 탭으로 돌아오며, 일부 조회가 실패하면
// 서버 안내만 role="alert"로 보인다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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
import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  id: "p-student",
  name: "김학생",
  member_type: "student",
  created_at: "2026-01-01T00:00:00Z",
};

function mockServer(overrides: Record<string, unknown> = {}) {
  routeApi(http.get, {
    "admin/members": { items: [KIM] },
    "admin/members/p-student": KIM,
    "admin/members/p-student/links": { items: [] },
    "admin/members/p-student/orders": { items: [] },
    "admin/tenant-options": { items: [] },
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
});

async function openDetail() {
  renderMembers();
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));
}

test("상세의 탭은 role=tab이고 선택한 탭의 내용만 보인다", async () => {
  await openDetail();

  const profile = await screen.findByRole("tab", { name: "고객 상세 정보" });
  const pay = screen.getByRole("tab", { name: "결제내역" });
  expect(profile).toHaveAttribute("aria-selected", "true");
  expect(pay).toHaveAttribute("aria-selected", "false");
  expect(await screen.findByText("기본 정보")).toBeInTheDocument();

  fireEvent.click(pay);

  expect(await screen.findByText("결제 내역이 없습니다.")).toBeInTheDocument();
  expect(pay).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByText("기본 정보")).not.toBeInTheDocument();
});

test("결제내역 표의 머리글은 scope=col이다", async () => {
  await openDetail();
  fireEvent.click(await screen.findByRole("tab", { name: "결제내역" }));

  const header = await screen.findByRole("columnheader", { name: "주문번호" });
  expect(header).toHaveAttribute("scope", "col");
});

test("상세를 닫았다가 다시 열면 첫 탭으로 돌아온다", async () => {
  await openDetail();
  fireEvent.click(await screen.findByRole("tab", { name: "결제내역" }));
  await screen.findByText("결제 내역이 없습니다.");

  fireEvent.click(screen.getByRole("button", { name: "목록으로" }));
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));

  expect(
    await screen.findByRole("tab", { name: "고객 상세 정보" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("일부 조회가 실패하면 서버 안내가 토스트로, 배너는 role=alert로 보인다", async () => {
  mockServer({
    "admin/members/p-student/orders": new ApiError({
      status: 500,
      code: "INTERNAL_ERROR",
      detail: "주문을 읽지 못했어요.",
    }),
  });
  await openDetail();
  fireEvent.click(await screen.findByRole("tab", { name: "결제내역" }));

  const notice = await screen.findByText(/아래 항목이 비어 있을 수 있습니다/);
  expect(notice).toHaveAttribute("role", "alert");
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="toast-description"]'),
    ).toHaveTextContent("주문을 읽지 못했어요."),
  );
  expect(document.querySelectorAll('[data-slot="toast-title"]')).toHaveLength(
    1,
  );
});
