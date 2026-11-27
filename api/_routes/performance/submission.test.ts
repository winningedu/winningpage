import { describe, expect, test, vi } from "vitest";
import {
  submissionFormResponse,
  submissionSaveResponse,
} from "../../../shared/performance/submission.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  authOnlyDb,
  rowsDb,
  SESSION_ID,
  validationFailedFor,
} from "./route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";

const route = { app, path: "/api/performance/submission" };
const GOOD = { sessionId: SESSION_ID, fields: { a: "내용" }, mode: "draft" };

const sessionRow = {
  id: SESSION_ID,
  profile_id: "me",
  status: "in_progress",
  guide_input_mode: null,
  guide_freetext: null,
  guide_json: null,
  submission_schema: null,
  selected_topic_id: null,
};

describe("submission GET 요청 형식", () => {
  test.each([
    ["sessionId 없음", {}],
    ["sessionId 가 uuid 아님", { sessionId: "x" }],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, query) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { query });
      expect(validationFailedFor(res, "sessionId")).toBe(true);
    },
  );

  test("제출폼 응답이 스키마를 통과한다", async () => {
    state.db = rowsDb({
      performance_sessions: [sessionRow],
      performance_submissions: [],
    });
    const res = await callRoute(route, { query: { sessionId: SESSION_ID } });
    expect(res.status).toBe(200);
    const parsed = submissionFormResponse.parse(res.body);
    expect(parsed.submission).toBeNull();
    expect(parsed.schema.fields.length).toBeGreaterThan(0);
  });
});

describe("submission PUT 요청 형식", () => {
  test.each([
    ["sessionId 가 uuid 아님", { ...GOOD, sessionId: "x" }, "sessionId"],
    ["fields 없음", { ...GOOD, fields: undefined }, "fields"],
    ["fields 가 배열", { ...GOOD, fields: ["a"] }, "fields"],
    ["fields 값이 문자열 아님", { ...GOOD, fields: { a: 1 } }, "fields"],
    ["mode 를 모름", { ...GOOD, mode: "zzz" }, "mode"],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "PUT", body });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );

  test("제출폼에 없는 항목은 400 UNKNOWN_FIELD 를 그대로 낸다", async () => {
    state.db = rowsDb({
      performance_sessions: [sessionRow],
      performance_submissions: [],
    });
    const res = await callRoute(route, {
      method: "PUT",
      body: { ...GOOD, fields: { zzz: "내용" } },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "UNKNOWN_FIELD",
      detail: "제출폼에 없는 항목이 포함돼 있어요.",
      field: "zzz",
    });
  });

  test("저장 응답이 스키마를 통과한다", async () => {
    const saved = {
      id: "sub1",
      revision: 1,
      fields: { a: "내용" },
      char_counts: {},
      is_draft: true,
      is_final: false,
      finalized_at: null,
      finalize_reason: null,
      submitted_at: null,
      created_at: "2026-11-27T00:00:00Z",
      updated_at: "2026-11-27T00:00:00Z",
    };
    state.db = rowsDb({
      performance_sessions: [sessionRow],
      performance_submissions: [saved],
    });
    const formRes = await callRoute(route, {
      query: { sessionId: SESSION_ID },
    });
    const key = submissionFormResponse.parse(formRes.body).schema.fields[0]!
      .key;
    // 최신 행이 draft 라 덮어쓰기 경로를 탄다.
    const res = await callRoute(route, {
      method: "PUT",
      body: { ...GOOD, fields: { [key]: "내용" } },
    });
    expect(res.status).toBe(200);
    expect(submissionSaveResponse.parse(res.body)).toMatchObject({
      mode: "draft",
      isDraft: true,
    });
  });
});
