// 회원 상세의 소속 저장 분기(사 결정 r4 4번). 학생의 기관 변경은 학적까지 옮기는 이동 폼과 API 를 쓰고,
// 학생이 아니면 기존 fn_admin_set_profile_tenant RPC 를 쓴다. 소속 없음은 스쿨멘토에서만 막고(기타로 옮김),
// 위닝은 RPC 에 null 을 넘겨 올해 학적을 DB 가 지운다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  siteKey: "schoolmentor",
}));

vi.mock("@/config/site", () => ({
  site: {
    get key() {
      return hoisted.siteKey;
    },
    features: { studentEnrollment: true },
  },
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
import { memberKeys } from "./api";
import { renderMembers, routeApi } from "./testHelpers";

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

async function openMember(name: string) {
  routeApi(http.get, {
    "admin/members": { items: PROFILES },
    "admin/members/p-student": PROFILES[0],
    "admin/members/p-teacher": PROFILES[1],
    "admin/members/p-student/links": { items: [] },
    "admin/members/p-teacher/links": { items: [] },
    "admin/tenant-options": { items: TENANTS },
  });
  const rendered = renderMembers();
  fireEvent.click(await screen.findByRole("button", { name: `열기 ${name}` }));
  await screen.findByRole("combobox", { name: "소속" });
  await waitFor(() =>
    expect(screen.getByRole("option", { name: "다라고" })).toBeInTheDocument(),
  );
  return rendered;
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
  // NativeSelect가 select를 래퍼 div로 한 번 감싸므로 parentElement를 한 단계 더 올라간다.
  const row = select.closest("div")?.parentElement
    ?.parentElement as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "저장" }));
  return saveButtons;
}

beforeEach(() => {
  hoisted.siteKey = "schoolmentor";
  http.put.mockReset();
  http.post.mockReset();
  vi.stubGlobal("alert", vi.fn());
});

afterEach(() => {
  toast.close();
  cleanup();
  vi.unstubAllGlobals();
});

describe("MembersAdmin 소속 저장", () => {
  test("스쿨멘토에서 학생의 소속을 바꾸면 RPC 대신 이동 폼이 열린다", async () => {
    await openMember("김학생");

    pickTenantAndSave("다라고");

    expect(await screen.findByText("다라고(으)로 옮기기")).toBeInTheDocument();
    expect(http.put).not.toHaveBeenCalled();
  });

  test("이동 폼에서 옮기면 move-student API 를 부른다", async () => {
    http.post.mockReturnValue({
      json: async () => ({
        fromTenantId: "t-1",
        tenantId: "t-2",
        enrollmentId: "e-1",
      }),
    });
    const { queryClient } = await openMember("김학생");
    pickTenantAndSave("다라고");
    await screen.findByText("다라고(으)로 옮기기");

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post).toHaveBeenCalledWith("admin/tenants/move-student", {
      json: expect.objectContaining({
        profileId: "p-student",
        tenantId: "t-2",
        grade: "고2",
      }),
    });
    expect(http.put).not.toHaveBeenCalled();
    expect(await screen.findByText("학생을 옮겼습니다.")).toBeInTheDocument();
    // 옮긴 뒤 상세와 목록을 다시 읽는다.
    await waitFor(() =>
      expect(
        http.get.mock.calls.filter(
          (call) => call[0] === "admin/members/p-student",
        ),
      ).toHaveLength(2),
    );
    expect(queryClient.getQueryState(memberKeys.list)?.isInvalidated).toBe(
      true,
    );
  });

  test("스쿨멘토에서 학생을 소속 없음으로 바꾸면 RPC 를 부르지 않고 기타로 옮기라고 안내한다", async () => {
    await openMember("김학생");

    pickTenantAndSave("소속 없음");

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("「기타」"),
    );
    expect(alert).not.toHaveBeenCalled();
    expect(http.put).not.toHaveBeenCalled();
    expect(screen.queryByText(/으\)로 옮기기/)).toBeNull();
  });

  test("위닝에서는 학생도 소속 없음으로 바꿀 수 있다", async () => {
    hoisted.siteKey = "winning";
    http.put.mockReturnValue({
      json: async () => ({ ...PROFILES[0], tenant_id: null, tenant_name: "" }),
    });
    await openMember("김학생");

    pickTenantAndSave("소속 없음");

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith("admin/members/p-student/tenant", {
        json: { tenantId: null },
      }),
    );
  });

  test("학생이 아니면 스쿨멘토에서도 소속 저장 API 를 쓴다", async () => {
    await openMember("박교사");

    pickTenantAndSave("다라고");

    await waitFor(() =>
      expect(http.put).toHaveBeenCalledWith("admin/members/p-teacher/tenant", {
        json: { tenantId: "t-2" },
      }),
    );
    expect(screen.queryByText("다라고(으)로 옮기기")).toBeNull();
  });

  test("위닝에서도 학생의 기관 변경은 RPC 대신 이동 폼이 열린다", async () => {
    hoisted.siteKey = "winning";
    await openMember("김학생");

    pickTenantAndSave("다라고");

    expect(await screen.findByText("다라고(으)로 옮기기")).toBeInTheDocument();
    expect(http.put).not.toHaveBeenCalled();
  });

  test("저장하면 서버가 돌려준 소속으로 상세와 목록 캐시를 맞추고 성공을 알린다", async () => {
    hoisted.siteKey = "winning";
    http.put.mockReturnValue({
      json: async () => ({
        ...PROFILES[1],
        tenant_id: "t-2",
        tenant_name: "다라고",
      }),
    });
    const { queryClient } = await openMember("박교사");

    pickTenantAndSave("다라고");

    expect(await screen.findByText("소속을 저장했습니다.")).toBeInTheDocument();
    expect(
      queryClient.getQueryData<{ tenant_name?: string }>(
        memberKeys.detail("p-teacher"),
      )?.tenant_name,
    ).toBe("다라고");
    expect(
      queryClient
        .getQueryData<{ items: { id: string; tenant_name?: string }[] }>(
          memberKeys.list,
        )
        ?.items.find((row) => row.id === "p-teacher")?.tenant_name,
    ).toBe("다라고");
  });

  test("저장이 실패하면 서버가 쓴 안내를 그대로 토스트로 보인다", async () => {
    http.put.mockReturnValue({
      json: async () => {
        throw new ApiError({
          status: 409,
          code: "PHONE_TAKEN",
          detail:
            "이 기관에 같은 휴대폰 번호의 회원이 이미 있어요. 확인 후 다시 옮겨 주세요.",
        });
      },
    });
    await openMember("박교사");

    pickTenantAndSave("다라고");

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("이 기관에 같은 휴대폰 번호의 회원이 이미 있어요."),
    );
  });
});
