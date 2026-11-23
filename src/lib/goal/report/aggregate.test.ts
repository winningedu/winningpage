// aggregate.ts 회귀 테스트.
//
// 이 파일은 손으로 만든 최소 픽스처만 쓴다 — DB도 브라우저도 필요 없다(aggregate.ts가
// supabase를 전혀 모르는 순수 함수 모음이기 때문). 리포트 실배선(I단계)에서 가장 위험한
// 지점 4가지를 우선 커버한다: 완성도 재정규화(과제 0건), 시간대 버킷(심야 0~6 경계),
// 달성률 분모(effectiveWindow), 코호트 백분위(표본 부족 판정).

import { expect, test } from "vitest";

import {
  bucketTimeSlots,
  classifyJeongsiZone,
  classifyNaesinZone,
  computeAchievementRate,
  computeAdmissionDelta,
  computeCohortPercentile,
  computeCompletionScore,
  computeConditionBreakdown,
  computeCoreItems,
  computeDistraction,
  computeEffectiveWindow,
  computeStudyHours,
  computeSubjectShare,
  deriveGradeSystem,
  diffDaysInclusive,
  lastDayOfMonthYmd,
  percentileToGrade,
  resolveMonthlyPeriod,
  resolveWeeklyPeriod,
  sumHoursByProfile,
  summarizePlanTaskCompletion,
} from "./aggregate.ts";

// ---------------------------------------------------------------------------
// 기간 경계 — 순수 달력
// ---------------------------------------------------------------------------

test("resolveWeeklyPeriod — 임의 요일을 그 주 월요일로 정규화", () => {
  const period = resolveWeeklyPeriod("2026-08-05", "2026-08-01"); // 2026-08-05는 수요일
  expect(period.start).toBe("2026-08-03"); // 월요일
  expect(period.end).toBe("2026-08-09"); // 일요일
  expect(period.periodKey).toBe("2026-08-03");
});

test("resolveWeeklyPeriod — period 생략 시 오늘 기준 이번 주", () => {
  const period = resolveWeeklyPeriod(undefined, "2026-08-13"); // 목요일
  expect(period.start).toBe("2026-08-10");
  expect(period.end).toBe("2026-08-16");
});

test("resolveMonthlyPeriod — YYYY-MM 경계(윤년 2월 포함)", () => {
  const period = resolveMonthlyPeriod("2028-02", "2026-08-13");
  expect(period.start).toBe("2028-02-01");
  expect(period.end).toBe("2028-02-29"); // 2028은 윤년
});

test("lastDayOfMonthYmd — 평년 2월", () => {
  expect(lastDayOfMonthYmd("2026-02")).toBe("2026-02-28");
});

test("diffDaysInclusive — 양끝 포함 일수, 역순이면 0", () => {
  expect(diffDaysInclusive("2026-08-03", "2026-08-09")).toBe(7);
  expect(diffDaysInclusive("2026-08-09", "2026-08-03")).toBe(0);
});

// ---------------------------------------------------------------------------
// computeEffectiveWindow — 달성률/완성도 분모
// ---------------------------------------------------------------------------

test("computeEffectiveWindow — actual_start_date가 기간 시작보다 늦으면 그 날부터", () => {
  const window = computeEffectiveWindow({
    periodStart: "2026-08-03",
    periodEnd: "2026-08-09",
    actualStartDate: "2026-08-06",
    nowYmd: "2026-08-09",
  });
  expect(window.start).toBe("2026-08-06");
  expect(window.end).toBe("2026-08-09");
  expect(window.elapsedDays).toBe(4);
});

test("computeEffectiveWindow — 기간이 통째로 미래면 elapsedDays=0", () => {
  const window = computeEffectiveWindow({
    periodStart: "2026-09-01",
    periodEnd: "2026-09-07",
    actualStartDate: "2026-08-01",
    nowYmd: "2026-08-13",
  });
  expect(window.start).toBe(null);
  expect(window.elapsedDays).toBe(0);
});

test("computeEffectiveWindow — actual_start_date 없으면 기간 시작 그대로", () => {
  const window = computeEffectiveWindow({
    periodStart: "2026-08-03",
    periodEnd: "2026-08-09",
    actualStartDate: null,
    nowYmd: "2026-08-05",
  });
  expect(window.start).toBe("2026-08-03");
  expect(window.end).toBe("2026-08-05");
  expect(window.elapsedDays).toBe(3);
});

// ---------------------------------------------------------------------------
// D1/D2 — 공부 시간 · 달성률
// ---------------------------------------------------------------------------

