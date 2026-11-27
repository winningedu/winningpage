// MembersAdmin 쓰기 권한. view 권한이면 소속, 학부모 핸드폰 저장과 문자 발송을 감추고 조회는 그대로 둔다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

// 마스킹 해제 게이트는 비밀번호 재확인을 거치므로 테스트에서는 바로 통과시킨다.
vi.mock("@/pages/admin/shared/SensitiveActionGate", () => ({
  useSensitiveActionGate: () => ({
    requestAccess: (options: { onGranted: () => void }) => options.onGranted(),
    gate: null,
  }),
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

import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  id: "p-kim",
  name: "김학생",
  member_type: "student",
  created_at: "2026-01-01T00:00:00Z",
  guardian_phone: "010-0000-0000",
  tenant_id: "t-1",
};

beforeEach(() => {
  routeApi(http.get, {
    "admin/members": { items: [KIM] },
    "admin/members/p-kim": KIM,
    "admin/members/p-kim/links": { items: [] },
    "admin/members/p-kim/messages": { items: [] },
    "admin/tenant-options": {
      items: [
        {
          id: "t-1",
          name: "가나다학원",
          org_type: "academy",
          is_catch_all: false,
        },
      ],
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("MembersAdmin 쓰기 권한", () => {
  test("edit 권한이면 소속 저장과 학부모 핸드폰 저장이 보인다", async () => {
    renderMembers("/admin/members/p-kim", true);
    await screen.findByRole("combobox", { name: "소속" });
    fireEvent.click(screen.getByRole("button", { name: "마스킹 해제" }));
    await screen.findByLabelText("학부모 핸드폰");

    expect(screen.getAllByRole("button", { name: "저장" })).toHaveLength(2);
  });

  test("view 권한이면 소속과 학부모 핸드폰은 값만 보이고 저장은 없다", async () => {
    renderMembers("/admin/members/p-kim", false);
    expect(await screen.findByText("가나다학원")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "마스킹 해제" }));

    expect(await screen.findByText("010-0000-0000")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "소속" })).toBeNull();
    expect(screen.queryByLabelText("학부모 핸드폰")).toBeNull();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
  });

  test("edit 권한이면 문자 발송이 보이고 view 권한이면 발송 이력만 남는다", async () => {
    renderMembers("/admin/members/p-kim/msg", true);
    expect(await screen.findByRole("button", { name: "발송" })).toBeVisible();
    cleanup();

    renderMembers("/admin/members/p-kim/msg", false);
    expect(
      await screen.findByText("발송 이력이 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "발송" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "메시지 내용" })).toBeNull();
  });
});
