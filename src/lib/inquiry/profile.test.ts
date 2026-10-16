import { beforeEach, describe, expect, test, vi } from "vitest";

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ upsert: upsertMock }) },
}));

import { upsertStudentProfile } from "./profile";

beforeEach(() => upsertMock.mockReset());

describe("upsertStudentProfile", () => {
  test("profile_id 기준으로 학년, 학기, 진로를 upsert 한다", async () => {
    upsertMock.mockResolvedValue({ error: null });
    const result = await upsertStudentProfile("u1", {
      gradeLabel: "고2",
      semester: 2,
      career: "수의예과",
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledWith(
      {
        profile_id: "u1",
        grade: "고2",
        semester: 2,
        career: "수의예과",
        updated_by: "u1",
      },
      { onConflict: "profile_id" },
    );
  });

  test("DB 오류면 ok false 를 돌려주고 던지지 않는다", async () => {
    upsertMock.mockResolvedValue({ error: { message: "x" } });
    const result = await upsertStudentProfile("u1", {
      gradeLabel: "고1",
      semester: 1,
      career: "교사",
    });
    expect(result).toEqual({ ok: false });
  });
});
