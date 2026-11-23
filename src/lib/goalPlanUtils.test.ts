// goalPlanUtils.ts 순수 함수 회귀 테스트 — nextPlanTaskStatus(행305).
//
// 대시보드 "오늘의 계획" 체크(✓)/✕ 버튼은 각각 done↔pending, fail↔pending을
// 토글한다(임무 지시 "done 클릭 시 done↔pending, fail 클릭 시 fail↔pending").
// StudyPlanRail.tsx/GoalChecklistRow.tsx는 이 순수 함수로 다음 status만
// 계산하고, 실제 PUT은 goalApi.updateGoalPlanTask({status})가 담당한다.
import { describe, expect, test } from "vitest";
import {
  formatCooldownUnlockLabel,
  formatTodayDateLabel,
  formatTodayDateMeta,
  getTodayShortKeyInWeek,
  getTodayWeekdayLabel,
  getWeekDates,
  nextPlanTaskStatus,
} from "./goalPlanUtils.js";

// 2026-11-22T15:30Z = 서울 11/23(월) 00:30, 로스앤젤레스 11/22(일) 07:30.
const INSTANT = new Date("2026-11-22T15:30:00Z");

describe("goalPlanUtils: 넘겨준 시간대 기준", () => {
  test("주 날짜는 시간대의 오늘이 속한 월~일이다", () => {
    expect(getWeekDates(0, INSTANT, "Asia/Seoul")[0]).toBe("2026-11-23");
    expect(getWeekDates(0, INSTANT, "America/Los_Angeles")[0]).toBe(
      "2026-11-16",
    );
  });

  test("요일 라벨과 주 안의 오늘 키가 시간대를 따른다", () => {
    expect(getTodayWeekdayLabel(INSTANT, "Asia/Seoul")).toBe("월요일");
    expect(getTodayWeekdayLabel(INSTANT, "America/Los_Angeles")).toBe("일요일");
    const la = getWeekDates(0, INSTANT, "America/Los_Angeles");
    expect(getTodayShortKeyInWeek(la, INSTANT, "America/Los_Angeles")).toBe(
      "sun",
    );
  });

  test("헤더 날짜 라벨과 쿨다운 해제 시각이 시간대를 따른다", () => {
    expect(formatTodayDateLabel(INSTANT, "America/Los_Angeles")).toBe(
      "2026.11.22 일요일 기준",
    );
    expect(formatTodayDateMeta(INSTANT, "Asia/Seoul")).toBe("2026.11.23 (월)");
    expect(
      formatCooldownUnlockLabel("2026-11-22T15:30:00Z", "Asia/Seoul"),
    ).toBe("00:30");
    expect(
      formatCooldownUnlockLabel("2026-11-22T15:30:00Z", "America/Los_Angeles"),
    ).toBe("07:30");
  });
});

describe("nextPlanTaskStatus — action:'check'(✓ 버튼)", () => {
  test("pending에서 체크하면 done", () => {
    expect(nextPlanTaskStatus("pending", "check")).toBe("done");
  });
  test("done에서 다시 체크하면 pending(취소)", () => {
    expect(nextPlanTaskStatus("done", "check")).toBe("pending");
  });
  test("fail에서 체크하면 done(미달성 표시를 완료로 덮어씀)", () => {
    expect(nextPlanTaskStatus("fail", "check")).toBe("done");
  });
});

describe("nextPlanTaskStatus — action:'fail'(✕ 버튼)", () => {
  test("pending에서 ✕ 누르면 fail", () => {
    expect(nextPlanTaskStatus("pending", "fail")).toBe("fail");
  });
  test("fail에서 다시 ✕ 누르면 pending(취소)", () => {
    expect(nextPlanTaskStatus("fail", "fail")).toBe("pending");
  });
  test("done에서 ✕ 누르면 fail(완료 표시를 미달성으로 덮어씀)", () => {
    expect(nextPlanTaskStatus("done", "fail")).toBe("fail");
  });
});