test("computeStudyHours — study_hours 합", () => {
  const hours = computeStudyHours([
    { study_hours: 3.5 },
    { study_hours: "2.0" },
    { study_hours: null },
  ]);
  expect(hours).toBe(5.5);
});

test("computeAchievementRate — 요일별 목표 합 대비 % (일요일 제외)", () => {
  const student = {
    study_schedule: {
      monday: { ideal: 4, min: 3 },
      tuesday: { ideal: 4, min: 3 },
      wednesday: { ideal: 4, min: 3 },
      thursday: { ideal: 4, min: 3 },
      friday: { ideal: 4, min: 3 },
      saturday: { ideal: 4, min: 3 },
      sunday: { ideal: 10, min: 10 }, // 분모에서 반드시 제외돼야 한다
    },
  };
  const effectiveWindow = {
    start: "2026-08-03",
    end: "2026-08-04",
    elapsedDays: 2,
  }; // 월·화만
  const { idealRate, minRate, idealTargetHours } = computeAchievementRate({
    totalStudyHours: 4,
    student,
    effectiveWindow,
  });
  expect(idealTargetHours).toBe(8); // 월+화 이상 목표 4+4
  expect(idealRate).toBe(50); // 4 / 8 * 100
  expect(minRate).toBe(67); // 4 / 6 * 100 = 66.67 → round0
});

test("computeAchievementRate — effectiveWindow 없으면 0%", () => {
  const result = computeAchievementRate({
    totalStudyHours: 10,
    student: { study_schedule: {} },
    effectiveWindow: { start: null, end: null, elapsedDays: 0 },
  });
  expect(result).toEqual({
    idealRate: 0,
    minRate: 0,
    idealTargetHours: 0,
    minTargetHours: 0,
  });
});

// ---------------------------------------------------------------------------
// D3 — 완성도(재정규화 핵심 케이스)
// ---------------------------------------------------------------------------

test("computeCompletionScore — 과제 0건이면 0.5/0.3 → 0.625/0.375 재정규화", () => {
  // achievementAxis=100, consistencyAxis=100(3/3일) → 재정규화 없으면 80점, 있으면 100점.
  const score = computeCompletionScore({
    idealRate: 100,
    recordDays: 3,
    elapsedDays: 3,
    doneTasks: 0,
    totalTasks: 0,
  });
  expect(score).toBe(100);
});

test("computeCompletionScore — 과제 있으면 0.5/0.3/0.2 3축 가중", () => {
  // achievement=50, consistency=50, plan=50 → 0.5*50+0.3*50+0.2*50 = 50
  const score = computeCompletionScore({
    idealRate: 50,
    recordDays: 1,
    elapsedDays: 2,
    doneTasks: 1,
    totalTasks: 2,
  });
  expect(score).toBe(50);
});

test("computeCompletionScore — idealRate가 100 넘어도 achievementAxis는 100으로 clamp", () => {
  const score = computeCompletionScore({
    idealRate: 150,
    recordDays: 2,
    elapsedDays: 2,
    doneTasks: 2,
    totalTasks: 2,
  });
  expect(score).toBe(100); // 0.5*100 + 0.3*100 + 0.2*100
});

// ---------------------------------------------------------------------------
// D3 — 계획 과제 달성/미달성/미기록 집계(행305, status 3상태)
// ---------------------------------------------------------------------------

test("summarizePlanTaskCompletion — done/fail/pending 3종을 센다", () => {
  const summary = summarizePlanTaskCompletion([
    { status: "done" },
    { status: "done" },
    { status: "fail" },
    { status: "pending" },
  ]);
  expect(summary).toEqual({ done: 2, fail: 1, pending: 1, total: 4 });
});

test("summarizePlanTaskCompletion — status가 없거나 알 수 없는 값은 pending으로 방어", () => {
  const summary = summarizePlanTaskCompletion([
    {},
    { status: "archived" },
    { status: null },
  ]);
  expect(summary).toEqual({ done: 0, fail: 0, pending: 3, total: 3 });
});

test("summarizePlanTaskCompletion — 빈 배열은 전부 0", () => {
  expect(summarizePlanTaskCompletion([])).toEqual({
    done: 0,
    fail: 0,
    pending: 0,
    total: 0,
  });
});

// ---------------------------------------------------------------------------
// D4 — 코호트 백분위
// ---------------------------------------------------------------------------

test("computeCohortPercentile — 코호트 2명 미만이면 표본 부족", () => {
  const result = computeCohortPercentile("me", [
    { profileId: "me", hours: 10 },
  ]);
  expect(result.insufficientSample).toBe(true);
  expect(result.topPercent).toBe(null);
});

