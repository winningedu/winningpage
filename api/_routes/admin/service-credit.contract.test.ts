// 서비스 이용횟수 라우트 응답이 브라우저가 검증하는 계약 스키마(shared/service-credit/contract.ts)를 통과하는지 본다.
// 이용권이 없는 서비스(총 0)와 회차 무제한 이용권(총 null)을 모두 담는다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  adjustBody,
  adjustResultSchema,
  serviceCreditSummarySchema,
} from "../../../shared/service-credit/contract.js";
import { callRoute, createAdminFake } from "../../_lib/adminRoute.testkit.js";

const kit = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => kit.admin,
}));

import { app } from "../app.js";

const PID = "223e4567-e89b-42d3-a456-426614174000";

let summary: Record<string, unknown>;

beforeEach(() => {
  summary = {
    live_count: 1,
    quota_total: 10,
    quota_used: 4,
    expires_at: "2026-12-31T00:00:00Z",
    unlimited_period: false,
  };
  kit.admin = createAdminFake({
    permissions: [{ resource_key: "serviceCreditAdjust", level: "edit" }],
    tables: {
      profiles: () => ({
        data: { id: PID, name: "김학생", email: null, member_type: "student" },
        error: null,
      }),
      program_access_grants: () => ({ data: null, error: null }),
    },
    rpcs: {
      fn_program_access_grants_summary: () => ({
        data: [summary],
        error: null,
      }),
      fn_sync_program_access_cache: () => ({ data: null, error: null }),
    },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("서비스 이용횟수 응답과 계약 스키마", () => {
  test("현황", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/service-credit-summary" },
      { query: { profileId: PID } },
    );
    expect(r.status).toBe(200);
    expect(serviceCreditSummarySchema.safeParse(r.body).success).toBe(true);
  });

  test("회차 무제한 이용권은 총량과 잔여가 null 이어도 통과한다", async () => {
    summary = { ...summary, quota_total: null };
    const r = await callRoute(
      { app, path: "/api/admin/service-credit-summary" },
      { query: { profileId: PID } },
    );
    expect(r.status).toBe(200);
    expect(serviceCreditSummarySchema.safeParse(r.body).success).toBe(true);
  });

  test("조정", async () => {
    const r = await callRoute(
      { app, path: "/api/admin/service-credit-adjust" },
      {
        method: "POST",
        body: {
          profileId: PID,
          programKey: "growth",
          delta: 3,
          reason: "보상 지급",
        },
      },
    );
    expect(r.status).toBe(200);
    expect(adjustResultSchema.safeParse(r.body).success).toBe(true);
  });
});

describe("adjustBody", () => {
  test("months 는 생략하거나 null 이어도 받고 모르는 키는 버린다", () => {
    const base = {
      profileId: PID,
      programKey: "growth",
      delta: 1,
      reason: "xx",
    };
    expect(adjustBody.safeParse(base).success).toBe(true);
    expect(adjustBody.safeParse({ ...base, months: null }).success).toBe(true);
    const parsed = adjustBody.safeParse({ ...base, extra: 1 });
    expect(parsed.success && parsed.data).toEqual(base);
  });
});
