import { afterEach, describe, expect, it, vi } from "vitest";
import { hasPaidServiceAccess, SERVICE_CONFIGS } from "./serviceAccess.js";

const stateRow = (over: Record<string, unknown> = {}) => ({
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

function fakeDb(tenantRow: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "fn_tenant_usage_state")
      return { data: [tenantRow], error: null };
    if (name === "fn_program_access_state")
      return {
        data: [
          {
            allowed: true,
            program_key: "growth",
            reason: null,
            expires_at: null,
          },
        ],
        error: null,
      };
    return { data: null, error: null };
  });
  return { db: { rpc } as never, rpc };
}

function cfg(key: string) {
  const config = SERVICE_CONFIGS[key];
  if (!config) throw new Error(key);
  return config;
}

const names = (rpc: ReturnType<typeof vi.fn>) =>
  rpc.mock.calls.map((c) => c[0]);

afterEach(() => vi.unstubAllEnvs());

describe("hasPaidServiceAccess 사이트 분기", () => {
  it("위닝은 기관 상태를 읽지 않고 program_access 로 판정한다", async () => {
    vi.stubEnv("SITE", "winning");
    const { db, rpc } = fakeDb(
      stateRow({ allowed: false, deny_reason: "catch_all" }),
    );
    const out = await hasPaidServiceAccess(db, "u1", cfg("growth"));
    expect(out).toEqual({ allowed: true, reason: null });
    expect(names(rpc)).not.toContain("fn_tenant_usage_state");
    expect(names(rpc)).toContain("fn_program_access_state");
  });

  it("SITE 가 비어 있어도 위닝 경로다", async () => {
    vi.stubEnv("SITE", "");
    const { db, rpc } = fakeDb(stateRow());
    await hasPaidServiceAccess(db, "u1", cfg("growth"));
    expect(names(rpc)).not.toContain("fn_tenant_usage_state");
  });

  it("스쿨멘토는 기관 상태만 보고 program_access 는 무시한다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db, rpc } = fakeDb(
      stateRow({ allowed: false, deny_reason: "catch_all" }),
    );
    const out = await hasPaidServiceAccess(db, "u1", cfg("growth"));
    expect(out).toEqual({ allowed: false, reason: "catch_all" });
    expect(rpc).toHaveBeenCalledWith("fn_tenant_usage_state", {
      p_profile: "u1",
      p_program_key: "growth",
    });
    expect(names(rpc)).not.toContain("fn_program_access_state");
  });

  it("스쿨멘토는 선생님 계정을 teacher 사유로 막는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb(stateRow({ allowed: false, deny_reason: "teacher" }));
    const out = await hasPaidServiceAccess(db, "t1", cfg("growth"));
    expect(out).toEqual({ allowed: false, reason: "teacher" });
  });

  it("스쿨멘토 목표관리는 program_key target 으로 읽는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db, rpc } = fakeDb(stateRow());
    await hasPaidServiceAccess(db, "u1", cfg("goal"));
    expect(rpc).toHaveBeenCalledWith("fn_tenant_usage_state", {
      p_profile: "u1",
      p_program_key: "target",
    });
  });

  it("스쿨멘토에서 월 한도 소진은 진입을 막지 않는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb(
      stateRow({ allowed: false, deny_reason: "month_cap" }),
    );
    expect(await hasPaidServiceAccess(db, "u1", cfg("growth"))).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it("스쿨멘토는 로컬 우회 플래그보다 기관 게이트가 먼저다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    vi.stubEnv("DEV_BYPASS_ENTITLEMENT", "true");
    const { db } = fakeDb(
      stateRow({ allowed: false, deny_reason: "disabled" }),
    );
    expect(await hasPaidServiceAccess(db, "u1", cfg("growth"))).toEqual({
      allowed: false,
      reason: "disabled",
    });
  });

  it("기관 상태를 읽지 못하면 막힘 사유를 지어내지 않고 던진다(열지 않는다)", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    } as never;
    await expect(hasPaidServiceAccess(db, "u1", cfg("growth"))).rejects.toThrow(
      "fn_tenant_usage_state",
    );
  });
});
