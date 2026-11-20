// AdminMembersAdmin 초대 실패 안내. 우리 서버가 관리자용으로 쓴 detail 은 그대로 보이고,
// 우리 JSON 이 아닌 응답 원문(HTTP 상태, HTML 등)은 일반 안내로 대체된다.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => {
  type Result = { data: unknown; error: unknown };
  const query = (result: Result): Promise<Result> =>
    Object.assign(Promise.resolve(result), {
      select: () => query(result),
      order: () => query(result),
      eq: () => query(result),
    });
  const tables: Record<string, unknown[]> = {
    admin_member_directory: [],
    admin_roles: [{ id: "role-1", name: "운영자", is_super: false }],
    admin_resources: [],
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => query({ data: tables[table] ?? [], error: null }),
      }),
    },
  };
});

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
}));

import { Toaster } from "@/components/ui/toast";
import AdminMembersAdmin from "./AdminMembersAdmin";

const CONFIG = { title: "관리자 계정", searchPlaceholder: "검색" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function submitInviteWith(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  render(
    <>
      <AdminMembersAdmin config={CONFIG} />
      <Toaster />
    </>,
  );
  fireEvent.click(await screen.findByText("관리자 초대"));
  fireEvent.change(await screen.findByLabelText("이름"), {
    target: { value: "김관리" },
  });
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "kim@example.com" },
  });
  fireEvent.click(screen.getByText("초대 메일 보내기"));
}

const description = () =>
  document.querySelector('[data-slot="toast-description"]');

test("초대가 서버 detail 과 함께 실패하면 그 detail 을 토스트로 보인다", async () => {
  await submitInviteWith(
    new Response(JSON.stringify({ detail: "이미 등록된 관리자입니다." }), {
      status: 409,
    }),
  );

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("초대 실패");
    expect(description()).toHaveTextContent("이미 등록된 관리자입니다.");
  });
});

test("초대 응답이 우리 JSON 이 아니면 본문 원문 없이 일반 안내를 보인다", async () => {
  await submitInviteWith(
    new Response("<html>Bad Gateway upstream-host-7</html>", { status: 502 }),
  );

  await waitFor(() => {
    expect(description()).toHaveTextContent("요청을 처리하지 못했습니다.");
  });
  expect(document.body.textContent).not.toContain("upstream-host-7");
  expect(document.body.textContent).not.toContain("HTTP 502");
});