test("computeCohortPercentile — 5명 중 1등이면 상위 20%", () => {
  const cohort = [
    { profileId: "me", hours: 20 },
    { profileId: "a", hours: 15 },
    { profileId: "b", hours: 10 },
    { profileId: "c", hours: 5 },
    { profileId: "d", hours: 1 },
  ];
  const result = computeCohortPercentile("me", cohort);
  expect(result.rank).toBe(1);
  expect(result.topPercent).toBe(20);
});

test("computeCohortPercentile — 동점이면 더 나은 학생 수 기준으로 순위(공동 1위 둘 다 rank=1)", () => {
  const cohort = [
    { profileId: "me", hours: 10 },
    { profileId: "a", hours: 10 },
    { profileId: "b", hours: 3 },
  ];
  const result = computeCohortPercentile("me", cohort);
  expect(result.rank).toBe(1); // 나보다 큰 값이 없다(동점 a는 "더 크다"가 아니다)
});

test("sumHoursByProfile — profile_id별 합산", () => {
  const rows = [
    { profile_id: "a", study_hours: 1 },
    { profile_id: "a", study_hours: 2 },
    { profile_id: "b", study_hours: 3 },
  ];
  const result = sumHoursByProfile(rows);
  expect(result.sort((x, y) => x.profileId.localeCompare(y.profileId))).toEqual(
    [
      { profileId: "a", hours: 3 },
      { profileId: "b", hours: 3 },
    ],
  );
});

// ---------------------------------------------------------------------------
// D6 — 컨디션 4종 항상 노출
// ---------------------------------------------------------------------------

test("computeConditionBreakdown — 기록이 없는 컨디션도 0일로 노출", () => {
  const { listRows, tiles } = computeConditionBreakdown([
    { body_condition: "great", study_hours: 5 },
  ]);
  expect(listRows.length).toBe(4);
  expect(listRows.find((r) => r.label === "아주 좋음")?.value).toBe("1일");
  expect(listRows.find((r) => r.label === "보통")?.value).toBe("0일");
  expect(tiles.find((t) => t.label === "아주 좋음")?.avg).toBe("평균 5h");
  expect(tiles.find((t) => t.label === "보통")?.avg).toBe("평균 0h");
});

// ---------------------------------------------------------------------------
// D7 — 과목별 학습 비중
// ---------------------------------------------------------------------------

test("computeSubjectShare — 세션 없으면 empty", () => {
  expect(computeSubjectShare([])).toEqual({ empty: true, rows: [] });
});

test("computeSubjectShare — 과목별 비중 %(합 100 근처)", () => {
  const result = computeSubjectShare([
    { subject: "math", duration_seconds: 3600 },
    { subject: "korean", duration_seconds: 3600 },
    { subject: "weird-code", duration_seconds: 1800 }, // 미지 코드는 '기타'
  ]);
  if (result.empty) throw new Error("빈 결과가 아니어야 한다");
  const total = result.rows.reduce((s, r) => s + r.value, 0);
  expect(total >= 99 && total <= 101).toBeTruthy();
  expect(result.rows.some((r) => r.label === "기타")).toBeTruthy();
});

// ---------------------------------------------------------------------------
// D8 — 시간대별 학습 효율(심야 0~6 경계)
// ---------------------------------------------------------------------------

test("bucketTimeSlots — 자정 직후(KST 01시) 세션은 심야 0~6 버킷", () => {
  const buckets = bucketTimeSlots(
    [{ started_at: "2026-08-03T16:30:00.000Z", duration_seconds: 3600 }],
    "Asia/Seoul",
  ); // UTC 16:30 = KST 01:30
  const midnight = buckets.find((b) => b.label === "심야 0~6");
  expect(midnight?.value).toBe(1);
});

test("bucketTimeSlots — KST 21시는 오후 9~12 버킷, 경계(24시)는 넘치지 않는다", () => {
  const buckets = bucketTimeSlots(
    [{ started_at: "2026-08-03T12:00:00.000Z", duration_seconds: 1800 }],
    "Asia/Seoul",
  ); // UTC 12:00 = KST 21:00
  const late = buckets.find((b) => b.label === "오후 9~12");
  expect(late?.value).toBe(0.5);
  expect(buckets.reduce((s, b) => s + b.value, 0)).toBe(0.5);
});

test("bucketTimeSlots: 넘겨준 시간대의 시각으로 버킷을 정한다", () => {
  // UTC 12:00 = 서울 21:00(오후 9~12), 로스앤젤레스 04:00(심야 0~6)
  const sessions = [
    { started_at: "2026-08-03T12:00:00.000Z", duration_seconds: 3600 },
  ];
  const la = bucketTimeSlots(sessions, "America/Los_Angeles");
  expect(la.find((b) => b.label === "심야 0~6")?.value).toBe(1);
  expect(la.find((b) => b.label === "오후 9~12")?.value).toBe(0);
});

