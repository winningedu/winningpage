import { describe, expect, test } from "vitest";
import {
  BODY_CONDITIONS,
  CONDITION_LABELS,
  REASON_LABELS,
  TASK_LABELS,
} from "../../../api/_routes/goal/daily-record";
import {
  CONDITION_OPTIONS,
  DISTURBANCE_OPTIONS,
  STUDY_ITEM_OPTIONS,
} from "./studyRecordOptions";

// api/_routes/goal/daily-record.ts 의 화이트리스트(코드값 → 한글 라벨)가 클라이언트
// studyRecordOptions.ts 의 옵션과 글자 단위로 어긋나면, bonusV2.ts의 태그 가산
// (TASK_NAESIN/TASK_MOCK_EXAM)이 조용히 0배로 떨어진다 — 그 계약을 지킨다.

describe("studyRecordOptions ↔ api/goal/daily-record 화이트리스트 패리티", () => {
  test("STUDY_ITEM_OPTIONS(value→label)가 TASK_LABELS와 완전히 같다", () => {
    const expected = Object.fromEntries(
      STUDY_ITEM_OPTIONS.map((o) => [o.value, o.label]),
    );
    expect(TASK_LABELS).toEqual(expected);
  });

  test("DISTURBANCE_OPTIONS(value→label)가 REASON_LABELS와 완전히 같다", () => {
    const expected = Object.fromEntries(
      DISTURBANCE_OPTIONS.map((o) => [o.value, o.label]),
    );
    expect(REASON_LABELS).toEqual(expected);
  });

  test("CONDITION_OPTIONS의 value 집합이 BODY_CONDITIONS와 완전히 같다", () => {
    const expected = new Set(CONDITION_OPTIONS.map((o) => o.value));
    expect(BODY_CONDITIONS).toEqual(expected);
  });

  // 일간 보고서 알림톡이 이 라벨을 학부모 문자에 그대로 싣는다 — 어긋나면
  // 'normal' 같은 코드값이 발송된다(api/cron/daily-report.ts).
  test("CONDITION_OPTIONS(value→label)가 CONDITION_LABELS와 완전히 같다", () => {
    const expected = Object.fromEntries(
      CONDITION_OPTIONS.map((o) => [o.value, o.label]),
    );
    expect(CONDITION_LABELS).toEqual(expected);
  });
});
