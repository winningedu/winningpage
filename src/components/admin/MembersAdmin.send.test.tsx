// MembersAdmin 문자 발송 실패 안내. 우리 서버가 관리자용으로 쓴 detail 은 그대로 보이고,
// 우리 JSON 이 아닌 응답 원문(HTTP 상태, HTML 등)은 일반 안내로 대체된다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const PROFILES = [
  {
    id: "p-student",
    name: "김학생",
    member_type: "student",
    created_at: "2026-01-01T00:00:00Z",
  },
];

function chain(result: unknown) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) =>
      chain({ data: table === "profiles" ? PROFILES : [], error: null }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
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

import { Toaster } from "@/components/ui/toast";
import MembersAdmin from "./MembersAdmin";

const CONFIG = { title: "회원", searchPlaceholder: "검색", columns: [] };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function sendWith(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  render(
    <>
      <MembersAdmin config={CONFIG} />
      <Toaster />
    </>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "열기 김학생" }));
  fireEvent.click(await screen.findByRole("tab", { name: /알림톡.문자/ }));
  fireEvent.change(await screen.findByRole("textbox"), {
    target: { value: "안내드립니다" },
  });
  fireEvent.click(screen.getByRole("button", { name: "발송" }));
}

const description = () =>
  document.querySelector('[data-slot="toast-description"]');

test("발송이 서버 detail 과 함께 실패하면 그 detail 을 토스트로 보인다", async () => {
  await sendWith(
    new Response(
      JSON.stringify({ detail: "수신 번호가 등록되지 않았습니다." }),
      {
        status: 400,
      },
    ),
  );

  await waitFor(() => {
    expect(
      document.querySelector('[data-slot="toast-title"]'),
    ).toHaveTextContent("발송 실패");
    expect(description()).toHaveTextContent("수신 번호가 등록되지 않았습니다.");
  });
});

test("발송 응답이 우리 JSON 이 아니면 본문 원문 없이 일반 안내를 보인다", async () => {
  await sendWith(
    new Response("<html>Bad Gateway upstream-host-7</html>", { status: 502 }),
  );

  await waitFor(() => {
    expect(description()).toHaveTextContent("요청을 처리하지 못했습니다.");
  });
  expect(document.body.textContent).not.toContain("upstream-host-7");
  expect(document.body.textContent).not.toContain("HTTP 502");
});
