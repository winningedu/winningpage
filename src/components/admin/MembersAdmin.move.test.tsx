// 회원 상세의 소속 저장 분기(사 결정 r4 4번). 스쿨멘토의 학생은 학적까지 옮기는 이동 폼과 API 를 쓰고,
// 학생이 아니거나 위닝이면 기존 fn_admin_set_profile_tenant RPC 를 그대로 쓴다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  studentEnrollment: true,
  rpc: vi.fn(),
}));

vi.mock("@/config/site", () => ({
  site: {
    get features() {
      return { studentEnrollment: hoisted.studentEnrollment };
    },
  },
}));

const PROFILES = [
  {
    id: "p-student",
    name: "김학생",
    member_type: "student",
    tenant_id: "t-1",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p-teacher",
    name: "박교사",
    member_type: "teacher",
    tenant_id: "t-1",
    created_at: "2026-01-01T00:00:00Z",
  },
];
const TENANTS = [
  { id: "t-1", name: "가나고", org_type: "학교", is_catch_all: false },
  { id: "t-2", name: "다라고", org_type: "학교", is_catch_all: false },
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
    from: (table: string) => {
      if (table === "profiles") return chain({ data: PROFILES, error: null });
      if (table === "tenants") return chain({ data: TENANTS, error: null });
      return chain({ data: [], error: null });
    },
    rpc: (...args: unknown[]) => hoisted.rpc(...args),
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

import MembersAdmin from "./MembersAdmin";

const CONFIG = { title: "회원", searchPlaceholder: "검색", columns: [] };

async function openMember(name: string) {
  render(<MembersAdmin config={CONFIG} />);
  fireEvent.click(await screen.findByRole("button", { name: `열기 ${name}` }));
  return await screen.findByDisplayValue("가나고").catch(() => null);
}

function pickTenantAndSave(tenantName: string) {
  const select = screen
    .getAllByRole("combobox")
    .find((el) => within(el).queryByText("소속 없음")) as HTMLSelectElement;
  const option = Array.from(select.options).find(
    (o) => o.textContent === tenantName,
  ) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
  const saveButtons = screen.getAllByRole("button", { name: "저장" });
  // 소속 행의 저장 버튼은 소속 선택 바로 옆에 있다.
  const row = select.closest("div")?.parentElement as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "저장" }));
  return saveButtons;
}

const fetchMock = vi.fn();

beforeEach(() => {
  hoisted.studentEnrollment = true;
  hoisted.rpc.mockReset().mockResolvedValue({ error: null });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("alert", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MembersAdmin 소속 저장", () => {
  test("스쿨멘토에서 학생의 소속을 바꾸면 RPC 대신 이동 폼이 열린다", async () => {
    await openMember("김학생");

    pickTenantAndSave("다라고");

    expect(await screen.findByText("다라고(으)로 옮기기")).toBeInTheDocument();
    expect(hoisted.rpc).not.toHaveBeenCalled();
  });

  test("이동 폼에서 옮기면 move-student API 를 부른다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await openMember("김학생");
    pickTenantAndSave("다라고");
    await screen.findByText("다라고(으)로 옮기기");

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/tenants/move-student");
    expect(JSON.parse(init.body as string)).toMatchObject({
      profileId: "p-student",
      tenantId: "t-2",
      grade: "고2",
    });
    expect(hoisted.rpc).not.toHaveBeenCalled();
  });

  test("스쿨멘토에서 학생을 소속 없음으로 바꾸면 RPC 를 부르지 않고 기타로 옮기라고 안내한다", async () => {
    await openMember("김학생");

    pickTenantAndSave("소속 없음");

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(expect.stringContaining("「기타」")),
    );
    expect(hoisted.rpc).not.toHaveBeenCalled();
    expect(screen.queryByText(/으\)로 옮기기/)).toBeNull();
  });

  test("위닝에서는 학생도 소속 없음으로 바꿀 수 있다", async () => {
    hoisted.studentEnrollment = false;
    await openMember("김학생");

    pickTenantAndSave("소속 없음");

    await waitFor(() =>
      expect(hoisted.rpc).toHaveBeenCalledWith("fn_admin_set_profile_tenant", {
        p_profile_id: "p-student",
        p_tenant_id: null,
      }),
    );
  });

  test("학생이 아니면 스쿨멘토에서도 기존 RPC 를 쓴다", async () => {
    await openMember("박교사");

    pickTenantAndSave("다라고");

    await waitFor(() =>
      expect(hoisted.rpc).toHaveBeenCalledWith("fn_admin_set_profile_tenant", {
        p_profile_id: "p-teacher",
        p_tenant_id: "t-2",
      }),
    );
    expect(screen.queryByText("다라고(으)로 옮기기")).toBeNull();
  });

  test("위닝에서는 학생도 기존 RPC 를 쓴다", async () => {
    hoisted.studentEnrollment = false;
    await openMember("김학생");

    pickTenantAndSave("다라고");

    await waitFor(() =>
      expect(hoisted.rpc).toHaveBeenCalledWith("fn_admin_set_profile_tenant", {
        p_profile_id: "p-student",
        p_tenant_id: "t-2",
      }),
    );
    expect(screen.queryByText("다라고(으)로 옮기기")).toBeNull();
  });
});
