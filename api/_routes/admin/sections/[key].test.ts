// GET, POST /api/admin/sections/:key 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { SECTIONS } from "../../../_lib/admin-sections/registry.js";
import {
  createSectionAdmin,
  createSectionDb,
  type SectionDb,
  seedAdmin,
} from "../../../_lib/admin-sections/sectionTestKit.js";
import { createFakeStorage } from "../../../_lib/admin-uploads/storageTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
  fake: null as unknown as { storage: unknown },
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    ...createSectionAdmin(kit.state, kit.db),
    storage: kit.fake.storage,
  }),
}));

import handler from "./[key].js";

const get = (query: Record<string, string>) =>
  callHandler(handler, undefined, "GET", query);

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `r${String(i + 1).padStart(2, "0")}`,
    result_year: 2026,
    university_name: `대학${i + 1}`,
  }));

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createSectionDb({});
  kit.fake = createFakeStorage();
});

describe("GET /api/admin/sections/:key", () => {
  test("서버 페이지 섹션은 한 쪽 10행과 전체 건수를 돌려주고 검색어를 이스케이프해 건다", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = rows(25);

    const r = await get({
      key: "admissionResults",
      page: "2",
      q: "서울,(대)%_\\*",
    });

    expect(r.status).toBe(200);
    const body = r.body as { items: { id: string }[]; total: number };
    expect(body.total).toBe(25);
    expect(body.items.map((row) => row.id)).toEqual(
      Array.from(
        { length: 10 },
        (_, i) => `r${String(15 - i).padStart(2, "0")}`,
      ),
    );
    const call = kit.db.calls.find((c) => c.table === "admission_results");
    expect(call?.range).toEqual([10, 19]);
    expect(call?.count).toBe(true);
    expect(call?.or).toBe(
      "university_name.ilike.%서울  대%,department_name.ilike.%서울  대%,admission_track.ilike.%서울  대%",
    );
  });

  test("서버 페이지가 아닌 섹션은 모든 행을 주고 page, q 는 무시한다", async () => {
    seedAdmin(kit.state, "view", "notices");
    kit.db.tables.notices = Array.from({ length: 13 }, (_, i) => ({
      id: `n${i}`,
      sort_order: i,
    }));

    const r = await get({ key: "notices", page: "3", q: "x" });

    const body = r.body as { items: unknown[]; total: number };
    expect(body.items).toHaveLength(13);
    expect(body.total).toBe(13);
    const call = kit.db.calls[0];
    expect(call?.range).toBeUndefined();
    expect(call?.or).toBeUndefined();
  });

  test("고정 구분과 고정 값 필터가 걸린다", async () => {
    seedAdmin(kit.state, "view", "admissionSusiJungsi");
    kit.db.tables.admission_posts = [
      { id: "a", category: "susi", sort_order: 1 },
      { id: "b", category: "etc", sort_order: 2 },
    ];
    const susi = await get({ key: "admissionSusiJungsi" });
    expect(
      (susi.body as { items: { id: string }[] }).items.map((x) => x.id),
    ).toEqual(["a"]);

    seedAdmin(kit.state, "view", "winningSuhaengTopicDb");
    kit.db.tables.winning_assessment_knowledge_items = [
      { id: "t", knowledge_type: "topic_pattern" },
      { id: "v", knowledge_type: "verified_resource" },
    ];
    const topic = await get({ key: "winningSuhaengTopicDb" });
    expect(
      (topic.body as { items: { id: string }[] }).items.map((x) => x.id),
    ).toEqual(["t"]);
  });

  test("모르는 섹션 키는 권한을 보기 전에 400 VALIDATION_FAILED", async () => {
    seedAdmin(kit.state, "none", "x");
    const r = await get({ key: "nope" });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  test("q 는 100자까지만 받는다", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = [];
    const over = await get({ key: "admissionResults", q: "가".repeat(101) });
    expect(over.status).toBe(400);
    expect(kit.db.calls).toHaveLength(0);
    const edge = await get({ key: "admissionResults", q: "가".repeat(100) });
    expect(edge.status).toBe(200);
  });

  test("page 가 1 보다 작으면 400", async () => {
    seedAdmin(kit.state, "view", "admissionResults");
    kit.db.tables.admission_results = [];
    const r = await get({ key: "admissionResults", page: "0" });
    expect(r.status).toBe(400);
  });

  test("메뉴 권한이 없으면 403 이고 테이블을 읽지 않는다", async () => {
    seedAdmin(kit.state, "none", "notices");
    kit.db.tables.notices = [];
    const r = await get({ key: "notices" });
    expect(r.status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });
});

const post = (key: string, body: unknown) =>
  callHandler(handler, body, "POST", { key });

describe("POST /api/admin/sections/:key", () => {
  test("등록하면 201 과 저장된 행을 돌려주고 보호 컬럼과 목록 전용 키는 뗀다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];

    const r = await post("faqs", {
      values: { id: "evil", created_at: "t", question: "q", answer: "a" },
    });

    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ question: "q", answer: "a" });
    const insert = kit.db.calls.find((c) => c.op === "insert");
    expect(insert?.values).toEqual({ question: "q", answer: "a" });
  });

  describe("임시 업로드", () => {
    const UUID = "123e4567-e89b-12d3-a456-426614174000";
    const NAME = `${UUID}.image_url.hero.png`;
    const tmpUrl = (name: string) =>
      `https://storage.test/storage/v1/object/sign/admin-uploads-tmp/${name}?token=t`;
    const fake = () => kit.fake as ReturnType<typeof createFakeStorage>;

    test("임시 URL 을 banners 로 옮기고 공개 URL 을 저장한다", async () => {
      kit.fake = createFakeStorage({ "admin-uploads-tmp": [NAME] });
      seedAdmin(kit.state, "edit", "banners");
      kit.db.tables.banners = [];

      const r = await post("banners", {
        values: { title: "t", image_url: tmpUrl(NAME) },
      });

      const publicUrl = `https://storage.test/storage/v1/object/public/banners/landing/hero/${UUID}-hero.png`;
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ image_url: publicUrl });
      const insert = kit.db.calls.find((c) => c.op === "insert");
      expect(insert?.values).toEqual({ title: "t", image_url: publicUrl });
      expect(fake().names("banners")).toEqual([
        `landing/hero/${UUID}-hero.png`,
      ]);
    });

    test("임시 파일이 사라졌으면 409 UPLOAD_EXPIRED 이고 DB 를 건드리지 않는다", async () => {
      seedAdmin(kit.state, "edit", "banners");
      kit.db.tables.banners = [{ id: "b1", sort_order: 1 }];

      const r = await post("banners", {
        values: { sort_order: 1, image_url: tmpUrl(NAME) },
      });

      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({
        code: "UPLOAD_EXPIRED",
        detail: "올린 파일이 만료됐어요. 파일을 다시 올려 주세요.",
      });
      expect(kit.db.calls).toHaveLength(0);
    });

    test("이 섹션 업로드 필드가 아닌 필드의 임시 파일은 400 이다", async () => {
      kit.fake = createFakeStorage({
        "admin-uploads-tmp": [`${UUID}.logo_url.x.png`],
      });
      seedAdmin(kit.state, "edit", "banners");
      kit.db.tables.banners = [];
      const r = await post("banners", {
        values: { image_url: tmpUrl(`${UUID}.logo_url.x.png`) },
      });
      expect(r.status).toBe(400);
      expect(kit.db.calls).toHaveLength(0);
    });

    test("임시 URL 이 없는 저장은 스토리지를 부르지 않는다", async () => {
      seedAdmin(kit.state, "edit", "faqs");
      kit.db.tables.faqs = [];
      await post("faqs", { values: { question: "q" } });
      expect(fake().calls).toHaveLength(0);
    });
  });

  test("보기 권한만 있으면 403 이고 쓰지 않는다", async () => {
    seedAdmin(kit.state, "view", "faqs");
    kit.db.tables.faqs = [];
    const r = await post("faqs", { values: { question: "q" } });
    expect(r.status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });

  test("모르는 필드는 400 이고 키 목록을 돌려준다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    const r = await post("faqs", {
      values: { question: "q", typo: 1, nope: 2 },
    });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "values.typo" }, { path: "values.nope" }],
    });
    expect(kit.db.calls).toHaveLength(0);
  });

  test("values 가 없거나 객체가 아니면 400", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    expect((await post("faqs", {})).status).toBe(400);
    expect((await post("faqs", { values: [1] })).status).toBe(400);
  });

  test("고정 값은 덮어쓰고 고정 구분은 목록 안이어야 한다", async () => {
    seedAdmin(kit.state, "edit", "winningSuhaengTopicDb");
    kit.db.tables.winning_assessment_knowledge_items = [];
    const topic = await post("winningSuhaengTopicDb", {
      values: { knowledge_type: "verified_resource", content: "c" },
    });
    expect(topic.status).toBe(201);
    expect(topic.body).toMatchObject({ knowledge_type: "topic_pattern" });

    seedAdmin(kit.state, "edit", "admissionSusiJungsi");
    kit.db.tables.admission_posts = [];
    const bad = await post("admissionSusiJungsi", {
      values: { category: "etc" },
    });
    expect(bad.status).toBe(400);
    const good = await post("admissionSusiJungsi", {
      values: { category: "jungsi" },
    });
    expect(good.status).toBe(201);
  });

  test("allowCreate 가 꺼진 섹션은 등록을 거절한다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    const entry = SECTIONS.faqs;
    entry.allowCreate = false;
    try {
      expect((await post("faqs", { values: { question: "q" } })).status).toBe(
        400,
      );
    } finally {
      entry.allowCreate = true;
    }
    expect(kit.db.tables.faqs).toHaveLength(0);
  });

  test("등록 불가, 읽기 전용 섹션은 400", async () => {
    seedAdmin(kit.state, "edit", "premiumConsults");
    kit.db.tables.premium_consult_requests = [];
    expect((await post("premiumConsults", { values: {} })).status).toBe(400);
    seedAdmin(kit.state, "edit", "refunds");
    kit.db.tables.refunds = [];
    expect((await post("refunds", { values: {} })).status).toBe(400);
    expect(kit.db.calls).toHaveLength(0);
  });

  test("view_count 는 편집 필드가 없는 섹션에서는 떼고 있는 섹션에서는 남긴다", async () => {
    seedAdmin(kit.state, "edit", "notices");
    kit.db.tables.notices = [];
    await post("notices", { values: { title: "a", view_count: 9 } });
    expect(kit.db.calls.find((c) => c.op === "insert")?.values).toEqual({
      title: "a",
      view_count: 9,
    });

    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    // faqs 에는 view_count 컬럼이 없으니 떼지 않으면 400 이 된다
    const r = await post("faqs", { values: { question: "q", view_count: 9 } });
    expect(r.status).toBe(201);
  });

  test("sort_order 를 지정하면 그 구간을 먼저 민 뒤 저장한다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "c", sort_order: 4 },
    ];
    await post("faqs", { values: { question: "q", sort_order: 1 } });
    const ops = kit.db.calls
      .filter((c) => c.op === "update" || c.op === "insert")
      .map((c) => [c.op, c.values]);
    expect(ops).toEqual([
      ["update", { sort_order: 3 }],
      ["update", { sort_order: 2 }],
      ["insert", { question: "q", sort_order: 1 }],
    ]);
  });

  test("23505 는 409 와 컬럼 이름만 돌려주고 값은 새지 않는다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    kit.db.errors.push({
      table: "faqs",
      op: "insert",
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (question)=(비밀질문) already exists.",
      },
    });
    const r = await post("faqs", { values: { question: "비밀질문" } });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "DB_UNIQUE_VIOLATION",
      columns: ["question"],
    });
    expect(JSON.stringify(r.body)).not.toContain("비밀질문");
  });

  test("매핑에 없는 DB 오류는 500 이고 원문을 싣지 않는다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    kit.db.errors.push({
      table: "faqs",
      op: "insert",
      error: { code: "42703", message: "column secret_col does not exist" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await post("faqs", { values: { question: "q" } });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret_col");
  });
});
