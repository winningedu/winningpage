import { beforeEach, describe, expect, test, vi } from "vitest";

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (...args: unknown[]) => upsertMock(table, ...args),
    }),
  },
}));

import { saveBasicsProfile } from "./profileApi";

const PAYLOAD = {
  grade: "고2" as const,
  semester: 2 as const,
  career: null,
  department: "통계학과",
  universities: ["가대학교"],
};

beforeEach(() => vi.clearAllMocks());

describe("saveBasicsProfile", () => {
  test("student_profiles 에 본인 행을 profile_id 충돌 기준으로 upsert 한다", async () => {
    upsertMock.mockResolvedValue({ error: null });
    const result = await saveBasicsProfile("u1", PAYLOAD);
    expect(upsertMock).toHaveBeenCalledWith(
      "student_profiles",
      { profile_id: "u1", ...PAYLOAD },
      { onConflict: "profile_id" },
    );
    expect(result).toEqual({ ok: true });
  });

  test("학교 유형과 입학 연도는 건드리지 않는다", async () => {
    upsertMock.mockResolvedValue({ error: null });
    await saveBasicsProfile("u1", PAYLOAD);
    const row = upsertMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(row).not.toHaveProperty("school_type");
    expect(row).not.toHaveProperty("admission_year");
  });

  test("DB 오류는 ok false 로 돌려준다", async () => {
    upsertMock.mockResolvedValue({ error: { message: "x" } });
    expect(await saveBasicsProfile("u1", PAYLOAD)).toEqual({ ok: false });
  });
});
