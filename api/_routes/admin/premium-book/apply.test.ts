// POST /api/admin/premium-book/apply 계약 검증: 변환한 PDF 와 페이지 이미지를 한 번에 적용한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeStorage } from "../../../_lib/admin-uploads/storageTestKit.js";
import {
  argsOf,
  callRoute,
  createAdminFake,
  problemCode,
  type Query,
  type Respond,
} from "../../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import handler from "./apply.js";

const U = (n: number) => `123e4567-e89b-12d3-a456-42661417400${n}`;
const PDF = `${U(0)}.booklet_pdf.booklet.pdf`;
const PAGES = [1, 2, 3].map((n) => `${U(n)}.page_webp.p0${n}.webp`);
const PUBLIC = "https://storage.test/storage/v1/object/public/banners";
const DASHES = /[\u2013\u2014]/;
const MB = 1024 * 1024;

let existing: { id: number; sort_order: number }[];
let fake: ReturnType<typeof createFakeStorage>;
let finalRows: unknown[];

const pagesTable: Respond = (query) => {
  const select = argsOf(query, "select")?.[0];
  if (select === "id, sort_order") return { data: existing, error: null };
  if (select === "*") return { data: finalRows, error: null };
  return { data: null, error: null };
};

type Fake = ReturnType<typeof createAdminFake>;

function setup(level: string | null = "edit", table: Respond = pagesTable) {
  kit.admin = {
    ...createAdminFake({
      permissions: level ? [{ resource_key: "premiumBookPages", level }] : [],
      tables: { premium_book_pages: table },
    }),
    storage: fake.storage,
  };
  return kit.admin as Fake;
}

const post = (body: unknown) => callRoute(handler, { method: "POST", body });
const BODY = { pdf: PDF, pages: PAGES };

const bookQueries = (admin: Fake): Query[] =>
  admin.queries.filter((q) => q.table === "premium_book_pages");
const writes = (admin: Fake) =>
  bookQueries(admin).filter((q) =>
    q.calls.some((c) => ["upsert", "insert", "delete"].includes(c.method)),
  );
const uploads = () => fake.calls.filter((c) => c.op === "upload");
const tmp = (name: string, contentType: string, size = 10) => ({
  name,
  contentType,
  size,
  body: "x",
});

