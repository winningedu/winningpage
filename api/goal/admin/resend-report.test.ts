// api/goal/admin/resend-report.ts 의 순수 로직만 검증한다(reset-student.js 등
// 다른 goal 어드민 라우트와 같은 방침 — DB I/O·인증 판정이 있는 핸들러 전체는
// 로컬 스택 QA로 확인하고, 여기서는 분리 가능한 순수 함수(기간 검증·응답 조립)
// 만 로컬에서 검증한다).
//
// "2주 이내" 기준일은 기간 시작이 아니라 그 기간이 실제로 자동 발송되는 날짜다
// (api/_lib/goalReportResendPolicy.ts) — daily=그날 자신, weekly=다음 월요일,
// monthly=그 달 마지막 날. 그래서 "이번 주"는 그 주의 월요일이 오기 전까지는
// 절대 재발송 후보가 될 수 없다(자동 발송 자체가 아직 안 일어났다).

import { describe, expect, test } from "vitest";
import { buildResendResponse, validateResendPeriod } from "./resend-report.js";

// validateResendPeriod의 세 번째 인자는 "오늘 날짜"가 아니라 실제 "지금 시각"이다
// (QA — 당일 발송 시각(daily 22:00·weekly 08:00·monthly 23:00, 전부 KST) 전에도
// 재발송이 허용돼 크론 자동 발송과 겹쳐 2통이 나가는 사고가 있었다). 순수 YMD
// 비교만 검증하는 기존 테스트는 그날 발송 시각이 확실히 지난 23:59:59 KST를 쓰고,
// 발송 시각 경계 자체를 보는 테스트만 정확한 시·분을 지정한다.
function kst(ymd: string, time = "23:59:59"): Date {
  return new Date(`${ymd}T${time}+09:00`);
}

const TODAY = "2026-09-23"; // 수요일
const NOW = kst(TODAY);

describe("validateResendPeriod — daily(기준일 = periodKey 자신)", () => {
  test("오늘 날짜는 허용된다(diff 0)", () => {
    expect(validateResendPeriod("daily", TODAY, NOW)).toEqual({
      ok: true,
      startYmd: TODAY,
    });
  });

  test("정확히 14일 전은 경계값으로 허용된다", () => {
    expect(validateResendPeriod("daily", "2026-09-09", NOW)).toEqual({
      ok: true,
      startYmd: "2026-09-09",
    });
  });

  test("15일 전은 400으로 거부된다", () => {
    const result = validateResendPeriod("daily", "2026-09-08", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("2주 이내 기간만 다시 보낼 수 있습니다.");
    }
  });

  test("미래 날짜는 아직 발송 시점이 지나지 않았다는 사유로 거부된다", () => {
    const result = validateResendPeriod("daily", "2026-09-24", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("아직 발송 시점이 지나지 않은 기간입니다.");
    }
  });

  test("형식이 아니면 거부된다", () => {
    const result = validateResendPeriod("daily", "2026/09/10", NOW);
    expect(result.ok).toBe(false);
  });

  test("존재하지 않는 달력 날짜(2월 30일)는 거부된다", () => {
    const result = validateResendPeriod("daily", "2026-02-30", NOW);
    expect(result.ok).toBe(false);
  });
});

describe("validateResendPeriod — weekly(기준일 = 다음 월요일 발송일)", () => {
  test("이번 주는 그 주 월요일(다음 주)에야 발송되므로 아직 거부된다", () => {
    // 2026-09-23(수)의 이번 주 월요일은 09-21 — 발송일은 09-28(다음 월요일)로 미래.
    const result = validateResendPeriod("weekly", "2026-09-21", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("아직 발송 시점이 지나지 않은 기간입니다.");
    }
  });

  test("지난 주(발송일이 이미 지남, 2일 전)는 허용된다", () => {
    // weekStart=09-14 → 발송일 09-21(이미 지남), diff(09-21, 09-23)=2.
    expect(validateResendPeriod("weekly", "2026-09-14", NOW)).toEqual({
      ok: true,
      startYmd: "2026-09-14",
    });
  });

  test("발송일 기준 정확히 14일 전은 경계값으로 허용된다", () => {
    // weekStart=09-07 → 발송일 09-14, diff(09-14, 09-23)=9.
    expect(validateResendPeriod("weekly", "2026-09-07", NOW)).toEqual({
      ok: true,
      startYmd: "2026-09-07",
    });
  });

  test("발송일 기준 14일보다 더 전이면 거부된다", () => {
    // weekStart=08-24 → 발송일 08-31, diff(08-31, 09-23)=23.
    const result = validateResendPeriod("weekly", "2026-08-24", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("2주 이내 기간만 다시 보낼 수 있습니다.");
    }
  });

  test("월요일이 아닌 날짜는 거부된다", () => {
    const result = validateResendPeriod("weekly", "2026-09-22", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe(
        "주간 periodKey는 그 주의 월요일이어야 합니다.",
      );
    }
  });
});

