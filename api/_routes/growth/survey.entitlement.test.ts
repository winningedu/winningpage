import { afterEach, describe, expect, it, vi } from "vitest";
import { readEntitlement } from "./survey.js";

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

function fakeDb(tenant: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "fn_tenant_usage_state" ? [tenant] : null,
    error: null,
  }));
  return { db: { rpc } as never, rpc };
}

afterEach(() => vi.unstubAllEnvs());

describe("growth/survey readEntitlement 스쿨멘토", () => {
  it("진입 거부는 hasAccess false 와 tenantReason", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb(row({ allowed: false, deny_reason: "disabled" }));
    expect(await readEntitlement(db, "u1")).toMatchObject({
      hasAccess: false,
      tenantReason: "disabled",
    });
  });

  it("월 한도 소진은 hasAccess true, quotaRemaining 0, tenantReason month_cap", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb(
      row({
        allowed: false,
        deny_reason: "month_cap",
        month_limit: 2,
        month_remaining: 0,
      }),
    );
    expect(await readEntitlement(db, "u1")).toEqual({
      hasAccess: true,
      quotaTotal: 2,
      quotaRemaining: 0,
      planEndsAt: "2026-12-01",
      planLabel: null,
      tenantReason: "month_cap",
    });
  });

  it("허용이고 한도가 없으면 tenantReason null 과 무제한", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb(row());
    expect(await readEntitlement(db, "u1")).toMatchObject({
      hasAccess: true,
      quotaRemaining: null,
      tenantReason: null,
    });
  });
});
