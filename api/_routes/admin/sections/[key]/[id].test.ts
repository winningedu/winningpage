// GET, PATCH, DELETE /api/admin/sections/:key/:id 계약 검증.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { SECTIONS } from "../../../../_lib/admin-sections/registry.js";
import {
  createSectionAdmin,
  createSectionDb,
  type SectionDb,
  seedAdmin,
} from "../../../../_lib/admin-sections/sectionTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  db: null as unknown as SectionDb,
}));

vi.mock("../../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createSectionAdmin(kit.state, kit.db),
}));

import handler from "./[id].js";

const call = (method: string, key: string, id: string, body?: unknown) =>
  callHandler(handler, body, method, { key, id });

beforeEach(() => {
  kit.state = createKitState();
  kit.db = createSectionDb({});
});

describe("GET /api/admin/sections/:key/:id", () => {
  test("table 에서 한 행을 읽는다(listTable 이 아니라)", async () => {
    seedAdmin(kit.state, "view", "enrollments");
    kit.db.tables.enrollments = [{ id: "7", school_name: "한빛" }];
    kit.db.tables.admin_enrollment_entries = [];
    const r = await call("GET", "enrollments", "7");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "7", school_name: "한빛" });
    expect(kit.db.calls[0]?.table).toBe("enrollments");
  });

  test("없으면 404 NOT_FOUND", async () => {
    seedAdmin(kit.state, "view", "faqs");
    kit.db.tables.faqs = [];
    const r = await call("GET", "faqs", "nope");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
  });

  test("모르는 섹션 키는 400", async () => {
    seedAdmin(kit.state, "view", "faqs");
    expect((await call("GET", "zzz", "1")).status).toBe(400);
  });
});

describe("PATCH /api/admin/sections/:key/:id", () => {
  test("allowUpdate 가 꺼진 섹션은 수정을 거절한다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [{ id: "f1", question: "old" }];
    const entry = SECTIONS.faqs;
    entry.allowUpdate = false;
    try {
      const r = await call("PATCH", "faqs", "f1", {
        values: { question: "n" },
      });
      expect(r.status).toBe(400);
    } finally {
      entry.allowUpdate = true;
    }
    expect(kit.db.tables.faqs[0]?.question).toBe("old");
  });

  test("고친 행을 돌려주고 보호 컬럼은 뗀다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [{ id: "f1", question: "old", sort_order: 5 }];
    const r = await call("PATCH", "faqs", "f1", {
      values: { id: "x", updated_at: "t", question: "new" },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "f1", question: "new" });
    const update = kit.db.calls.find((c) => c.op === "update");
    expect(update?.values).toEqual({ question: "new" });
    expect(update?.filters).toEqual([["id", "eq", "f1"]]);
  });

  test("맞는 행이 없으면 404", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    const r = await call("PATCH", "faqs", "zz", { values: { question: "q" } });
    expect(r.status).toBe(404);
  });

  test("보기 권한만 있으면 403", async () => {
    seedAdmin(kit.state, "view", "faqs");
    kit.db.tables.faqs = [{ id: "f1" }];
    const r = await call("PATCH", "faqs", "f1", { values: { question: "q" } });
    expect(r.status).toBe(403);
    expect(kit.db.calls).toHaveLength(0);
  });

  test("읽기 전용 섹션은 400", async () => {
    seedAdmin(kit.state, "edit", "refunds");
    kit.db.tables.refunds = [{ id: "r1" }];
    expect((await call("PATCH", "refunds", "r1", { values: {} })).status).toBe(
      400,
    );
  });

  test("sort_order 이동은 자기 행을 구간에서 뺀다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "c", sort_order: 3 },
    ];
    await call("PATCH", "faqs", "a", { values: { sort_order: 2 } });
    const select = kit.db.calls.find(
      (c) => c.op === "select" && c.table === "faqs",
    );
    expect(select?.filters).toContainEqual(["id", "neq", "a"]);
    const sorts = Object.fromEntries(
      (kit.db.tables.faqs ?? []).map((row) => [row.id, row.sort_order]),
    );
    expect(sorts).toEqual({ a: 2, b: 3, c: 4 });
  });

  test("모르는 필드는 400, 고정 값은 덮어쓴다", async () => {
    seedAdmin(kit.state, "edit", "winningSuhaengTopicDb");
    kit.db.tables.winning_assessment_knowledge_items = [
      { id: "k1", knowledge_type: "topic_pattern" },
    ];
    const bad = await call("PATCH", "winningSuhaengTopicDb", "k1", {
      values: { oops: 1 },
    });
    expect(bad.status).toBe(400);
    const ok = await call("PATCH", "winningSuhaengTopicDb", "k1", {
      values: { knowledge_type: "verified_resource" },
    });
    expect(ok.body).toMatchObject({ knowledge_type: "topic_pattern" });
  });

  test("23505 는 409", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [{ id: "f1" }];
    kit.db.errors.push({
      table: "faqs",
      op: "update",
      error: {
        code: "23505",
        message: "dup",
        details: "Key (question)=(값) already exists.",
      },
    });
    const r = await call("PATCH", "faqs", "f1", { values: { question: "값" } });
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).not.toContain("(값)");
  });
});

describe("DELETE /api/admin/sections/:key/:id", () => {
  test("지우고 204 를 돌려준다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [{ id: "f1" }, { id: "f2" }];
    const r = await call("DELETE", "faqs", "f1");
    expect(r.status).toBe(204);
    expect(r.body).toBeUndefined();
    expect(kit.db.tables.faqs.map((row) => row.id)).toEqual(["f2"]);
  });

  test("지울 행이 없으면 404 NOT_FOUND(0행 삭제를 204 로 숨기지 않는다)", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [];
    const r = await call("DELETE", "faqs", "gone");
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "NOT_FOUND" });
  });

  test("refundRequests 는 삭제할 수 없다(관리자 RLS 에 삭제 정책이 없었다)", async () => {
    seedAdmin(kit.state, "edit", "refundRequests");
    kit.db.tables.refund_requests = [{ id: "q1", status: "requested" }];
    const r = await call("DELETE", "refundRequests", "q1");
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.db.tables.refund_requests).toHaveLength(1);
  });

  test("allowDelete 가 꺼진 섹션은 삭제를 거절한다", async () => {
    seedAdmin(kit.state, "edit", "faqs");
    kit.db.tables.faqs = [{ id: "f1" }];
    const entry = SECTIONS.faqs;
    entry.allowDelete = false;
    try {
      expect((await call("DELETE", "faqs", "f1")).status).toBe(400);
    } finally {
      entry.allowDelete = true;
    }
    expect(kit.db.tables.faqs).toHaveLength(1);
  });

  test("보기 권한이면 403, 읽기 전용 섹션이면 400", async () => {
    seedAdmin(kit.state, "view", "faqs");
    kit.db.tables.faqs = [{ id: "f1" }];
    expect((await call("DELETE", "faqs", "f1")).status).toBe(403);
    seedAdmin(kit.state, "edit", "refunds");
    kit.db.tables.refunds = [{ id: "r1" }];
    expect((await call("DELETE", "refunds", "r1")).status).toBe(400);
    expect(kit.db.tables.refunds).toHaveLength(1);
  });
});
