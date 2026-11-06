import { describe, expect, it, vi } from "vitest";
import {
  checkTenantStart,
  consumeTenantUsage,
  PROGRAM_KEY_BY_SERVICE,
  readTenantQuota,
  readTenantUsage,
  type TenantUsageState,
  tenantEntryAccess,
  tenantReasonExtra,
  tenantReasonOf,
} from "./tenantUsage.js";

const row = (over: Record<string, unknown> = {}) => ({
  allowed: true,
  deny_reason: null,
  month_used: 0,
  month_limit: null,
  month_remaining: null,
  term_used: 0,
  term_limit: null,
  term_remaining: null,
  month_resets_on: "2026-12-01",
  term_resets_on: null,
  ...over,
});

function fakeDb(handlers: {
  rpc?: (name: string, args: Record<string, unknown>) => unknown;
  events?: unknown[];
}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => ({
    data: handlers.rpc?.(name, args) ?? null,
    error: null,
  }));
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({
      data: handlers.events?.[0] ?? null,
      error: null,
    });
    return q;
  });
  return { db: { rpc, from } as never, rpc, from };
}

const state = (over: Partial<TenantUsageState> = {}): TenantUsageState => ({
  allowed: true,
  denyReason: null,
  monthLimit: null,
  monthRemaining: null,
  termLimit: null,
  termRemaining: null,
  monthResetsOn: "2026-12-01",
  termResetsOn: null,
  ...over,
});

describe("PROGRAM_KEY_BY_SERVICE", () => {
  it("goal 만 target 으로 바뀌고 나머지는 자기 이름이다", () => {
    expect(PROGRAM_KEY_BY_SERVICE).toEqual({
      suhaeng: "suhaeng",
      goal: "target",
      diagnose: "diagnose",
      growth: "growth",
      selfeval: "selfeval",
      inquiry: "inquiry",
    });
  });
});

describe("tenantEntryAccess", () => {
  it("허용이면 allowed true", () => {
    expect(tenantEntryAccess(state())).toEqual({
      allowed: true,
      reason: null,
    });
  });
  it.each(["month_cap", "term_cap"] as const)(
    "%s 는 막지 않는다(이미 센 작업은 열려 있다)",
    (denyReason) => {
      expect(tenantEntryAccess(state({ allowed: false, denyReason }))).toEqual({
        allowed: true,
        reason: null,
      });
    },
  );
  it.each(["catch_all", "disabled", "outside_period", "grace"] as const)(
    "%s 는 막고 사유를 그대로 낸다",
    (denyReason) => {
      expect(tenantEntryAccess(state({ allowed: false, denyReason }))).toEqual({
        allowed: false,
        reason: denyReason,
      });
    },
  );
});

describe("readTenantUsage", () => {
  it("fn_tenant_usage_state 첫 행을 camelCase 로 바꾼다", async () => {
    const { db, rpc } = fakeDb({
      rpc: () => [
        row({
          allowed: false,
          deny_reason: "month_cap",
          month_limit: 3,
          month_remaining: 0,
        }),
      ],
    });
    const s = await readTenantUsage(db, "u1", "growth");
    expect(rpc).toHaveBeenCalledWith("fn_tenant_usage_state", {
      p_profile: "u1",
      p_program_key: "growth",
    });
    expect(s).toMatchObject({
      allowed: false,
      denyReason: "month_cap",
      monthLimit: 3,
      monthRemaining: 0,
      monthResetsOn: "2026-12-01",
    });
  });
  it("RPC 가 실패하면 던진다(열지 않는다)", async () => {
    const db = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    } as never;
    await expect(readTenantUsage(db, "u1", "growth")).rejects.toThrow();
  });
});

describe("checkTenantStart", () => {
  const src = { kind: "growth_report", id: "r1" } as const;
  it("허용이면 null", async () => {
    const { db } = fakeDb({ rpc: () => [row()] });
    expect(await checkTenantStart(db, "u1", "growth", src)).toBeNull();
  });
  it("한도에 걸려도 이미 센 작업이면 null", async () => {
    const { db } = fakeDb({
      rpc: () => [row({ allowed: false, deny_reason: "month_cap" })],
      events: [{ id: "e1" }],
    });
    expect(await checkTenantStart(db, "u1", "growth", src)).toBeNull();
  });
  it("한도에 걸리고 센 적 없으면 사유", async () => {
    const { db } = fakeDb({
      rpc: () => [row({ allowed: false, deny_reason: "term_cap" })],
    });
    expect(await checkTenantStart(db, "u1", "growth", src)).toBe("term_cap");
  });
  it("한도가 아닌 거부는 센 작업이어도 사유", async () => {
    const { db } = fakeDb({
      rpc: () => [row({ allowed: false, deny_reason: "grace" })],
      events: [{ id: "e1" }],
    });
    expect(await checkTenantStart(db, "u1", "growth", src)).toBe("grace");
  });
});

