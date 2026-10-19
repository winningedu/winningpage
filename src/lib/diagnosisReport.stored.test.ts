// 저장된 리포트(diagnosis_reports.payload) 열람 보정 - gradeRaw 도입 전에 저장된 행은
// payload.student.gradeRaw 가 없어 표지 학년 칸이 비므로, 행의 snapshot 에서 되찾는다.
import { describe, expect, test } from "vitest";
import { withStoredGradeRaw } from "@/lib/diagnosisReport";

const snapshot = {
  profile: { name: null, gradeLevel: "H1", schoolType: null },
};

describe("withStoredGradeRaw", () => {
  test("gradeRaw 가 없는 payload 는 snapshot 의 학년 라벨로 채운다", () => {
    const payload = { student: { grade: "고등학교 1학년" } };
    const result = withStoredGradeRaw(payload, snapshot) as any;
    expect(result.student.gradeRaw).toBe("고등학교 1학년");
    expect(result.student.grade).toBe("고등학교 1학년");
  });

  test("이미 gradeRaw 가 있으면 그대로 둔다", () => {
    const payload = { student: { gradeRaw: "고등학교 3학년" } };
    const result = withStoredGradeRaw(payload, snapshot) as any;
    expect(result.student.gradeRaw).toBe("고등학교 3학년");
  });

  test("snapshot 에 학년이 없으면 gradeRaw 를 만들지 않는다", () => {
    const payload = { student: { grade: "x" } };
    const result = withStoredGradeRaw(payload, {}) as any;
    expect(result.student.gradeRaw).toBeUndefined();
  });
});
