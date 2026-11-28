// POST /api/performance/admin-embed 계약. problem 형식이고 knowledgeType 이 가리키는 메뉴의 edit 권한을 요구한다
// (지식 DB 일괄 반영 화면의 backfill 도 같은 경로를 쓴다).

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";
import { callHandler } from "../../_lib/tenantRoute.testkit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));
const audit = vi.hoisted(() => vi.fn());

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));
vi.mock("../../_lib/performance/embeddings.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/performance/embeddings.js")
  >()),
  getEmbeddingDimension: () => 768,
}));
vi.mock("../../_lib/afterResponse.js", () => ({
  scheduleAfterResponse: () => {},
}));
vi.mock("../../_lib/accessLog/adminWrite.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/accessLog/adminWrite.js")
  >()),
  scheduleAdminAudit: audit,
}));

import { app } from "../app.js";

const call = (body: unknown) =>
  callHandler({ app, path: "/api/performance/admin-embed" }, body);

const TOPIC = "topic_pattern";
const grant = (resourceKey: string, level = "edit") => {
  kit.state.rpc.fn_admin_effective_permissions = () => ({
    data: [{ resource_key: resourceKey, level }],
    error: null,
  });
};

beforeEach(() => {
  kit.state = createKitState();
  kit.state.rows.profiles = () => ({ role: "admin" });
  grant("winningSuhaengTopicDb");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin-embed 오류", () => {
  test("embed-one 에 id 가 없으면 400 ID_REQUIRED", async () => {
    const r = await call({ action: "embed-one", knowledgeType: TOPIC });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "ID_REQUIRED",
      detail: "id가 필요합니다.",
    });
  });

  test.each([
    ["모르는 action", { action: "nope" }, "action"],
    ["숫자가 아닌 limit", { action: "backfill", limit: "abc" }, "limit"],
    [
      '불리언도 "true"도 아닌 force',
      { action: "backfill", force: "yes" },
      "force",
    ],
    ["문자열이 아닌 id", { action: "embed-one", id: 5 }, "id"],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      const r = await call({ ...body, knowledgeType: TOPIC });

      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
      expect(JSON.stringify((r.body as { errors: unknown }).errors)).toContain(
        field,
      );
    },
  );

  test("임베딩 중 예외는 500 EMBED_FAILED 이고 원인 문구를 detail 로 싣는다", async () => {
    kit.state.rows.winning_assessment_knowledge_items = () => {
      throw new Error("db down");
    };

    const r = await call({
      action: "embed-one",
      id: "k1",
      knowledgeType: TOPIC,
    });

    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ code: "EMBED_FAILED" });
    expect(r.body).toMatchObject({ detail: "db down" });
  });
});

describe("admin-embed 메뉴 권한", () => {
  test("knowledgeType 메뉴의 edit 권한이 없으면 403 이고 지식 항목을 읽지 않는다", async () => {
    grant("winningSuhaengResourceDb");

    const r = await call({
      action: "embed-one",
      id: "k1",
      knowledgeType: TOPIC,
    });

    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "FORBIDDEN" });
    expect(
      kit.state.reads.filter(
        (read) => read.table === "winning_assessment_knowledge_items",
      ),
    ).toEqual([]);
  });

  test("knowledgeType 메뉴의 edit 권한이 있으면 200 이다", async () => {
    grant("winningSuhaengResourceDb");

    const r = await call({
      action: "embed-one",
      id: "k1",
      knowledgeType: "verified_resource",
    });

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ action: "embed-one", status: "not_found" });
  });

  test("view 권한만 있으면 403 이다", async () => {
    grant("winningSuhaengTopicDb", "view");

    const r = await call({
      action: "embed-one",
      id: "k1",
      knowledgeType: TOPIC,
    });

    expect(r.status).toBe(403);
  });

  test("모르는 knowledgeType 은 권한이 없어도 403 이 아니라 400 VALIDATION_FAILED 이다", async () => {
    kit.state.rpc.fn_admin_effective_permissions = () => ({
      data: [],
      error: null,
    });

    const r = await call({
      action: "embed-one",
      id: "k1",
      knowledgeType: "student_record_pattern",
    });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  test("호출하면 쓰기 감사 행을 예약한다", async () => {
    audit.mockClear();

    await call({ action: "embed-one", id: "k1", knowledgeType: TOPIC });

    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]?.[1]).toMatchObject({
      statusCode: 200,
      requestedKey: "winningSuhaengTopicDb",
    });
  });

  test("embed-one 은 행의 knowledge_type 이 요청과 다르면 400 VALIDATION_FAILED 이고 임베딩하지 않는다", async () => {
    kit.state.rows.winning_assessment_knowledge_items = () => ({
      id: "k1",
      knowledge_type: "verified_resource",
      title: "자료",
      content: "내용",
    });

    const r = await call({
      action: "embed-one",
      id: "k1",
      knowledgeType: TOPIC,
    });

    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.state.updates).toEqual([]);
  });

  test.each([
    ["topic_pattern", "winningSuhaengTopicDb"],
    ["verified_resource", "winningSuhaengResourceDb"],
  ])("backfill 은 요청한 %s 행만 대상으로 조회한다", async (type, key) => {
    grant(key);

    const seen: Record<string, unknown>[] = [];
    kit.state.rows.winning_assessment_knowledge_items = (filters) => {
      seen.push(filters);
      return [];
    };

    const r = await call({
      action: "backfill",
      knowledgeType: type,
      force: true,
    });

    expect(r.status).toBe(200);
    expect(seen).toEqual([{ knowledge_type: type }]);
  });
});
