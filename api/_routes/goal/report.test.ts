// api/_routes/goal/report.ts 순수 함수 검증 — advice.test.ts와 동일 방침: DB I/O가 있는 핸들러
// 전체(openGoalSession/checkLinkedPair/buildGrowthReport 등)는 여기서 돌리지 않고,
// 분리 가능한 순수 함수(parseStudentIdParam)만 검증한다. studentId 분기의 실제 인증·
// 권한 게이트(본인 조회 200 / 연결된 자녀 200 / 미연결 403 NOT_LINKED)는 로컬 스택
// QA로 확인한다(다른 goal 라우트도 같은 컨벤션 — 핸들러 단위 테스트 파일이 없다).

import { describe, expect, test } from "vitest";
import { parseStudentIdParam } from "./report.js";

describe("parseStudentIdParam — 학부모 자녀 리포트 열람용 studentId 쿼리 파싱", () => {
  test("문자열 값이면 그대로 돌려준다", () => {
    expect(parseStudentIdParam({ studentId: "abc-123" })).toBe("abc-123");
  });

  test("studentId가 없으면(본인 조회 경로) undefined", () => {
    expect(parseStudentIdParam({})).toBeUndefined();
    expect(parseStudentIdParam(undefined)).toBeUndefined();
  });

  test("빈 문자열은 없음으로 접는다", () => {
    expect(parseStudentIdParam({ studentId: "" })).toBeUndefined();
  });

  test("중복 쿼리 키로 배열이 오면 방어적으로 무시한다", () => {
    expect(parseStudentIdParam({ studentId: ["a", "b"] })).toBeUndefined();
  });
});
