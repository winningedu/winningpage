import { afterEach, describe, expect, it, vi } from "vitest";
import { readInquiryAccess, readInquiryQuota } from "./compose.js";

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

describe("readInquiryAccess", () => {
  it("스쿨멘토 진입 거부는 tenantReason 을 준다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb(row({ allowed: false, deny_reason: "catch_all" }));
    expect(await readInquiryAccess(db, "u1")).toEqual({
      allowed: false,
      tenantReason: "catch_all",
    });
  });

  it("스쿨멘토 한도 소진은 진입을 막지 않는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = fakeDb(row({ allowed: false, deny_reason: "month_cap" }));
    expect(await readInquiryAccess(db, "u1")).toEqual({
      allowed: true,
      tenantReason: null,
    });
  });
});

describe("readInquiryQuota", () => {
  it("스쿨멘토는 기관 한도에서 읽고 capReason 을 준다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db, rpc } = fakeDb(
      row({
        allowed: false,
        deny_reason: "month_cap",
        month_limit: 2,
        month_remaining: 0,
        month_used: 2,
      }),
    );
    expect(await readInquiryQuota(db, "u1")).toMatchObject({
      quotaRemaining: 0,
      quotaTotal: 2,
      planEndsAt: "2026-12-01",
      capReason: "month_cap",
    });
    expect(rpc).toHaveBeenCalledWith("fn_tenant_usage_state", {
      p_profile: "u1",
      p_program_key: "inquiry",
    });
  });

  it("스쿨멘토에서 읽기에 실패하면 무제한(null)으로 접는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    } as never;
    expect(await readInquiryQuota(db, "u1")).toMatchObject({
      quotaRemaining: null,
    });
  });
});