beforeEach(() => {
  existing = [];
  finalRows = [{ id: 1, sort_order: 1, image_url: "u" }];
  fake = createFakeStorage({
    "admin-uploads-tmp": [
      tmp(PDF, "application/pdf"),
      ...PAGES.map((name) => tmp(name, "image/webp")),
    ],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("권한과 입력", () => {
  test("view 권한은 403 이고 아무것도 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post(BODY);
    expect(r.status).toBe(403);
    expect(uploads()).toHaveLength(0);
    expect(writes(admin)).toHaveLength(0);
  });

  test("권한 행이 없으면 403", async () => {
    setup(null);
    expect((await post(BODY)).status).toBe(403);
  });

  test.each([
    ["정의되지 않은 키", { ...BODY, extra: 1 }],
    ["pages 비어 있음", { pdf: PDF, pages: [] }],
    ["pages 101개", { pdf: PDF, pages: Array(101).fill(PAGES[0]) }],
    ["pdf 없음", { pages: PAGES }],
    ["본문이 null", null],
  ])("%s 이면 400 VALIDATION_FAILED", async (_label, body) => {
    const admin = setup();
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(uploads()).toHaveLength(0);
    expect(writes(admin)).toHaveLength(0);
  });

  test("임시 이름 형식이 아니거나 필드 키가 어긋나면 400 이고 아무것도 쓰지 않는다", async () => {
    const admin = setup();
    for (const body of [
      { pdf: "premium-book/booklet.pdf", pages: PAGES },
      { pdf: PAGES[0], pages: PAGES },
      { pdf: PDF, pages: [PDF] },
      { pdf: PDF, pages: [`${U(1)}.image_url.p01.webp`] },
    ]) {
      const r = await post(body);
      expect(r.status).toBe(400);
      expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    }
    expect(uploads()).toHaveLength(0);
    expect(writes(admin)).toHaveLength(0);
  });
});

describe("만료와 저장된 파일 검사", () => {
  test("임시 파일이 하나라도 없으면 409 UPLOAD_EXPIRED 이고 스토리지와 DB 에 쓰지 않는다", async () => {
    fake = createFakeStorage({
      "admin-uploads-tmp": [
        tmp(PDF, "application/pdf"),
        tmp(PAGES[0] as string, "image/webp"),
        tmp(PAGES[1] as string, "image/webp"),
      ],
    });
    const admin = setup();
    const r = await post(BODY);
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("UPLOAD_EXPIRED");
    expect(uploads()).toHaveLength(0);
    expect(writes(admin)).toHaveLength(0);
    expect(fake.names("banners")).toEqual([]);
  });

  test("저장된 형식이 필드 규칙에 어긋나면 400 이고 아무것도 쓰지 않는다", async () => {
    fake.put("admin-uploads-tmp", tmp(PAGES[2] as string, "image/svg+xml"));
    const admin = setup();
    const r = await post(BODY);
    expect(r.status).toBe(400);
    expect(uploads()).toHaveLength(0);
    expect(writes(admin)).toHaveLength(0);
  });

  test("저장된 크기가 한도(50MB)를 넘으면 400 이고 아무것도 쓰지 않는다", async () => {
    fake.put("admin-uploads-tmp", tmp(PDF, "application/pdf", 51 * MB));
    const admin = setup();
    expect((await post(BODY)).status).toBe(400);
    expect(uploads()).toHaveLength(0);
    expect(writes(admin)).toHaveLength(0);
  });
});

describe("적용", () => {
  test("고정 경로에 upsert 로 올리고, 기존 id 는 upsert, 없는 번호는 insert, 넘치는 행은 지운다", async () => {
    existing = [
      { id: 10, sort_order: 1 },
      { id: 11, sort_order: 2 },
      { id: 12, sort_order: 5 },
    ];
    const admin = setup();
    const r = await post(BODY);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: finalRows });

    const options = (contentType: string) => ({
      upsert: true,
      cacheControl: "3600",
      contentType,
    });
    expect(uploads().map((c) => [c.bucket, c.args[0], c.args[1]])).toEqual([
      ["banners", "premium-book/booklet.pdf", options("application/pdf")],
      ["banners", "premium-book/p01.webp", options("image/webp")],
      ["banners", "premium-book/p02.webp", options("image/webp")],
      ["banners", "premium-book/p03.webp", options("image/webp")],
    ]);

    const queries = bookQueries(admin);
    const upsert = queries.find((q) => argsOf(q, "upsert")) as Query;
    expect(argsOf(upsert, "upsert")).toEqual([
      [
        { id: 10, sort_order: 1, image_url: `${PUBLIC}/premium-book/p01.webp` },
        { id: 11, sort_order: 2, image_url: `${PUBLIC}/premium-book/p02.webp` },
      ],
    ]);
    const insert = queries.find((q) => argsOf(q, "insert")) as Query;
    expect(argsOf(insert, "insert")).toEqual([
      [{ sort_order: 3, image_url: `${PUBLIC}/premium-book/p03.webp` }],
    ]);
    const del = queries.find((q) => argsOf(q, "delete")) as Query;
    expect(argsOf(del, "in")).toEqual(["id", [12]]);
    const last = queries[queries.length - 1] as Query;
    expect(argsOf(last, "order")).toEqual(["sort_order", { ascending: true }]);
  });

  test("끝나면 임시 파일을 지우고, 지우기가 실패해도 200 이다", async () => {
    setup();
    expect((await post(BODY)).status).toBe(200);
    expect(fake.names("admin-uploads-tmp")).toEqual([]);

    fake.failures.push({ op: "remove" });
    fake.put("admin-uploads-tmp", tmp(PDF, "application/pdf"));
    for (const name of PAGES)
      fake.put("admin-uploads-tmp", tmp(name, "image/webp"));
    setup();
    expect((await post(BODY)).status).toBe(200);
  });

  test("sort_order 가 겹친 행이 있으면 409 DUPLICATE_SORT_ORDER 이고 DB 를 바꾸지 않는다", async () => {
    existing = [
      { id: 10, sort_order: 2 },
      { id: 11, sort_order: 2 },
    ];
    const admin = setup();
    const r = await post(BODY);
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("DUPLICATE_SORT_ORDER");
    const detail = (r.body as { detail: string }).detail;
    expect(detail).toContain("sort_order 2 중복");
    expect(detail).not.toMatch(DASHES);
    expect(writes(admin)).toHaveLength(0);
  });

  test("스토리지 올리기가 실패하면 500 이고 DB 를 바꾸지 않는다", async () => {
    fake.failures.push({ op: "upload" });
    const admin = setup();
    const r = await post(BODY);
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
    expect(bookQueries(admin)).toHaveLength(0);
  });

  test("DB 쓰기가 실패하면 500 이고 서버 오류 원문을 싣지 않는다", async () => {
    setup("edit", (query) =>
      argsOf(query, "insert")
        ? { data: null, error: { message: "secret db detail" } }
        : pagesTable(query),
    );
    const r = await post(BODY);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret db detail");
  });
});