describe("consumeTenantUsage", () => {
  it.each([
    ["consumed", "charged", true, null],
    ["already_consumed", "already_charged", true, null],
    ["month_cap", "quota_exhausted", false, "month_cap"],
    ["term_cap", "quota_exhausted", false, "term_cap"],
    ["catch_all", "no_entitlement", false, "catch_all"],
    ["disabled", "no_entitlement", false, "disabled"],
    ["outside_period", "entitlement_expired", false, "outside_period"],
    ["grace", "entitlement_expired", false, "grace"],
  ])("%s -> %s", async (result, status, charged, tenantReason) => {
    const { db, rpc } = fakeDb({ rpc: () => result });
    const out = await consumeTenantUsage(db, "u1", "growth", {
      kind: "growth_report",
      id: "r1",
    });
    expect(rpc).toHaveBeenCalledWith("fn_consume_tenant_usage", {
      p_profile: "u1",
      p_program_key: "growth",
      p_source_kind: "growth_report",
      p_source_id: "r1",
    });
    expect(out).toEqual({ status, charged, tenantReason });
  });
  it("모르는 결과는 던진다", async () => {
    const { db } = fakeDb({ rpc: () => "weird" });
    await expect(
      consumeTenantUsage(db, "u1", "growth", {
        kind: "growth_report",
        id: "r",
      }),
    ).rejects.toThrow();
  });
});

describe("readTenantQuota", () => {
  it("한도가 없으면 무제한(null)", () => {
    expect(readTenantQuota(state())).toMatchObject({
      quotaRemaining: null,
      quotaTotal: null,
      planEndsAt: null,
      limitKind: null,
      capReason: null,
    });
  });
  it("남은 횟수가 0 이면 capReason 이 한도 종류의 사유다", () => {
    expect(
      readTenantQuota(state({ monthLimit: 2, monthRemaining: 0 })).capReason,
    ).toBe("month_cap");
    expect(
      readTenantQuota(state({ termLimit: 2, termRemaining: 0 })).capReason,
    ).toBe("term_cap");
    expect(
      readTenantQuota(state({ termLimit: 2, termRemaining: 1 })).capReason,
    ).toBeNull();
  });
  it("월 남은 횟수가 더 작으면 월 기준", () => {
    expect(
      readTenantQuota(
        state({
          monthLimit: 5,
          monthRemaining: 1,
          termLimit: 20,
          termRemaining: 9,
          termResetsOn: "2027-03-01",
        }),
      ),
    ).toMatchObject({
      quotaRemaining: 1,
      quotaTotal: 5,
      planEndsAt: "2026-12-01",
      limitKind: "month",
    });
  });
  it("학기 남은 횟수가 더 작거나 같으면 학기 기준", () => {
    expect(
      readTenantQuota(
        state({
          monthLimit: 5,
          monthRemaining: 2,
          termLimit: 20,
          termRemaining: 2,
          termResetsOn: "2027-03-01",
        }),
      ),
    ).toMatchObject({
      quotaRemaining: 2,
      quotaTotal: 20,
      planEndsAt: "2027-03-01",
      limitKind: "term",
    });
  });
  it("한쪽만 한도가 있으면 그쪽", () => {
    expect(
      readTenantQuota(state({ monthLimit: 4, monthRemaining: 4 })),
    ).toMatchObject({ quotaRemaining: 4, limitKind: "month" });
  });
});

describe("tenantReasonOf", () => {
  it.each([
    "catch_all",
    "disabled",
    "outside_period",
    "grace",
    "month_cap",
    "term_cap",
  ])("%s 는 그대로", (reason) => {
    expect(tenantReasonOf(reason)).toBe(reason);
  });
  it.each([null, undefined, "period_expired", "none", "quota_exhausted"])(
    "%s 는 null(위닝 사유는 내보내지 않는다)",
    (reason) => {
      expect(tenantReasonOf(reason)).toBeNull();
    },
  );
});

describe("tenantReasonExtra", () => {
  it("사유가 있으면 tenantReason 한 키", () => {
    expect(tenantReasonExtra("grace")).toEqual({ tenantReason: "grace" });
  });
  it.each([null, undefined])("%s 는 빈 객체", (reason) => {
    expect(tenantReasonExtra(reason)).toEqual({});
  });
});