// ---------------------------------------------------------------------------
// 방해요인/완료항목 카운트
// ---------------------------------------------------------------------------

test('computeDistraction — "없었음"은 차트에서 제외', () => {
  const rows = computeDistraction([
    { reasons: ["스마트폰", "없었음"] },
    { reasons: ["스마트폰"] },
  ]);
  expect(rows.length).toBe(1);
  expect(rows[0]!.label).toBe("스마트폰");
  expect(rows[0]!.value).toBe(2);
});

test("computeCoreItems — 내림차순 정렬", () => {
  const rows = computeCoreItems([
    { tasks: ["오답 정리"] },
    { tasks: ["오답 정리", "개념 학습"] },
  ]);
  expect(rows[0]!.label).toBe("오답 정리");
  expect(rows[0]!.value).toBe(2);
});

// ---------------------------------------------------------------------------
// D12 — 등급제 표기(2028 학년도 경계)
// ---------------------------------------------------------------------------

test("deriveGradeSystem — 고3(2026-08-13 기준)은 2027년 3월 입학 → 9등급제(경계값 직전)", () => {
  // 2026-08-13 기준 고3 → 2026학년도 고3 → 2026학년도 11월 수능 → 2027년 3월 입학(2027학년도
  // 대입, 2028 미만이라 9등급제).
  expect(deriveGradeSystem("고3", "2026-08-13")).toBe("9등급제");
});

test("deriveGradeSystem — 고3(2027-08-13 기준)은 2028년 3월 입학 → 5등급제(경계값)", () => {
  expect(deriveGradeSystem("고3", "2027-08-13")).toBe("5등급제");
});

test("deriveGradeSystem — 고1(2026-08-13 기준)은 2029학년도 고3 → 2029년 입학 → 5등급제", () => {
  // 고1 → 2년 뒤 2028학년도에 고3 → 2028년 11월 수능 → 2029년 3월 입학(2029학년도 대입,
  // ≥2028이므로 5등급제).
  expect(deriveGradeSystem("고1", "2026-08-13")).toBe("5등급제");
});

test("deriveGradeSystem — grade가 고1~3 패턴이 아니면(중학생 등) 9등급제 기본값", () => {
  expect(deriveGradeSystem("중3", "2030-01-01")).toBe("9등급제");
});

// ---------------------------------------------------------------------------
// 학습방향 리포트 — 구간 분류 · 백분위 환산
// ---------------------------------------------------------------------------

test("classifyNaesinZone — 등급은 낮을수록 우세, 컷 이내면 강점 유지", () => {
  expect(classifyNaesinZone(1.5, 2.0, 3.0)).toBe("strong");
  expect(classifyNaesinZone(2.5, 2.0, 3.0)).toBe("improve");
  expect(classifyNaesinZone(3.5, 2.0, 3.0)).toBe("focus");
});

test("classifyJeongsiZone — 백분위는 높을수록 우세, 부등호 방향이 내신과 반대", () => {
  expect(classifyJeongsiZone(95, 90, 70)).toBe("strong");
  expect(classifyJeongsiZone(80, 90, 70)).toBe("improve");
  expect(classifyJeongsiZone(50, 90, 70)).toBe("focus");
});

test("percentileToGrade — GRADE_PERCENTILE 역조회", () => {
  expect(percentileToGrade(98)).toBe(1);
  expect(percentileToGrade(50)).toBe(5);
});

// ---------------------------------------------------------------------------
// 합격 가능성 델타
// ---------------------------------------------------------------------------

test("computeAdmissionDelta — 상승/하락 방향과 절대값", () => {
  const targets = {
    ideal: { university: "서울대학교", department: "경영학과" },
    min: { university: "건국대학교", department: "경영학과" },
  };
  const result = computeAdmissionDelta({
    targets,
    startLog: {
      ideal_susi: 20,
      ideal_jungsi: 15,
      min_susi: 30,
      min_jungsi: 25,
    },
    endLog: {
      ideal_susi: 22.5,
      ideal_jungsi: 14,
      min_susi: 30,
      min_jungsi: 25,
    },
  });
  expect(result.upper.university).toBe("서울대학교 경영학과");
  expect(result.upper.susi.delta.direction).toBe("up");
  expect(result.upper.susi.delta.value).toBe("2.50%");
  expect(result.upper.jeongsi.delta.direction).toBe("down");
  expect(result.upper.jeongsi.rate).toBe(14);
});
