// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

import { ApiError } from "@/lib/http/client";
import {
  createTenant,
  fetchSchoolAdmins,
  fetchServiceSettings,
  fetchTenantDetail,
  fetchTenants,
  issueSchoolAdmin,
  patchTenant,
  putServiceSetting,
} from "./api";

// Node 의 Request 는 상대 URL 을 해석하지 못해서 브라우저처럼 문서 주소 기준으로 풀어 준다.
function stubBrowserRequest() {
  const NodeRequest = Request;
  vi.stubGlobal(
    "Request",
    class extends NodeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(
          typeof input === "string" ? new URL(input, location.href) : input,
          init,
        );
      }
    },
  );
}

// 요청 본문은 fetch 가 읽고 나면 다시 읽을 수 없어서 호출 시점에 복사해 둔다.
const bodies = new WeakMap<Request, string>();

function stubFetch(body: unknown, status = 200) {
  const spy = vi.fn(async (request: Request) => {
    bodies.set(request, await request.clone().text());
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type":
          status >= 400 ? "application/problem+json" : "application/json",
      },
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

async function sent(spy: ReturnType<typeof stubFetch>) {
  const request = spy.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error("fetch가 호출되지 않음");
  const url = new URL(request.url);
  const text = bodies.get(request);
  return {
    method: request.method,
    path: url.pathname + url.search,
    body: text ? JSON.parse(text) : undefined,
  };
}

const TENANT = {
  id: "tenant-1",
  code: "ABCD2345",
  name: "한빛고",
  region: "서울",
  org_type: "학교",
  tier: "B",
  created_at: "2026-09-01T00:00:00Z",
};

beforeEach(() => {
  stubBrowserRequest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("기관 목록과 등록", () => {
  test("목록은 GET admin/tenants 이고 items 와 graceDays 를 돌려준다", async () => {
    const spy = stubFetch({ items: [TENANT], graceDays: 30 });

    const result = await fetchTenants();

    expect(await sent(spy)).toMatchObject({
      method: "GET",
      path: "/api/admin/tenants",
    });
    expect(result.items).toHaveLength(1);
    expect(result.graceDays).toBe(30);
  });

  test("목록 응답이 계약과 다르면 SchemaValidationError 로 던진다", async () => {
    stubFetch({ items: [{ id: 1 }], graceDays: null });
    await expect(fetchTenants()).rejects.toMatchObject({
      name: "SchemaValidationError",
    });
  });

  test("등록은 POST admin/tenants 에 네 값을 싣고 만든 행을 돌려준다", async () => {
    const spy = stubFetch(TENANT, 201);

    const created = await createTenant({
      name: "한빛고",
      region: "서울",
      org_type: "학교",
      tier: "B",
    });

    expect(await sent(spy)).toMatchObject({
      method: "POST",
      path: "/api/admin/tenants",
      body: { name: "한빛고", region: "서울", org_type: "학교", tier: "B" },
    });
    expect(created.id).toBe("tenant-1");
  });

  test("등록 실패는 problem 바디의 code 와 detail 을 가진 ApiError 다", async () => {
    stubFetch(
      {
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        detail: "최고 관리자만 소속을 등록할 수 있습니다.",
        code: "NOT_SUPER_ADMIN",
      },
      403,
    );
    const error = await createTenant({
      name: "a",
      region: "서울",
      org_type: "기관",
      tier: "W",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: "NOT_SUPER_ADMIN",
      detail: "최고 관리자만 소속을 등록할 수 있습니다.",
    });
  });
});

describe("기관 상세", () => {
  const DETAIL = {
    id: "tenant-1",
    code: "ABCD2345",
    name: "한빛고",
    region: "서울",
    org_type: "학교",
    tier: "B",
    contract_start_date: null,
    contract_end_date: null,
    term_months: 6,
    mou_status: null,
    grace_ends_on: null,
    trial_start_date: null,
    trial_end_date: null,
    contact_name: null,
    contact_phone: null,
    contact_mobile: null,
    contact_email: null,
    address: null,
    main_phone: null,
    homepage: null,
    is_catch_all: false,
    updated_at: "2026-09-01T00:00:00Z",
  };

  test("상세는 GET admin/tenants/:id 이고 id 는 인코딩한다", async () => {
    const spy = stubFetch(DETAIL);

    const detail = await fetchTenantDetail("tenant-1");
    await fetchTenantDetail("a/b");

    expect(await sent(spy)).toMatchObject({
      method: "GET",
      path: "/api/admin/tenants/tenant-1",
    });
    expect(String((spy.mock.calls[1] ?? [])[0]?.url)).toContain(
      "/api/admin/tenants/a%2Fb",
    );
    expect(detail.term_months).toBe(6);
  });

  test("수정은 PATCH :id 에 updatedAt, values 만 싣고(id 는 경로) 새 updated_at 을 돌려준다", async () => {
    const spy = stubFetch({
      id: "tenant-1",
      updated_at: "2026-09-02T00:00:00Z",
    });
    const values = { name: "새이름" } as Parameters<
      typeof patchTenant
    >[0]["values"];

    const saved = await patchTenant({
      id: "tenant-1",
      updatedAt: "2026-09-01T00:00:00Z",
      values,
    });

    expect(await sent(spy)).toMatchObject({
      method: "PATCH",
      path: "/api/admin/tenants/tenant-1",
      body: {
        updatedAt: "2026-09-01T00:00:00Z",
        values: { name: "새이름" },
      },
    });
    expect((await sent(spy)).body).not.toHaveProperty("id");
    expect(saved.updated_at).toBe("2026-09-02T00:00:00Z");
  });
});

describe("서비스 설정", () => {
  test("조회는 GET :id/service-settings 이고 items 와 defaults 를 돌려준다", async () => {
    const spy = stubFetch({
      items: [
        {
          program_key: "diagnose",
          enabled: true,
          starts_on: null,
          ends_on: null,
          monthly_limit: 3,
          term_limit: null,
        },
      ],
      defaults: { diagnose: { monthly_limit: 1 } },
    });

    const result = await fetchServiceSettings("tenant-1");

    expect(await sent(spy)).toMatchObject({
      method: "GET",
      path: "/api/admin/tenants/tenant-1/service-settings",
    });
    expect(result.items[0]?.monthly_limit).toBe(3);
    expect(result.defaults.diagnose?.monthly_limit).toBe(1);
  });

  test("저장은 PUT :id/service-settings 이고 본문에 tenant_id 와 updated_by 가 없다", async () => {
    const spy = stubFetch({ program_key: "diagnose" });
    const row = {
      tenant_id: "tenant-1",
      program_key: "diagnose",
      enabled: true,
      starts_on: null,
      ends_on: null,
      monthly_limit: 3,
      term_limit: null,
      updated_at: "2026-09-01T00:00:00.000Z",
    };

    await putServiceSetting(row);

    const request = await sent(spy);
    expect(request).toMatchObject({
      method: "PUT",
      path: "/api/admin/tenants/tenant-1/service-settings",
    });
    expect(request.body).not.toHaveProperty("tenant_id");
    expect(request.body).not.toHaveProperty("updated_by");
    expect(request.body).toMatchObject({
      program_key: "diagnose",
      monthly_limit: 3,
    });
  });
});

describe("전체 관리자", () => {
  test("목록은 tenantId query 이고 address 와 items 를 돌려준다", async () => {
    const spy = stubFetch({ address: "서울시 중구 1", items: [] });

    const result = await fetchSchoolAdmins("tenant-1");

    expect(await sent(spy)).toMatchObject({
      method: "GET",
      path: "/api/admin/tenants/school-admins?tenantId=tenant-1",
    });
    expect(result).toEqual({ address: "서울시 중구 1", items: [] });
  });

  test("발급은 POST school-admin 이고 loginId 와 임시 비밀번호를 돌려준다", async () => {
    const spy = stubFetch({ loginId: "ABCD", tempPassword: "pw" });

    const issued = await issueSchoolAdmin({
      tenantId: "tenant-1",
      name: "박관리",
      phone: "01099998888",
    });

    expect(await sent(spy)).toMatchObject({
      method: "POST",
      path: "/api/admin/tenants/school-admin",
      body: { tenantId: "tenant-1", name: "박관리", phone: "01099998888" },
    });
    expect(issued).toEqual({ loginId: "ABCD", tempPassword: "pw" });
  });
});
