import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { readServiceCredits } from "./summary.js";

const PID = "123e4567-e89b-42d3-a456-426614174000";

type SummaryRow = {
  live_count: number;
  quota_total: number | null;
  quota_used: number;
  expires_at: string | null;
  unlimited_period: boolean;
  unlimited_sessions: boolean;
};

const EMPTY: SummaryRow = {
  live_count: 0,
  quota_total: null,
  quota_used: 0,
  expires_at: null,
  unlimited_period: false,
  unlimited_sessions: false,
};

function fakeDb(rows: Record<string, SummaryRow>, failOn?: string) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: async (fn: string, args: { p_program_key: string }) => {
      calls.push({ fn, args });
      if (args.p_program_key === failOn)
        return { data: null, error: { message: "boom" } };
      return { data: [rows[args.p_program_key] ?? EMPTY], error: null };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

describe("readServiceCredits", () => {
  it("6개 서비스를 정해진 순서로 돌려준다", async () => {
    const { db, calls } = fakeDb({});
    const rows = await readServiceCredits(db, PID);
    expect(rows.map((r) => r.programKey)).toEqual([
      "diagnose",
      "target",
      "growth",
      "suhaeng",
      "inquiry",
      "selfeval",
    ]);
    expect(
      calls.every((c) => c.fn === "fn_program_access_grants_summary"),
    ).toBe(true);
  });

  it("이용권이 없는 서비스는 0/0/0 과 만료 없음이다", async () => {
    const { db } = fakeDb({});
    const [diagnose] = await readServiceCredits(db, PID);
    expect(diagnose).toMatchObject({
      label: "학습진단 서비스",
      quotaTotal: 0,
      quotaUsed: 0,
      quotaRemaining: 0,
      expiresAt: null,
    });
  });

  it("총/사용/잔여와 만료를 원장 요약에서 옮긴다", async () => {
    const { db } = fakeDb({
      growth: {
        ...EMPTY,
        live_count: 2,
        quota_total: 5,
        quota_used: 2,
        expires_at: "2027-01-01T00:00:00.000Z",
      },
    });
    const rows = await readServiceCredits(db, PID);
    expect(rows.find((r) => r.programKey === "growth")).toMatchObject({
      quotaTotal: 5,
      quotaUsed: 2,
      quotaRemaining: 3,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("사용이 총량을 넘어도 잔여는 음수가 되지 않는다", async () => {
    const { db } = fakeDb({
      growth: { ...EMPTY, live_count: 1, quota_total: 1, quota_used: 3 },
    });
    const rows = await readServiceCredits(db, PID);
    expect(rows.find((r) => r.programKey === "growth")?.quotaRemaining).toBe(0);
  });

  it("회차 무제한 기간형 이용권은 총량과 잔여가 null 이다", async () => {
    const { db } = fakeDb({
      target: {
        ...EMPTY,
        live_count: 1,
        quota_total: null,
        unlimited_sessions: true,
        expires_at: "2027-01-01T00:00:00.000Z",
      },
    });
    const rows = await readServiceCredits(db, PID);
    expect(rows.find((r) => r.programKey === "target")).toMatchObject({
      periodBased: true,
      quotaTotal: null,
      quotaRemaining: null,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("조회가 실패하면 예외를 던진다", async () => {
    const { db } = fakeDb({}, "growth");
    await expect(readServiceCredits(db, PID)).rejects.toThrow(/growth/);
  });
});
