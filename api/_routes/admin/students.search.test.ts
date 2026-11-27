import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  callsOf,
  createAdminFake,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

const handler = { app, path: "/api/admin/students/search" };

const SECTIONS = [
  "growthReports",
  "inquirySessions",
  "selfevalSessions",
  "serviceCreditAdjust",
] as const;

let profiles: Respond;

function setup(permissions: { resource_key: string; level: string }[]) {
  kit.admin = createAdminFake({
    permissions,
    tables: { profiles: (q) => profiles(q) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const view = (key: string) => [{ resource_key: key, level: "view" }];

const search = (query: Record<string, string>) => callRoute(handler, { query });

const searchQueries = (admin: { queries: { table: string }[] }) =>
  (admin as ReturnType<typeof createAdminFake>).queries.filter(
    (q) => q.table === "profiles" && argsOf(q, "limit"),
  );

beforeEach(() => {
  profiles = () => ({
    data: [
      { id: "s-1", name: "김하늘", email: "a@b.c", role: "user" },
      { id: "a-1", name: "관리자", email: "adm@b.c", role: "admin" },
    ],
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/students/search", () => {
  test.each(SECTIONS)(
    "%s 의 view 권한이면 학생과 관리자를 isAdmin 으로 돌려준다",
    async (section) => {
      const admin = setup(view(section));
      const r = await search({ q: "김", section });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        items: [
          { id: "s-1", name: "김하늘", email: "a@b.c", isAdmin: false },
          { id: "a-1", name: "관리자", email: "adm@b.c", isAdmin: true },
        ],
      });
      const [query] = searchQueries(admin);
      expect(argsOf(query as never, "select")).toEqual([
        "id, name, email, role",
      ]);
      expect(callsOf(query as never, "or").map((c) => c.args)).toEqual([
        ["member_type.eq.student,role.eq.admin"],
        ["email.ilike.%김%,name.ilike.%김%"],
      ]);
      expect(argsOf(query as never, "limit")).toEqual([20]);
    },
  );

  test("or 필터를 깨는 문자는 걷고 와일드카드는 이스케이프한다", async () => {
    const admin = setup(view("growthReports"));
    await search({ q: ' a,(b)*"\\c_%d ', section: "growthReports" });
    const [query] = searchQueries(admin);
    expect(callsOf(query as never, "or")[1]?.args).toEqual([
      "email.ilike.%abc\\_\\%d%,name.ilike.%abc\\_\\%d%",
    ]);
  });

  test("걷고 나면 빈 검색어는 DB 를 읽지 않고 빈 목록을 돌려준다", async () => {
    const admin = setup(view("growthReports"));
    const r = await search({ q: " ,() ", section: "growthReports" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [] });
    expect(searchQueries(admin)).toEqual([]);
  });

  test.each([
    ["모르는 섹션", { q: "김", section: "coupons" }],
    ["섹션 없음", { q: "김" }],
  ])(
    "%s 이면 권한 조회 없이 400 VALIDATION_FAILED 다",
    async (_label, query) => {
      const admin = setup(view("coupons"));
      const r = await search(query);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
      expect(admin.rpcCalls.map((c) => c.name)).not.toContain(
        "fn_admin_effective_permissions",
      );
      expect(searchQueries(admin)).toEqual([]);
    },
  );

  test.each([
    ["q 없음", { section: "growthReports" }],
    ["빈 q", { q: "", section: "growthReports" }],
    ["101자 q", { q: "가".repeat(101), section: "growthReports" }],
  ])("%s 이면 400 VALIDATION_FAILED 다", async (_label, query) => {
    const admin = setup(view("growthReports"));
    const r = await search(query);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(searchQueries(admin)).toEqual([]);
  });

  test("요청한 섹션의 권한이 없으면 다른 섹션 권한이 있어도 403 FORBIDDEN 이다", async () => {
    const admin = setup(view("growthReports"));
    const r = await search({ q: "김", section: "inquirySessions" });
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(searchQueries(admin)).toEqual([]);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup([]);
    const r = await search({ q: "김", section: "serviceCreditAdjust" });
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("POST 는 405 METHOD_NOT_ALLOWED 다", async () => {
    setup(view("growthReports"));
    const r = await callRoute(handler, { method: "POST" });
    expect(r.status).toBe(405);
    expect(r.headers.allow).toBe("GET, HEAD");
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
  });

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    setup(view("growthReports"));
    profiles = (q) =>
      argsOf(q, "limit")
        ? { data: null, error: { message: "boom" } }
        : { data: [], error: null };
    const r = await search({ q: "김", section: "growthReports" });
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
