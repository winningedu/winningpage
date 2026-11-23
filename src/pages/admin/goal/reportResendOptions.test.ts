// api/_routes/goal/admin/resend-report.test.ts 와 같은 기준일 규칙(기간 시작이 아니라
// 그 기간의 자동 발송일)로 후보를 고른다 — TODAY=2026-09-23(수)를 기본으로 쓴다.
//
// QA — 두 번째 인자는 "오늘 날짜"가 아니라 실제 "지금 시각"이다(resend-report.ts와
// 같은 이유 — 자동 발송 시각(daily 22:00·weekly 08:00·monthly 23:00, 전부 KST)
// 전인 당일 후보를 목록에 보여주면, 눌러도 서버가 거부하는 죽은 후보가 된다).
// 순수 YMD 비교만 검증하는 기존 테스트는 그날 발송 시각이 확실히 지난 23:59:59
// KST를 쓰고, 발송 시각 경계 자체를 보는 테스트만 정확한 시·분을 지정한다.

import { describe, expect, test } from "vitest";
import {
  listDailyResendCandidates,
  listMonthlyResendCandidates,
  listResendCandidates,
  listWeeklyResendCandidates,
} from "./reportResendOptions";

function kst(ymd: string, time = "23:59:59"): Date {
  return new Date(`${ymd}T${time}+09:00`);
}

const SEOUL = "Asia/Seoul";
const TODAY = "2026-09-23";
const NOW = kst(TODAY);

describe("listDailyResendCandidates", () => {
  test("오늘부터 13일 전까지 최근순 14개, 라벨은 오늘/어제/N일 전", () => {
    const result = listDailyResendCandidates(SEOUL, NOW);
    expect(result).toHaveLength(14);
    expect(result[0]).toEqual({ periodKey: "2026-09-23", label: "오늘" });
    expect(result[1]).toEqual({ periodKey: "2026-09-22", label: "어제" });
    expect(result[2]).toEqual({ periodKey: "2026-09-21", label: "2일 전" });
    expect(result[13]).toEqual({ periodKey: "2026-09-10", label: "13일 전" });
  });

  test("당일 발송 시각(22:00 KST) 전에는 '오늘'이 후보에서 빠진다", () => {
    const result = listDailyResendCandidates(SEOUL, kst(TODAY, "21:59:00"));
    expect(result).toHaveLength(13);
    expect(result[0]).toEqual({ periodKey: "2026-09-22", label: "어제" });
  });

  test("당일 발송 시각(22:00 KST) 이후에는 '오늘'이 후보에 있다", () => {
    const result = listDailyResendCandidates(SEOUL, kst(TODAY, "22:01:00"));
    expect(result[0]).toEqual({ periodKey: "2026-09-23", label: "오늘" });
  });
});

describe("수신자 시간대 기준 후보", () => {
  const LA = "America/Los_Angeles";

  test("daily — 같은 순간이라도 시간대에 따라 '오늘'이 다르다", () => {
    // 2026-01-11T03:00Z = 서울 12:00 1/11, LA 19:00 1/10(22:00 전).
    const now = new Date("2026-01-11T03:00:00Z");
    expect(listDailyResendCandidates(SEOUL, now)[0]).toEqual({
      periodKey: "2026-01-10",
      label: "어제",
    });
    expect(listDailyResendCandidates(LA, now)[0]).toEqual({
      periodKey: "2026-01-09",
      label: "어제",
    });
  });

  test("daily — LA 현지 22:00(PST=06:00Z) 이후 '오늘'이 후보에 든다", () => {
    const now = new Date("2026-01-11T06:01:00Z");
    expect(listDailyResendCandidates(LA, now)[0]).toEqual({
      periodKey: "2026-01-10",
      label: "오늘",
    });
  });
});

describe("listWeeklyResendCandidates", () => {
  test("이번 주는 발송일(다음 월요일)이 미래라 후보에 없다 — 지난 주부터 시작", () => {
    // 2026-09-23(수)의 이번 주 월요일은 09-21이지만, 그 주 발송일(09-28)은
    // 아직 미래라 후보에 없다.
    const result = listWeeklyResendCandidates(SEOUL, NOW);
    expect(result).toEqual([
      { periodKey: "2026-09-14", label: "지난 주" },
      { periodKey: "2026-09-07", label: "전전 주" },
    ]);
  });

  test("오늘이 월요일이면 발송일이 이미 지난 주가 3개까지 늘어난다", () => {
    // 2026-09-21(월) 기준 3주 전(08-31) 발송일(09-07)까지의 diff가 정확히 14.
    const result = listWeeklyResendCandidates(SEOUL, kst("2026-09-21"));
    expect(result).toEqual([
      { periodKey: "2026-09-14", label: "지난 주" },
      { periodKey: "2026-09-07", label: "전전 주" },
      { periodKey: "2026-08-31", label: "3주 전" },
    ]);
  });

  test("발송 월요일 08:00 KST 전에는 '지난 주'가 후보에서 빠진다", () => {
    // weekStart=09-14 → 발송 월요일 09-21. 오늘이 그 월요일 07:59면 아직 발송 전.
    const result = listWeeklyResendCandidates(
      SEOUL,
      kst("2026-09-21", "07:59:00"),
    );
    expect(result).toEqual([
      { periodKey: "2026-09-07", label: "전전 주" },
      { periodKey: "2026-08-31", label: "3주 전" },
    ]);
  });

  test("발송 월요일 08:00 KST 이후에는 '지난 주'가 후보에 있다", () => {
    const result = listWeeklyResendCandidates(
      SEOUL,
      kst("2026-09-21", "08:01:00"),
    );
    expect(result[0]).toEqual({ periodKey: "2026-09-14", label: "지난 주" });
  });
});

describe("listMonthlyResendCandidates", () => {
  test("달 초(1~14일경)면 지난 달만 후보로 남는다 — 이번 달은 아직 발송 전", () => {
    const result = listMonthlyResendCandidates(SEOUL, kst("2026-09-10"));
    expect(result).toEqual([{ periodKey: "2026-08", label: "지난 달" }]);
  });

  test("달 후반이면 지난 달 발송일도 14일을 넘겨 후보가 비어 있다", () => {
    const result = listMonthlyResendCandidates(SEOUL, NOW);
    expect(result).toEqual([]);
  });

  test("그 달의 마지막 날 발송 시각 이후면 '이번 달'이 후보로 뜬다(발송 당일)", () => {
    const result = listMonthlyResendCandidates(SEOUL, kst("2026-09-30"));
    expect(result).toEqual([{ periodKey: "2026-09", label: "이번 달" }]);
  });

  test("그 달의 마지막 날이어도 발송 시각(23:00 KST) 전이면 '이번 달'이 후보에 없다", () => {
    const result = listMonthlyResendCandidates(
      SEOUL,
      kst("2026-09-30", "22:59:00"),
    );
    expect(result).toEqual([]);
  });
});

describe("listResendCandidates — kind 분기", () => {
  test("kind별로 대응하는 후보 목록 함수를 그대로 위임한다", () => {
    expect(listResendCandidates("daily", SEOUL, NOW)).toEqual(
      listDailyResendCandidates(SEOUL, NOW),
    );
    expect(listResendCandidates("weekly", SEOUL, NOW)).toEqual(
      listWeeklyResendCandidates(SEOUL, NOW),
    );
    expect(listResendCandidates("monthly", SEOUL, NOW)).toEqual(
      listMonthlyResendCandidates(SEOUL, NOW),
    );
  });
});