describe("validateResendPeriod — monthly(기준일 = 그 달 마지막 날 발송일)", () => {
  test("이번 달은 마지막 날(말일)에야 발송되므로 아직 거부된다", () => {
    // monthKey=2026-09 → 발송일 09-30, 오늘(09-23) 기준 미래.
    const result = validateResendPeriod("monthly", "2026-09", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("아직 발송 시점이 지나지 않은 기간입니다.");
    }
  });

  test("지난 달(발송일이 이미 지남, 달 초 10일)은 허용된다", () => {
    // monthKey=2026-08 → 발송일 08-31, diff(08-31, 09-10)=10.
    expect(
      validateResendPeriod("monthly", "2026-08", kst("2026-09-10")),
    ).toEqual({
      ok: true,
      startYmd: "2026-08-01",
    });
  });

  test("지난 달 발송일이 14일보다 더 전이면(달 후반) 거부된다", () => {
    // monthKey=2026-08 → 발송일 08-31, diff(08-31, 09-23)=23.
    const result = validateResendPeriod("monthly", "2026-08", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("2주 이내 기간만 다시 보낼 수 있습니다.");
    }
  });

  test("형식이 아니면 거부된다(YYYY-MM 아님)", () => {
    expect(validateResendPeriod("monthly", "2026-9", NOW).ok).toBe(false);
    expect(validateResendPeriod("monthly", "2026-13", NOW).ok).toBe(false);
  });
});

// QA — 자동 발송 시각(daily 22:00·weekly 08:00·monthly 23:00, 전부 KST) 전인
// 당일분을 재발송으로 허용하면, 그 직후 크론이 예정대로 자동 발송해 학부모가
// 2통을 받는다. "날짜"만 보던 예전 규칙은 당일 0시부터 통과시켰다 — 이제는
// 발송 시각 자체를 넘겨야 통과한다.
describe("validateResendPeriod — 발송 시각(KST) 경계", () => {
  test("daily — 당일 21:59 KST는 거부된다(아직 22:00 발송 전)", () => {
    const result = validateResendPeriod("daily", TODAY, kst(TODAY, "21:59:00"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("아직 발송 시점이 지나지 않은 기간입니다.");
    }
  });

  test("daily — 당일 22:01 KST는 허용된다(발송 시각 지남)", () => {
    expect(
      validateResendPeriod("daily", TODAY, kst(TODAY, "22:01:00")),
    ).toEqual({ ok: true, startYmd: TODAY });
  });

  test("weekly — 발송 월요일 07:59 KST는 거부된다(아직 08:00 발송 전)", () => {
    // weekStart=09-21 → 발송 월요일 09-28.
    const result = validateResendPeriod(
      "weekly",
      "2026-09-21",
      kst("2026-09-28", "07:59:00"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("아직 발송 시점이 지나지 않은 기간입니다.");
    }
  });

  test("weekly — 발송 월요일 08:01 KST는 허용된다(발송 시각 지남)", () => {
    expect(
      validateResendPeriod(
        "weekly",
        "2026-09-21",
        kst("2026-09-28", "08:01:00"),
      ),
    ).toEqual({ ok: true, startYmd: "2026-09-21" });
  });

  test("monthly — 말일 22:59 KST는 거부된다(아직 23:00 발송 전)", () => {
    // monthKey=2026-09 → 발송일 09-30.
    const result = validateResendPeriod(
      "monthly",
      "2026-09",
      kst("2026-09-30", "22:59:00"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("아직 발송 시점이 지나지 않은 기간입니다.");
    }
  });

  test("monthly — 말일 23:01 KST는 허용된다(발송 시각 지남)", () => {
    expect(
      validateResendPeriod("monthly", "2026-09", kst("2026-09-30", "23:01:00")),
    ).toEqual({ ok: true, startYmd: "2026-09-01" });
  });
});

describe("validateResendPeriod — kind/periodKey 자체 검증", () => {
  test("kind가 daily/weekly/monthly가 아니면 거부된다", () => {
    expect(validateResendPeriod("yearly", TODAY, NOW).ok).toBe(false);
  });

  test("periodKey가 없으면 거부된다", () => {
    expect(validateResendPeriod("daily", undefined, NOW).ok).toBe(false);
    expect(validateResendPeriod("daily", "", NOW).ok).toBe(false);
  });
});

describe("buildResendResponse", () => {
  test("성공/실패/스킵을 세고 전화번호를 마스킹한다", () => {
    const response = buildResendResponse({
      studentProfileId: "student-1",
      noParent: false,
      outcomes: [
        { parentProfileId: "parent-1", phone: "01011112222", status: "sent" },
        {
          parentProfileId: "parent-2",
          phone: "01033334444",
          status: "failed",
          reason: "발송 실패",
        },
        {
          parentProfileId: "parent-3",
          phone: "01055556666",
          status: "skipped",
        },
      ],
    });

    expect(response).toEqual({
      ok: true,
      sent: 1,
      failed: 1,
      skipped: 1,
      recipients: [
        { parentProfileId: "parent-1", phone: "010****2222", status: "sent" },
        {
          parentProfileId: "parent-2",
          phone: "010****4444",
          status: "failed",
          reason: "발송 실패",
        },
        {
          parentProfileId: "parent-3",
          phone: "010****6666",
          status: "skipped",
        },
      ],
    });
  });

  test("noParent인 경우 recipients가 비어 있고 전부 0이다", () => {
    const response = buildResendResponse({
      studentProfileId: "student-1",
      noParent: true,
      outcomes: [],
    });

    expect(response).toEqual({
      ok: true,
      sent: 0,
      failed: 0,
      skipped: 0,
      recipients: [],
    });
  });
});
