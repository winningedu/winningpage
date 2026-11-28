import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  argsOf,
  callRoute,
  callsOf,
  createAdminFake,
  problemCode,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";
import { gateReads } from "../../_lib/gatedReads.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { inquiryRecoverResultSchema } from "../../../shared/inquiry-ops/contract.js";
import { app } from "../app.js";

const endpoint = { app, path: "/api/admin/inquiry-recover" };

const SOURCE_ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
const PROFILE = "5b1e7f3c-2a10-4c55-9a52-0f6d1f8f9b11";
const NEW_ID = "0f6d1f8f-9b11-4c55-9a52-7f3c2a105b1e";

const SOURCE = {
  id: SOURCE_ID,
  profile_id: PROFILE,
  status: "archived",
  grade_label: "고1",
  semester: "1",
  career: null,
  area: "subject",
  subject: "수학",
  activity_name: null,
  growth_report_id: null,
  plan_item_id: null,
  generation_state: { terminal: { reason: "x" } },
};

let table: Respond;
let source: Record<string, unknown>;
let open: unknown[];
let insertError: unknown;
let markRows: unknown[];

const route: Respond = (q) => {
  if (argsOf(q, "insert"))
    return insertError
      ? { data: null, error: insertError }
      : { data: { id: NEW_ID }, error: null };
  if (argsOf(q, "update")) return { data: markRows, error: null };
  if (argsOf(q, "delete")) return { data: null, error: null };
  if (callsOf(q, "maybeSingle").length) return { data: source, error: null };
  return { data: open, error: null };
};

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "inquirySessions", level }] : [],
    tables: {
      inquiry_sessions: (q) => table(q),
      inquiry_assets: () => ({ data: [], error: null }),
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  source = { ...SOURCE };
  open = [];
  insertError = null;
  markRows = [{ id: SOURCE_ID }];
  table = route;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const post = (body: unknown = { sessionId: SOURCE_ID }) =>
  callRoute(endpoint, { method: "POST", body });

const tables = (admin: { queries: { table: string }[] }) =>
  admin.queries.map((q) => q.table);

describe("POST /api/admin/inquiry-recover", () => {
  test("edit 권한이면 새 세션을 만들고 원본에 recoveredTo 를 남긴 뒤 ok 없이 id 만 돌려준다", async () => {
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body).toEqual({ newSessionId: NEW_ID });
    expect(inquiryRecoverResultSchema.safeParse(r.body).success).toBe(true);
    const queries = admin.queries.filter((q) => q.table === "inquiry_sessions");
    const update = queries.find((q) => argsOf(q, "update"));
    expect(argsOf(update as never, "update")).toEqual([
      { generation_state: { terminal: { reason: "x" }, recoveredTo: NEW_ID } },
    ]);
    expect(callsOf(update as never, "eq").map((c) => c.args)).toEqual([
      ["id", SOURCE_ID],
      ["status", "archived"],
    ]);
    expect(argsOf(update as never, "select")).toEqual(["id"]);
  });

  test("원본이 확인과 기록 사이에 종결 상태를 벗어나 0행이면 409 NOT_RECOVERABLE 이고 새 세션을 지운다", async () => {
    const admin = setup();
    markRows = [];
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("NOT_RECOVERABLE");
    expect((r.body as { detail: string }).detail).toBe(
      "복구할 수 없는 세션입니다. 종결된 세션만 복구할 수 있습니다.",
    );
    const del = admin.queries.find((q) => argsOf(q, "delete"));
    expect(argsOf(del as never, "eq")).toEqual(["id", NEW_ID]);
  });

  test("세션 아이디가 uuid 가 아니면 400 INVALID_BODY 다", async () => {
    const admin = setup();
    const r = await post({ sessionId: "abc" });
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("INVALID_BODY");
    expect((r.body as { detail: string }).detail).toBe(
      "sessionId 가 올바르지 않습니다.",
    );
    expect(tables(admin)).not.toContain("inquiry_sessions");
  });

  test.each([
    ["키 없음", {}],
    ["정의되지 않은 키", { sessionId: SOURCE_ID, status: "draft" }],
  ])("본문 %s 이면 400 VALIDATION_FAILED 다", async (_label, body) => {
    const admin = setup();
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(problemCode(r.body)).toBe("VALIDATION_FAILED");
    expect(tables(admin)).not.toContain("inquiry_sessions");
  });

  test("없는 세션은 404 SESSION_NOT_FOUND 다", async () => {
    const admin = setup();
    table = (q) =>
      callsOf(q, "maybeSingle").length ? { data: null, error: null } : route(q);
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("SESSION_NOT_FOUND");
    expect((r.body as { detail: string }).detail).toBe(
      "세션을 찾을 수 없습니다.",
    );
    expect(admin.queries.some((q) => argsOf(q, "insert"))).toBe(false);
  });

  test("종결되지 않은 세션은 409 NOT_RECOVERABLE 이다", async () => {
    setup();
    source = { ...SOURCE, status: "in_progress" };
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("NOT_RECOVERABLE");
  });

  test("이미 복구한 세션은 409 ALREADY_RECOVERED 다", async () => {
    setup();
    source = {
      ...SOURCE,
      generation_state: { terminal: { reason: "x" }, recoveredTo: "other" },
    };
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("ALREADY_RECOVERED");
    expect((r.body as { detail: string }).detail).toBe(
      "이미 복구한 세션입니다.",
    );
  });

  test("진행 중인 세션이 있으면 409 OPEN_SESSION_EXISTS 이고 만들지 않는다", async () => {
    const admin = setup();
    open = [{ id: "open-1" }];
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("OPEN_SESSION_EXISTS");
    expect(admin.queries.some((q) => argsOf(q, "insert"))).toBe(false);
  });

  test("insert 가 유니크 위반(23505)이면 409 OPEN_SESSION_EXISTS 다", async () => {
    setup();
    insertError = { code: "23505", message: "dup" };
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("OPEN_SESSION_EXISTS");
  });

  test("insert 오류는 500 INTERNAL_ERROR 이고 문구는 그대로다", async () => {
    setup();
    insertError = { code: "XX000", message: "boom" };
    const r = await post();
    expect(r.status).toBe(500);
    expect(problemCode(r.body)).toBe("INTERNAL_ERROR");
    expect((r.body as { detail: string }).detail).toBe(
      "심화탐구 세션 복구에 실패했습니다.",
    );
  });

  test("view 권한으로는 403 FORBIDDEN 이고 읽지도 쓰지도 않는다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(tables(admin)).not.toContain("inquiry_sessions");
  });

  test("권한 행이 없으면 403 FORBIDDEN 이다", async () => {
    setup(null);
    const r = await post();
    expect(r.status).toBe(403);
  });

  test("GET 은 405 METHOD_NOT_ALLOWED 다", async () => {
    setup();
    const r = await callRoute(endpoint, { method: "GET" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("POST");
  });

  test("복구 자산 읽기와 미완 세션 확인을 함께 시작한다", async () => {
    setup();
    const { admin, gate } = gateReads(
      kit.admin as ReturnType<typeof createAdminFake>,
      // 첫 읽기(원본 세션)는 막지 않고, 그다음 두 읽기가 함께 시작하는지 본다.
      (target) =>
        target.kind === "from" &&
        ((target.name === "inquiry_sessions" && target.nth === 1) ||
          (target.name === "inquiry_assets" && target.nth === 0)),
    );
    kit.admin = admin;

    const request = post();
    await vi.waitFor(() => expect(gate.started.length).toBeGreaterThan(0));
    await gate.settle();
    expect([...gate.started].sort()).toEqual([
      "from:inquiry_assets",
      "from:inquiry_sessions",
    ]);
    gate.release();

    expect((await request).status).toBe(200);
  });
});
