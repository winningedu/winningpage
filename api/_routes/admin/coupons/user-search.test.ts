// GET /api/admin/coupons/user-search?q= 계약 검증. 쿠폰 발급 대상을 이메일이나 이름으로 찾는다(전체 프로필, 20건까지).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  problemCode,
  type Respond,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./user-search.js";

const FOUND = [{ id: "u1", name: "홍길동", email: "a@example.com" }];

let profiles: Respond = () => ({ data: FOUND, error: null });

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "coupons", level }] : [],
    tables: { profiles: (query) => profiles(query) },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const search = (q: string | undefined) =>
  callRoute(handler, { query: q === undefined ? {} : { q } });

// 관리자 판정(select("role"))이 아닌 검색 쿼리만 고른다.
const searchQueries = (admin: ReturnType<typeof createAdminFake>) =>
  admin.queries.filter(
    (q) => q.table === "profiles" && argsOf(q, "or") !== undefined,
  );

beforeEach(() => {
  profiles = () => ({ data: FOUND, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/coupons/user-search", () => {
  test("edit 권한이면 이메일이나 이름이 맞는 프로필을 20건까지 돌려준다", async () => {
    const admin = setup();
    const r = await search("홍길");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: FOUND });
    const [query] = searchQueries(admin);
    expect(query && argsOf(query, "select")).toEqual(["id, name, email"]);
    expect(query && argsOf(query, "or")).toEqual([
      "email.ilike.%홍길%,name.ilike.%홍길%",
    ]);
    expect(query && argsOf(query, "limit")).toEqual([20]);
  });

  test("or 필터 문법을 깨는 문자를 걷어내고 앞뒤 공백을 자른다", async () => {
    const admin = setup();
    await search(' 홍,(길)*"동\\ ');
    const [query] = searchQueries(admin);
    expect(query && argsOf(query, "or")).toEqual([
      "email.ilike.%홍길동%,name.ilike.%홍길동%",
    ]);
  });

  test("LIKE 와일드카드 % 와 _ 는 백슬래시로 이스케이프해 글자 그대로 찾는다", async () => {
    const admin = setup();
    await search("50%_off");
    const [query] = searchQueries(admin);
    expect(query && argsOf(query, "or")).toEqual([
      "email.ilike.%50\\%\\_off%,name.ilike.%50\\%\\_off%",
    ]);
  });

  test("걷어내고 남은 것이 없으면 쿼리 없이 빈 목록이다", async () => {
    const admin = setup();
    const r = await search(',()*" ');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [] });
    expect(searchQueries(admin)).toHaveLength(0);
  });

  test.each([
    ["q 없음", undefined],
    ["빈 q", ""],
    ["101자 q", "a".repeat(101)],
  ])("%s 이면 400 VALIDATION_FAILED 다", async (_label, q) => {
    const admin = setup();
    const r = await search(q);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(searchQueries(admin)).toHaveLength(0);
  });

  test("100자 q 는 통과한다", async () => {
    setup();
    const r = await search("a".repeat(100));
    expect(r.status).toBe(200);
  });

  test("view 권한으로는 403 FORBIDDEN 이고 검색하지 않는다", async () => {
    const admin = setup("view");
    const r = await search("홍");
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(searchQueries(admin)).toHaveLength(0);
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await search("홍");
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
  });

  test("GET 이외는 405 다", async () => {
    setup("edit");
    const r = await callRoute(handler, { method: "POST" });
    expect(r.status).toBe(405);
  });

  test("조회 오류는 500 INTERNAL_ERROR 다", async () => {
    profiles = (query) =>
      argsOf(query, "or")
        ? { data: null, error: { message: "boom" } }
        : { data: null, error: null };
    setup();
    const r = await search("홍");
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});
