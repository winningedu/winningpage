import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumePerformanceCredit,
  performanceCapDenial,
} from "./tenantCredit.js";

const row = (over: Record<string, unknown> = {}) => ({
  allowed: true,
  deny_reason: null,
  month_used: 1,
  month_limit: 3,
  month_remaining: 2,
  term_used: 1,
  term_limit: null,
  term_remaining: null,
  month_resets_on: "2026-12-01",
  term_resets_on: null,
  ...over,
});

function fakeDb(opts: {
  consume?: unknown;
  state?: Record<string, unknown>;
  event?: unknown;
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "consume_performance_credit")
      return { data: { status: "charged", charged: true }, error: null };
    if (name === "fn_consume_tenant_usage")
      return { data: opts.consume, error: null };
    return { data: [opts.state ?? row()], error: null };
  });
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: opts.event ?? null, error: null });
    return q;
  });
  return { db: { rpc, from } as never, rpc };
}

afterEach(() => vi.unstubAllEnvs());

describe("consumePerformanceCredit", () => {
  it("위닝은 consume_performance_credit 결과를 그대로 돌려준다", async () => {
    vi.stubEnv("SITE", "winning");
    const { db, rpc } = fakeDb({});
    expect(await consumePerformanceCredit(db, "u1", "s1", "why")).toEqual({
      data: { status: "charged", charged: true },
      error: null,
    });
    expect(rpc.mock.calls).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("consume_performance_credit", {
      p_session_id: "s1",
      p_profile_id: "u1",
      p_reason: "why",
    });
  });

  it("스쿨멘토는 performance_session 으로 세고 남은 횟수를 같이 준다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db, rpc } = fakeDb({ consume: "consumed" });
    expect(await consumePerformanceCredit(db, "u1", "s1", "why")).toEqual({
      data: {
        status: "charged",
        charged: true,
        quota_remaining: 2,
        plan_ends_at: "2026-12-01",
        tenantReason: null,
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("fn_consume_tenant_usage", {
      p_profile: "u1",
      p_program_key: "suhaeng",
      p_source_kind: "performance_session",
      p_source_id: "s1",
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "consume_performance_credit",
      expect.anything(),
    );
  });

  it("스쿨멘토에서 이미 센 세션은 already_charged", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb({ consume: "already_consumed" });
    expect(
      (await consumePerformanceCredit(db, "u1", "s1", "why")).data,
    ).toMatchObject({ status: "already_charged", charged: true });
  });

  it.each([
    ["month_cap", "quota_exhausted"],
    ["term_cap", "quota_exhausted"],
    ["catch_all", "no_entitlement"],
    ["disabled", "no_entitlement"],
    ["outside_period", "entitlement_expired"],
    ["grace", "entitlement_expired"],
  ])("스쿨멘토 %s 는 %s 와 tenantReason", async (reason, status) => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb({ consume: reason });
    expect(
      (await consumePerformanceCredit(db, "u1", "s1", "why")).data,
    ).toMatchObject({ status, charged: false, tenantReason: reason });
  });

  it("스쿨멘토 RPC 실패는 error 로 돌려준다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const db = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    } as never;
    const out = await consumePerformanceCredit(db, "u1", "s1", "why");
    expect(out.data).toBeNull();
    expect(out.error).toBeTruthy();
  });
});

describe("performanceCapDenial", () => {
  it("위닝은 기관 상태를 읽지 않고 null", async () => {
    vi.stubEnv("SITE", "winning");
    const { db, rpc } = fakeDb({});
    expect(await performanceCapDenial(db, "u1", "s1")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("스쿨멘토에서 새 세션이 한도에 걸리면 사유와 초기화일", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb({
      state: row({
        allowed: false,
        deny_reason: "month_cap",
        month_remaining: 0,
        month_used: 3,
      }),
    });
    expect(await performanceCapDenial(db, "u1", "s1")).toEqual({
      tenantReason: "month_cap",
      planEndsAt: "2026-12-01",
    });
  });

  it("이미 센 세션은 한도여도 null", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb({
      state: row({
        allowed: false,
        deny_reason: "term_cap",
        term_remaining: 0,
        term_limit: 3,
      }),
      event: { id: "e1" },
    });
    expect(await performanceCapDenial(db, "u1", "s1")).toBeNull();
  });

  it("한도가 아닌 거부는 진입 게이트 몫이라 null", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb({
      state: row({ allowed: false, deny_reason: "grace" }),
    });
    expect(await performanceCapDenial(db, "u1", "s1")).toBeNull();
  });
});
