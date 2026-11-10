import { describe, expect, test } from "vitest";
import { SUBJECT_IDS } from "../../../api/_routes/goal/workbooks";
import {
  getBookDarkBgClass,
  getBookDarkTextClass,
  getBookLightBgClass,
  getSubjectBgClass,
  getSubjectLabel,
  getSubjectStrongClass,
  resolveSubjectId,
  WORKBOOK_SUBJECT_IDS,
} from "./subjectTokens";

const KNOWN_IDS = [
  "korean",
  "math",
  "english",
  "science",
  "social",
  "history",
  "second_lang",
  "etc",
];

// api/goal/workbooks.ts의 서버 화이트리스트(goal_workbooks_subject_check 5종)와
// 클라이언트 WORKBOOK_SUBJECT_IDS가 어긋나면, "나의 노력" 카드가 서버가 거부하는
// 과목(social/history/second_lang)으로 문제집 등록을 시도해 400을 유발한다.
describe("WORKBOOK_SUBJECT_IDS ↔ api/_routes/goal/workbooks.ts SUBJECT_IDS parity", () => {
  test("두 배열이 순서까지 완전히 같다", () => {
    expect(WORKBOOK_SUBJECT_IDS).toEqual(SUBJECT_IDS);
  });

  test("8종 타이머 카탈로그의 social/history/second_lang은 포함하지 않는다", () => {
    expect(WORKBOOK_SUBJECT_IDS).not.toContain("social");
    expect(WORKBOOK_SUBJECT_IDS).not.toContain("history");
    expect(WORKBOOK_SUBJECT_IDS).not.toContain("second_lang");
  });

  test("각 id가 resolveSubjectId/getSubjectLabel로 정상 왕복된다", () => {
    for (const id of WORKBOOK_SUBJECT_IDS) {
      expect(resolveSubjectId(getSubjectLabel(id))).toBe(id);
    }
  });
});

test("과목 색 클래스는 Tailwind가 스캔할 수 있는 리터럴이라 8종 전부 실제 클래스명을 돌려준다", () => {
  for (const id of KNOWN_IDS) {
    expect(getSubjectBgClass(id)).toBe(`bg-goal-subject-${id}`);
    expect(getSubjectStrongClass(id)).toBe(`bg-goal-subjectStrong-${id}`);
  }
  expect(getSubjectStrongClass("없는과목")).toBe("bg-goal-subjectStrong-etc");
});

// "나의 노력" 카드 전용 book 색 — WORKBOOK_SUBJECT_IDS 5종만 실제 토큰이 있고,
// social/history/second_lang(워크북 미지원 3종)은 etc로 접혀야 한다.
test("book 색 클래스는 WORKBOOK_SUBJECT_IDS 5종만 실제 리터럴을 돌려주고 나머지는 etc로 접힌다", () => {
  for (const id of WORKBOOK_SUBJECT_IDS) {
    expect(getBookLightBgClass(id)).toBe(`bg-goal-book-${id}-light`);
    expect(getBookDarkBgClass(id)).toBe(`bg-goal-book-${id}-dark`);
    expect(getBookDarkTextClass(id)).toBe(`text-goal-book-${id}-dark`);
  }

  for (const id of ["social", "history", "second_lang"]) {
    expect(getBookLightBgClass(id)).toBe("bg-goal-book-etc-light");
    expect(getBookDarkBgClass(id)).toBe("bg-goal-book-etc-dark");
    expect(getBookDarkTextClass(id)).toBe("text-goal-book-etc-dark");
  }
});
