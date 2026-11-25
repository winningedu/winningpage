// GET, POST /api/admin/premium-book/pages 계약 검증: 책자 페이지 목록과 등록.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeStorage } from "../../../_lib/admin-uploads/storageTestKit.js";
import {
  argsOf,
  callRoute,
  createAdminFake,
  firstQuery,
  problemCode,
  type Respond,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./pages.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const SUPA = "https://storage.test/storage/v1/object";
const NAME = `${UUID}.image_url.hero.png`;
const tmpUrl = `${SUPA}/sign/admin-uploads-tmp/${NAME}?token=abc`;
const pubUrl = `${SUPA}/public/banners/premium-book/${UUID}-hero.png`;

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
  pages = () => ({
    data: [{ id: 1, sort_order: 1, image_url: "a" }],
    error: null,
  });
  fake = createFakeStorage({ "admin-uploads-tmp": [NAME] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/premium-book/pages", () => {
  test("view 권한이면 sort_order 오름차순 전체를 { items } 로 돌려준다", async () => {
    const admin = setup("view");
    const r = await callRoute(handler);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      items: [{ id: 1, sort_order: 1, image_url: "a" }],
    });
    const query = firstQuery(admin, "premium_book_pages");
    expect(argsOf(query, "select")).toEqual(["*"]);
    expect(argsOf(query, "order")).toEqual(["sort_order", { ascending: true }]);
  });

  test("권한 행이 없으면 403 FORBIDDEN", async () => {
    const admin = setup(null);
    const r = await callRoute(handler);
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("조회 오류는 500 INTERNAL_ERROR", async () => {
    pages = () => ({ data: null, error: { message: "boom" } });
    setup("view");
    const r = await callRoute(handler);
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });
});

describe("POST /api/admin/premium-book/pages", () => {
  const post = (body: unknown) => callRoute(handler, { method: "POST", body });
  const BODY = { sort_order: 3, image_url: "https://x.test/a.png" };

  beforeEach(() => {
    pages = () => ({ data: { id: 9, ...BODY }, error: null });
  });

  test("view 권한은 403 이고 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post(BODY);
    expect(r.status).toBe(403);
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("edit 권한이면 두 컬럼만 넣고 201 로 행을 돌려준다", async () => {
    const admin = setup("edit");
    const r = await post(BODY);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ id: 9, ...BODY });
    const query = firstQuery(admin, "premium_book_pages");
    expect(argsOf(query, "insert")).toEqual([BODY]);
    expect(argsOf(query, "select")).toEqual(["*"]);
  });

  test("image_url 의 임시 읽기 URL 은 banners 공개 URL 로 바꿔 넣는다", async () => {
    const admin = setup("edit");
    const r = await post({ sort_order: 1, image_url: tmpUrl });
    expect(r.status).toBe(201);
    const query = firstQuery(admin, "premium_book_pages");
    expect(argsOf(query, "insert")).toEqual([
      { sort_order: 1, image_url: pubUrl },
    ]);
    expect(fake.names("banners")).toEqual([`premium-book/${UUID}-hero.png`]);
  });

  test("임시 파일이 사라졌으면 409 UPLOAD_EXPIRED 이고 쓰지 않는다", async () => {
    fake = createFakeStorage();
    const admin = setup("edit");
    const r = await post({ sort_order: 1, image_url: tmpUrl });
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("UPLOAD_EXPIRED");
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("image_url 필드가 아닌 키로 올린 임시 URL 은 400 이고 쓰지 않는다", async () => {
    const other = `${UUID}.booklet_pdf.a.pdf`;
    fake.put("admin-uploads-tmp", other);
    const admin = setup("edit");
    const r = await post({
      sort_order: 1,
      image_url: `${SUPA}/sign/admin-uploads-tmp/${other}?token=a`,
    });
    expect(r.status).toBe(400);
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test.each([
    ["정의되지 않은 키", { ...BODY, id: 1 }],
    ["sort_order 가 정수가 아님", { ...BODY, sort_order: 1.5 }],
    ["sort_order 가 문자열", { ...BODY, sort_order: "1" }],
    ["image_url 없음", { sort_order: 1 }],
    ["본문이 null", null],
  ])("%s 이면 400 VALIDATION_FAILED 이고 쓰지 않는다", async (_label, body) => {
    const admin = setup("edit");
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(tables(admin)).not.toContain("premium_book_pages");
  });

  test("DB 오류는 500 INTERNAL_ERROR", async () => {
    pages = () => ({ data: null, error: { message: "boom" } });
    setup("edit");
    const r = await post(BODY);
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
  });

  test("PUT 은 405", async () => {
    setup("edit");
    const r = await callRoute(handler, { method: "PUT", body: BODY });
    expect(r.status).toBe(405);
  });
});
