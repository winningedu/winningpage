// POST /api/admin/selfeval-recover 계약 검증. 종결된 세션을 새 draft 로 복구.

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

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { selfevalRecoverResultSchema } from "../../../shared/selfeval-ops/contract.js";
import { app } from "../app.js";

const route = { app, path: "/api/admin/selfeval-recover" };

const SID = "123e4567-e89b-42d3-a456-426614174000";
const NEW_ID = "323e4567-e89b-42d3-a456-426614174000";
const PID = "223e4567-e89b-42d3-a456-426614174000";

const SOURCE = {
  id: SID,
  profile_id: PID,
  status: "archived",
  current_step: 3,
  academic_year: 2026,
  grade_label: "고2",
  semester: 1,
  area: "교과",
  subject: "수학",
  activity_name: "탐구",
  school_prompt: null,
  teacher_note: null,
  target_chars: 500,
  target_chars_mode: "exact",
  career: null,
  growth_report_id: null,
  growth_applied: false,
  growth_snapshot: null,
  plan_item_id: null,
  step_state: { terminal: { kind: "failed" } },
};

type Db = {
  source: unknown;
  open: unknown[];
  insertError: unknown;
  updateResult: { data: unknown; error: unknown };
  copyError: unknown;
};
let db: Db;

const sessions: Respond = (q) => {
  if (callsOf(q, "insert").length > 0)
    return db.insertError
      ? { data: null, error: db.insertError }
      : { data: { id: NEW_ID }, error: null };
  if (callsOf(q, "update").length > 0) return db.updateResult;
  if (callsOf(q, "delete").length > 0) return { data: null, error: null };
  if (callsOf(q, "limit").length > 0) return { data: db.open, error: null };
  return { data: db.source, error: null };
};

function setup(level: string | null = "edit") {
  kit.admin = createAdminFake({
    permissions: level ? [{ resource_key: "selfevalSessions", level }] : [],
    tables: {
      selfeval_sessions: sessions,
      selfeval_session_activities: (q) =>
        callsOf(q, "insert").length > 0
          ? { data: null, error: db.copyError }
          : {
              data: [
                {
                  activity_record_id: "a1",
                  role: "main",
                  fit_score: 1,
                  fit_reasons: null,
                  analysis: null,
                  analysis_source: null,
                },
              ],
              error: null,
            },
    },
  });
  return kit.admin as ReturnType<typeof createAdminFake>;
}

beforeEach(() => {
  db = {
    source: SOURCE,
    open: [],
    insertError: null,
    updateResult: { data: [{ id: SID }], error: null },
    copyError: null,
  };
});

describe("POST /api/admin/selfeval-recover", () => {
  const post = (body: unknown = { sessionId: SID }) =>
    callRoute(route, { method: "POST", body });

  test("edit 권한이면 새 세션을 만들고 ok 없이 { newSessionId } 를 돌려준다", async () => {
    const admin = setup();
    const r = await post();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ newSessionId: NEW_ID });
    expect(selfevalRecoverResultSchema.safeParse(r.body).success).toBe(true);
    const update = admin.queries.find(
      (q) => q.table === "selfeval_sessions" && callsOf(q, "update").length > 0,
    );
    expect(update && argsOf(update, "select")).toEqual(["id"]);
  });

  test("view 권한이면 403 이고 아무것도 쓰지 않는다", async () => {
    const admin = setup("view");
    const r = await post();
    expect(r.status).toBe(403);
    expect(problemCode(r.body)).toBe("FORBIDDEN");
    expect(admin.queries.some((q) => q.table === "selfeval_sessions")).toBe(
      false,
    );
  });

  test("권한이 없으면 403 이다", async () => {
    setup(null);
    expect((await post()).status).toBe(403);
  });

  test("본문 모양이 틀리면 400 VALIDATION_FAILED, uuid 가 아니면 400 INVALID_BODY 다", async () => {
    setup();
    const shape = await post({});
    expect(shape.status).toBe(400);
    expect(problemCode(shape.body)).toBe("VALIDATION_FAILED");
    const rule = await post({ sessionId: "x" });
    expect(rule.status).toBe(400);
    expect(problemCode(rule.body)).toBe("INVALID_BODY");
  });

  test("없는 세션은 404 SESSION_NOT_FOUND 다", async () => {
    setup();
    db.source = null;
    const r = await post();
    expect(r.status).toBe(404);
    expect(problemCode(r.body)).toBe("SESSION_NOT_FOUND");
    expect((r.body as { detail?: string }).detail).toBe(
      "세션을 찾을 수 없습니다.",
    );
  });

  test("종결되지 않은 세션은 409 NOT_RECOVERABLE 다", async () => {
    setup();
    db.source = { ...SOURCE, status: "in_progress" };
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("NOT_RECOVERABLE");
    expect((r.body as { detail?: string }).detail).toBe(
      "복구할 수 없는 세션입니다. 종결된 세션만 복구할 수 있습니다.",
    );
  });

  test("이미 복구한 세션은 409 ALREADY_RECOVERED 다", async () => {
    setup();
    db.source = {
      ...SOURCE,
      step_state: { terminal: { kind: "failed" }, recoveredTo: NEW_ID },
    };
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("ALREADY_RECOVERED");
    expect((r.body as { detail?: string }).detail).toBe(
      "이미 복구한 세션입니다.",
    );
  });

  test("진행 중인 세션이 있으면 409 SESSION_OPEN 이고 만들지 않는다", async () => {
    const admin = setup();
    db.open = [{ id: "open-1" }];
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("SESSION_OPEN");
    expect(admin.queries.some((q) => callsOf(q, "insert").length > 0)).toBe(
      false,
    );
  });

  test("insert 가 부분 유니크에 걸리면 409 SESSION_OPEN 이다", async () => {
    setup();
    db.insertError = { code: "23505", message: "dup" };
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("SESSION_OPEN");
  });

  test("활동 복제가 실패하면 새 세션을 지우고 500 이다", async () => {
    const admin = setup();
    db.copyError = { message: "boom" };
    const r = await post();
    expect(r.status).toBe(500);
    expect(
      admin.queries.some(
        (q) =>
          q.table === "selfeval_sessions" && callsOf(q, "delete").length > 0,
      ),
    ).toBe(true);
  });

  test("원본 표시 update 가 0행이면 성공으로 알리지 않고 409 NOT_RECOVERABLE 이며 새 세션을 지운다", async () => {
    const admin = setup();
    db.updateResult = { data: [], error: null };
    const r = await post();
    expect(r.status).toBe(409);
    expect(problemCode(r.body)).toBe("NOT_RECOVERABLE");
    expect((r.body as { detail?: string }).detail).toBe(
      "복구할 수 없는 세션입니다. 종결된 세션만 복구할 수 있습니다.",
    );
    const del = admin.queries.find(
      (q) => q.table === "selfeval_sessions" && callsOf(q, "delete").length > 0,
    );
    expect(del && argsOf(del, "eq")).toEqual(["id", NEW_ID]);
  });
  test("GET 은 405 METHOD_NOT_ALLOWED 이고 Allow 는 POST 다", async () => {
    setup();
    const r = await callRoute(route, { method: "GET" });
    expect(r.status).toBe(405);
    expect(problemCode(r.body)).toBe("METHOD_NOT_ALLOWED");
    expect(r.headers.allow).toBe("POST");
  });
});
