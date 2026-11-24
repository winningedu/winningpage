// GET, PATCH, DELETE /api/admin/premium-book/pages/:id 계약 검증.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../../../_lib/adminRoute.testkit.js";
import { createFakeStorage } from "../../../../_lib/admin-uploads/storageTestKit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./[id].js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const SUPA = "https://storage.test/storage/v1/object";
const NAME = `${UUID}.image_url.hero.png`;
const tmpUrl = `${SUPA}/sign/admin-uploads-tmp/${NAME}?token=abc`;
const pubUrl = `${SUPA}/public/banners/premium-book/${UUID}-hero.png`;
const ROW = {
  id: 7,
  sort_order: 2,
  image_url: `${SUPA}/public/banners/premium-book/p02.webp`,
};

let pages: Respond;
let fake: ReturnType<typeof createFakeStorage>;

function setup(level: string | null = "view") {
  kit.admin = {
    ...createAdminFake({
      permissions: level ? [{ resource_key: "premiumBookPages", level }] : [],
      tables: { premium_book_pages: (query) => pages(query) },
    }),
    storage: fake.storage,
  };
  return kit.admin as ReturnType<typeof createAdminFake>;
}

const tables = (admin: ReturnType<typeof createAdminFake>) =>
  admin.queries.map((q) => q.table);

beforeEach(() => {
  pages = () => ({ data: ROW, error: null });
  fake = createFakeStorage({
    "admin-uploads-tmp": [NAME],
    banners: ["premium-book/p02.webp"],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const query = { id: "7" };

describe("GET /api/admin/premium-book/pages/:id", () => {
  const get = (q: Record<string, string> = query) =>
    callRoute(handler, { query: q });

  test("view 권한이면 id 의 행을 돌려준다", async () => {
    const admin = setup("view");
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body).toEqual(ROW);
    const q = firstQuery(admin, "premium_book_pages");
    expect(argsOf(q, "select")).toEqual(["*"]);
    expect(argsOf(q, "eq")).toEqual(["id", 7]);
  });

  test("없는 행은 404 NOT_FOUND", async () => {
    pages = () => ({ data: null, error: null });
    setup("view");
    const r = await get();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test.each([
    ["id 없음", {}],
    ["숫자가 아닌 id", { id: "abc" }],
    ["0", { id: "0" }],
    ["음수", { id: "-1" }],
    ["소수", { id: "1.5" }],
  ])("%s 이면 400 VALIDATION_FAILED", async (_label, q) => {
    const admin = setup("view");
    const r = await get(q);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("권한 행이 없으면 403", async () => {
    setup(null);
    expect((await get()).status).toBe(403);
  });

  test("조회 오류는 500", async () => {
    pages = () => ({ data: null, error: { message: "boom" } });
    setup("view");
    expect((await get()).status).toBe(500);
  });
});

describe("PATCH /api/admin/premium-book/pages/:id", () => {
  const BODY = { sort_order: 5, image_url: "https://x.test/a.png" };
  const patch = (body: unknown = BODY, q = query) =>
    callRoute(handler, { method: "PATCH", query: q, body });

  test("view 권한은 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await patch();
    expect(r.status).toBe(403);
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("edit 권한이면 id 의 행을 두 컬럼만 고치고 행을 돌려준다", async () => {
    const admin = setup("edit");
    const r = await patch();
    expect(r.status).toBe(200);
    const q = firstQuery(admin, "premium_book_pages");
    expect(argsOf(q, "update")).toEqual([BODY]);
    expect(argsOf(q, "eq")).toEqual(["id", 7]);
    expect(argsOf(q, "select")).toEqual(["*"]);
  });

  test("임시 읽기 URL 은 banners 공개 URL 로 바꿔 고친다", async () => {
    const admin = setup("edit");
    await patch({ sort_order: 2, image_url: tmpUrl });
    expect(argsOf(firstQuery(admin, "premium_book_pages"), "update")).toEqual([
      { sort_order: 2, image_url: pubUrl },
    ]);
  });

  test("임시 파일이 사라졌으면 409 UPLOAD_EXPIRED 이고 쓰지 않는다", async () => {
    fake = createFakeStorage();
    const admin = setup("edit");
    const r = await patch({ sort_order: 2, image_url: tmpUrl });
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("UPLOAD_EXPIRED");
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("고칠 행이 없으면 404 NOT_FOUND", async () => {
    pages = () => ({ data: null, error: null });
    setup("edit");
    const r = await patch();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
  });

  test.each([
    ["정의되지 않은 키", { ...BODY, created_at: "x" }],
    ["image_url 없음", { sort_order: 1 }],
    ["본문이 null", null],
  ])("%s 이면 400 이고 쓰지 않는다", async (_label, body) => {
    const admin = setup("edit");
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("id 가 양의 정수가 아니면 400", async () => {
    setup("edit");
    expect((await patch(BODY, { id: "abc" })).status).toBe(400);
  });

  test("DB 오류는 500", async () => {
    pages = () => ({ data: null, error: { message: "boom" } });
    setup("edit");
    expect((await patch()).status).toBe(500);
  });
});

describe("DELETE /api/admin/premium-book/pages/:id", () => {
  const del = (q = query) => callRoute(handler, { method: "DELETE", query: q });

  test("view 권한은 403 이고 지우지 않는다", async () => {
    const admin = setup("view");
    expect((await del()).status).toBe(403);
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("edit 권한이면 행을 지우고 204, 그 이미지 파일도 banners 에서 지운다", async () => {
    pages = () => ({ data: [ROW], error: null });
    const admin = setup("edit");
    const r = await del();
    expect(r.status).toBe(204);
    const q = firstQuery(admin, "premium_book_pages");
    expect(argsOf(q, "delete")).toEqual([]);
    expect(argsOf(q, "eq")).toEqual(["id", 7]);
    expect(fake.names("banners")).toEqual([]);
  });

  test("지운 행이 없으면 404 이고 파일은 건드리지 않는다", async () => {
    pages = () => ({ data: [], error: null });
    setup("edit");
    const r = await del();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("NOT_FOUND");
    expect(fake.names("banners")).toEqual(["premium-book/p02.webp"]);
  });

  test("banners 공개 URL 이 아니거나 premium-book/ 밖이면 파일을 지우지 않고 204", async () => {
    fake.put("banners", "landing/hero/a.png");
    pages = () => ({
      data: [
        { ...ROW, image_url: `${SUPA}/public/banners/landing/hero/a.png` },
      ],
      error: null,
    });
    setup("edit");
    expect((await del()).status).toBe(204);
    expect(fake.calls.filter((c) => c.op === "remove")).toEqual([]);
    pages = () => ({
      data: [{ ...ROW, image_url: "https://example.com/a.png" }],
      error: null,
    });
    setup("edit");
    expect((await del()).status).toBe(204);
    expect(fake.calls.filter((c) => c.op === "remove")).toEqual([]);
  });

  test("파일 삭제가 실패해도 행은 이미 지워져 204 이고 경고만 남긴다", async () => {
    fake.failures.push({ op: "remove" });
    pages = () => ({ data: [ROW], error: null });
    setup("edit");
    const r = await del();
    expect(r.status).toBe(204);
    expect(console.warn).toHaveBeenCalled();
  });

  test("id 가 양의 정수가 아니면 400", async () => {
    const admin = setup("edit");
    expect((await del({ id: "x" })).status).toBe(400);
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("DB 오류는 500", async () => {
    pages = () => ({ data: null, error: { message: "boom" } });
    setup("edit");
    expect((await del()).status).toBe(500);
  });
});
