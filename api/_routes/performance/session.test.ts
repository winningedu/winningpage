// normalizeBasicInfo의 이전 주제 검증과 저장 형식.

import { describe, expect, test, vi } from "vitest";

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => null,
}));

import { normalizeBasicInfo } from "./session.js";

function basicInfo(previousTopic: string) {
  return {
    gradeLabel: "고1",
    semester: "1학기",
    subjectGroup: "과학",
    subject: "물리",
    careerGoal: "연구원",
    previousTopic,
  };
}

describe("normalizeBasicInfo 이전 주제", () => {
  test("6줄이면 INVALID_BASIC_INFO로 거절한다", () => {
    expect(normalizeBasicInfo(basicInfo("1\n2\n3\n4\n5\n6"))).toEqual({
      ok: false,
      code: "INVALID_BASIC_INFO",
    });
  });

  test("한 줄이 81자이면 INVALID_BASIC_INFO로 거절한다", () => {
    expect(normalizeBasicInfo(basicInfo("가".repeat(81)))).toEqual({
      ok: false,
      code: "INVALID_BASIC_INFO",
    });
  });

  test("3줄은 통과하고 빈 줄을 뺀 채 줄바꿈으로 이어 저장한다", () => {
    const result = normalizeBasicInfo(basicInfo(" a \n\nb\n  \nc "));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columns.previous_topic).toBe("a\nb\nc");
  });

  test("비어 있으면 null로 저장한다", () => {
    const result = normalizeBasicInfo(basicInfo(" \n "));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columns.previous_topic).toBeNull();
  });
});
