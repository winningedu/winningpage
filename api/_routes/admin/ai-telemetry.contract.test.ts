// AI 텔레메트리 라우트 응답이 브라우저가 검증하는 계약 스키마(shared/ai-telemetry/contract.ts)를 통과하는지 본다.
// 호출이 없는 구간처럼 비율이 null 이 되는 경우와, 컬럼을 다 채운 호출 행으로 부른다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callsPageSchema,
  citationsSchema,
  pricingBody,
  pricingSavedSchema,
  pricingSchema,
  summarySchema,
} from "../../../shared/ai-telemetry/contract.js";
import {
  callRoute,
  createAdminFake,
  type Respond,
} from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

const TABLE = {
  "gemini-x": {
    input_usd_per_1m: 1,
    output_usd_per_1m: 2,
    cached_input_usd_per_1m: 0.5,
  },
};

const CALL_ROW = {
  id: "1",
  created_at: "2026-10-01T00:00:00.000Z",
  started_at: "2026-10-01T00:00:00.000Z",
  trace_id: "t-1",
  kind: "generate",
  service: "growth",
  feature: "report",
  step: null,
  call_key: null,
  target_kind: null,
  target_id: null,
  profile_id: null,
  model: "gemini-x",
  prompt_version: null,
  attempt: 1,
  retry_reason: null,
  transport_attempt: 1,
  status: "ok",
  error_code: null,
  error_message: null,
  finish_reason: "STOP",
  prompt_tokens: 10,
  output_tokens: 5,
  cached_tokens: null,
  thoughts_tokens: null,
  total_tokens: 15,
  input_chars: 100,
  output_chars: 50,
  latency_ms: 800,
  validation: null,
  issue_codes: null,
};

const SUMMARY_ROW = {
  day: "2026-10-01",
  service: "growth",
  model: "gemini-x",
  calls: 4,
  ok_calls: 3,
  error_calls: 1,
  retried_calls: 0,
  prompt_tokens: 100,
  output_tokens: 50,
  cached_tokens: 10,
  thoughts_tokens: 0,
  p50_ms: 700,
  p95_ms: 900,
};

let settings: Respond;
let summaryRows: unknown[];

beforeEach(() => {
  settings = () => ({ data: null, error: null });
  summaryRows = [];
  kit.admin = createAdminFake({
    permissions: [{ resource_key: "aiTelemetry", level: "edit" }],
    tables: {
      app_settings: (query) => settings(query),
      ai_model_calls: () => ({ data: [CALL_ROW], error: null, count: 1 }),
    },
    rpcs: {
      fn_ai_telemetry_daily_summary: () => ({ data: summaryRows, error: null }),
      fn_ai_telemetry_citations: () => ({
        data: [
          {
            resource_id: "r1",
            title: "자료",
            knowledge_type: "guide",
            is_active: true,
            hit_count: 3,
            cited_count: 0,
            last_hit_at: null,
            last_cited_at: null,
          },
        ],
        error: null,
      }),
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const get = (query: Record<string, string>) =>
  callRoute(
    { app, path: "/api/admin/ai-telemetry" },
    { query, headers: { "x-time-zone": "Asia/Seoul" } },
  );

describe("AI 텔레메트리 응답과 계약 스키마", () => {
  test("호출이 없는 구간의 요약은 비율이 null 이어도 통과한다", async () => {
    const r = await get({ from: "2026-10-01", to: "2026-10-02" });
    expect(r.status).toBe(200);
    expect(
      (r.body as { totals: { failureRate: unknown } }).totals,
    ).toMatchObject({
      calls: 0,
      failureRate: null,
      retryRate: null,
    });
    expect(summarySchema.safeParse(r.body).success).toBe(true);
  });

  test("호출이 있는 구간의 요약", async () => {
    summaryRows = [SUMMARY_ROW];
    const r = await get({ from: "2026-10-01", to: "2026-10-02" });
    expect(summarySchema.safeParse(r.body).success).toBe(true);
  });

  test("호출 목록", async () => {
    const r = await get({ view: "calls" });
    expect(r.status).toBe(200);
    expect(callsPageSchema.safeParse(r.body).success).toBe(true);
  });

  test("인용 현황", async () => {
    const r = await get({ view: "citations" });
    expect(r.status).toBe(200);
    expect(citationsSchema.safeParse(r.body).success).toBe(true);
  });

  test("단가표 읽기는 설정 전과 후 모두 통과한다", async () => {
    const before = await get({ view: "pricing" });
    expect(pricingSchema.safeParse(before.body).success).toBe(true);
    settings = () => ({
      data: { value: TABLE, updated_at: "2026-10-01T00:00:00Z" },
      error: null,
    });
    const after = await get({ view: "pricing" });
    expect(pricingSchema.safeParse(after.body).success).toBe(true);
  });

  test("단가표 저장", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/ai-telemetry-pricing" },
      { method: "PUT", body: { pricing: TABLE } },
    );
    expect(r.status).toBe(200);
    expect(pricingSavedSchema.safeParse(r.body).success).toBe(true);
  });
});

describe("pricingBody", () => {
  test("검증을 마친 단가표를 돌려주고 모르는 키는 버린다", () => {
    const parsed = pricingBody.safeParse({
      pricing: { m: { ...TABLE["gemini-x"], extra: 1 } },
    });
    expect(parsed.success && parsed.data).toEqual({
      pricing: { m: TABLE["gemini-x"] },
    });
  });

  test("값 규칙을 어기면 pricing 경로의 사유가 붙는다", () => {
    const parsed = pricingBody.safeParse({
      pricing: { m: { input_usd_per_1m: 1 } },
    });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0]).toMatchObject({
      path: ["pricing"],
    });
  });
});
