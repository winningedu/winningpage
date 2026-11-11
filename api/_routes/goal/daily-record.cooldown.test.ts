// QA3 행305 — 12시간 쿨다운 순수 로직 검증.
//
// grades.test.ts와 같은 방침: 핸들러 전체(supabase I/O)는 여기서 돌리지 않고,
// 분리 가능한 순수 함수(computeCooldownState/buildSummaryPayload/
// buildTomorrowTargets)만 로컬에서 검증한다. 실제 저장 경로(POST 게이트,
// GET 응답 배선)는 로컬 스택 QA로 확인한다.

import { describe, expect, test } from "vitest";
import {
  buildSummaryPayload,
  buildTomorrowTargets,
  computeCooldownState,
} from "./daily-record.js";

describe("computeCooldownState", () => {
  test("제출 이력이 없으면(null) 잠금 없음", () => {
    const result = computeCooldownState(null, new Date("2026-09-02T12:00:00Z"));
    expect(result).toEqual({
      active: false,
      submittedAt: null,
      unlocksAt: null,
    });
  });

  test("경계 — 11시간 59분 경과는 거부(active:true)", () => {
    const submittedAt = "2026-09-02T00:00:00.000Z";
    const now = new Date("2026-09-02T11:59:00.000Z");
    const result = computeCooldownState(submittedAt, now);
    expect(result.active).toBe(true);
    expect(result.unlocksAt).toBe("2026-09-02T12:00:00.000Z");
  });

  test("경계 — 정확히 12시간 경과는 허용(active:false)", () => {
    const submittedAt = "2026-09-02T00:00:00.000Z";
    const now = new Date("2026-09-02T12:00:00.000Z");
    const result = computeCooldownState(submittedAt, now);
    expect(result.active).toBe(false);
  });

  test("12시간 하고 1초가 더 지나도 당연히 허용", () => {
    const submittedAt = "2026-09-02T00:00:00.000Z";
    const now = new Date("2026-09-02T12:00:01.000Z");
    expect(computeCooldownState(submittedAt, now).active).toBe(false);
  });

  // 실제 달력 모델에서는 자정을 넘기면 record_date(=오늘)가 바뀌어 UNIQUE 키가
  // 다른 행을 가리키지만, 쿨다운은 record_date가 아니라 submitted_at 절대
  // 시각만 본다 — "같은 날 재제출"이든 "다음 날 첫 제출"이든 12시간 규칙은
  // 동일하게 적용된다(설계 문서 §5(c) B안 "22시 제출 시 익일 10시까지 새 기록도
  // 막힘"과 동일 근거, 날짜가 바뀌어도 잠금이 풀리지 않음을 고정).
  test("날짜가 바뀌어도(자정 통과) 12시간 전이면 여전히 거부", () => {
    const submittedAt = "2026-09-02T22:00:00.000Z"; // 전날 22시 제출
    const now = new Date("2026-09-03T09:00:00.000Z"); // 다음날 09시(11시간 경과)
    expect(computeCooldownState(submittedAt, now).active).toBe(true);
  });

  test("날짜가 바뀌고 12시간이 지나면 허용", () => {
    const submittedAt = "2026-09-02T22:00:00.000Z";
    const now = new Date("2026-09-03T10:00:00.000Z"); // 정확히 12시간
    expect(computeCooldownState(submittedAt, now).active).toBe(false);
  });

  test("파싱 불가능한 값은 방어적으로 잠금 없음 처리", () => {
    const result = computeCooldownState("not-a-date", new Date());
    expect(result).toEqual({
      active: false,
      submittedAt: null,
      unlocksAt: null,
    });
  });
});

describe("buildSummaryPayload", () => {
  test("행이 없으면 null", () => {
    expect(buildSummaryPayload(null)).toBeNull();
  });

  test("달성률은 0~100 클램프 + 반올림, 델타는 그대로 통과", () => {
    const row = {
      study_hours: 3,
      target_ideal_hours: 4,
      target_min_hours: 2,
      delta_ideal_susi: 1.2345,
      delta_min_susi: 0.9,
      delta_ideal_jungsi: 0,
      delta_min_jungsi: 0,
    };
    const result = buildSummaryPayload(row);
    expect(result).toEqual({
      studyHours: 3,
      targetIdealHours: 4,
      targetMinHours: 2,
      idealRate: 75, // 3/4 = 75%
      minRate: 100, // 3/2 = 150% → 100 클램프
      deltaIdealSusi: 1.2345,
      deltaMinSusi: 0.9,
      deltaIdealJungsi: 0,
      deltaMinJungsi: 0,
    });
  });

  test("목표 시간이 0이면 달성률 0(분모 0 회피)", () => {
    const row = {
      study_hours: 2,
      target_ideal_hours: 0,
      target_min_hours: 0,
      delta_ideal_susi: 0,
      delta_min_susi: 0,
      delta_ideal_jungsi: 0,
      delta_min_jungsi: 0,
    };
    const result = buildSummaryPayload(row);
    expect(result?.idealRate).toBe(0);
    expect(result?.minRate).toBe(0);
  });
});

describe("buildTomorrowTargets", () => {
  test("study_schedule에서 내일 요일 목표 시간을 찾는다", () => {
    const student = {
      study_schedule: {
        wednesday: { ideal: 5, min: 3 },
        thursday: { ideal: 6, min: 4 },
      },
    };
    // 2026-09-02는 수요일(KST) — 내일은 목요일.
    const result = buildTomorrowTargets(student, "2026-09-02", new Date());
    expect(result).toEqual({ idealHours: 6, minHours: 4 });
  });

  test("학생/스케줄이 없으면 0/0 폴백", () => {
    expect(buildTomorrowTargets(null, "2026-09-02", new Date())).toEqual({
      idealHours: 0,
      minHours: 0,
    });
    expect(
      buildTomorrowTargets({ study_schedule: null }, "2026-09-02", new Date()),
    ).toEqual({ idealHours: 0, minHours: 0 });
  });
});
