import { beforeEach, describe, expect, test, vi } from "vitest";

const { upsertMock, updateMock, eqMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (...args: unknown[]) => upsertMock(table, ...args),
      update: (...args: unknown[]) => {
        updateMock(table, ...args);
        return { eq: eqMock };
      },
    }),
  },
}));

import { promoteGrade, saveStudentProfile } from "./profileApi";
import type { ProfileSavePayload } from "./startLogic";

const PAYLOAD: ProfileSavePayload = {
  school_type: "일반고",
  admission_year: 2025,
  grade: "고2",
  semester: 2,
  career: null,
  department: null,
  universities: [],
};

beforeEach(() => vi.clearAllMocks());

describe("saveStudentProfile", () => {
  test("본인 uid 를 profile_id 로 넣어 student_profiles 를 upsert 한다", async () => {
    upsertMock.mockResolvedValue({ error: null });
    await expect(saveStudentProfile("u1", PAYLOAD)).resolves.toEqual({
      ok: true,
    });
    expect(upsertMock).toHaveBeenCalledWith(
      "student_profiles",
      { profile_id: "u1", ...PAYLOAD },
      { onConflict: "profile_id" },
    );
  });

  test("DB 오류는 ok false 로 돌려준다", async () => {
    upsertMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(saveStudentProfile("u1", PAYLOAD)).resolves.toEqual({
      ok: false,
    });
  });
});

describe("promoteGrade", () => {
  test("학년과 학기만 갱신한다", async () => {
    eqMock.mockResolvedValue({ error: null });
    await expect(
      promoteGrade("u1", { grade: 3, semester: 1 }),
    ).resolves.toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith("student_profiles", {
      grade: "고3",
      semester: 1,
    });
    expect(eqMock).toHaveBeenCalledWith("profile_id", "u1");
  });
});
