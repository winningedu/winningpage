// api/goal/admin/resend-report.ts 의 순수 로직만 검증한다(reset-student.js 등
// 다른 goal 어드민 라우트와 같은 방침 — DB I/O·인증 판정이 있는 핸들러 전체는
// 로컬 스택 QA로 확인하고, 여기서는 분리 가능한 순수 함수(기간 검증·응답 조립)
// 만 로컬에서 검증한다).

import { describe, expect, test } from "vitest";
import { buildResendResponse, validateResendPeriod } from "./resend-report.js";

const TODAY = "2026-09-23"; // 수요일

describe("validateResendPeriod — daily", () => {
  test("오늘 날짜는 허용된다(diff 0)", () => {
    expect(validateResendPeriod("daily", TODAY, TODAY)).toEqual({
      ok: true,
      startYmd: TODAY,
    });
  });

  test("정확히 14일 전은 경계값으로 허용된다", () => {
    expect(validateResendPeriod("daily", "2026-09-09", TODAY)).toEqual({
      ok: true,
      startYmd: "2026-09-09",
    });
  });

  test("15일 전은 400으로 거부된다", () => {
    const result = validateResendPeriod("daily", "2026-09-08", TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("2주 이내 기간만 다시 보낼 수 있습니다.");
    }
  });

  test("미래 날짜는 거부된다", () => {
    const result = validateResendPeriod("daily", "2026-09-24", TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe("미래 기간은 다시 보낼 수 없습니다.");
    }
  });

  test("형식이 아니면 거부된다", () => {
    const result = validateResendPeriod("daily", "2026/09/10", TODAY);
    expect(result.ok).toBe(false);
  });

  test("존재하지 않는 달력 날짜(2월 30일)는 거부된다", () => {
    const result = validateResendPeriod("daily", "2026-02-30", TODAY);
    expect(result.ok).toBe(false);
  });
});

describe("validateResendPeriod — weekly", () => {
  test("이번 주 월요일은 허용된다", () => {
    // 2026-09-23은 수요일이므로 이번 주 월요일은 2026-09-21
    expect(validateResendPeriod("weekly", "2026-09-21", TODAY)).toEqual({
      ok: true,
      startYmd: "2026-09-21",
    });
  });

  test("월요일이 아닌 날짜는 거부된다", () => {
    const result = validateResendPeriod("weekly", "2026-09-22", TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toBe(
        "주간 periodKey는 그 주의 월요일이어야 합니다.",
      );
    }
  });

  test("14일보다 더 전인 월요일은 거부된다", () => {
    // 2026-09-23 기준 14일 전은 2026-09-09(수) — 그 전 주 월요일(09-07)까지의
    // diff는 16일이라 초과.
    const result = validateResendPeriod("weekly", "2026-09-07", TODAY);
    expect(result.ok).toBe(false);
  });
});

describe("validateResendPeriod — monthly", () => {
  // 월간 periodKey의 "기간 시작"은 그 달 1일이다. 그래서 이번 달이 허용되려면
  // 오늘이 그 달 15일 이전이어야 한다 — 이 자체가 스펙 문구("이번 달·지난달 중
  // 14일 이내인 것")가 말하는 제약이다.
  const EARLY_MONTH_TODAY = "2026-09-10";

  test("이번 달 1일부터 14일 이내(오늘이 달 초)면 허용된다", () => {
    expect(
      validateResendPeriod("monthly", "2026-09", EARLY_MONTH_TODAY),
    ).toEqual({
      ok: true,
      startYmd: "2026-09-01",
    });
  });

  test("오늘이 달 후반(23일)이면 이번 달도 14일을 넘겨 거부된다", () => {
    // 2026-09-01 → TODAY(2026-09-23)까지 diff = 22일
    const result = validateResendPeriod("monthly", "2026-09", TODAY);
    expect(result.ok).toBe(false);
  });

  test("지난 달 1일이 14일보다 더 전이면 거부된다", () => {
    // 2026-08-01 → TODAY(2026-09-23)까지 diff = 53일
    const result = validateResendPeriod("monthly", "2026-08", TODAY);
    expect(result.ok).toBe(false);
  });

  test("형식이 아니면 거부된다(YYYY-MM 아님)", () => {
    expect(validateResendPeriod("monthly", "2026-9", TODAY).ok).toBe(false);
    expect(validateResendPeriod("monthly", "2026-13", TODAY).ok).toBe(false);
  });
});

describe("validateResendPeriod — kind/periodKey 자체 검증", () => {
  test("kind가 daily/weekly/monthly가 아니면 거부된다", () => {
    expect(validateResendPeriod("yearly", TODAY, TODAY).ok).toBe(false);
  });

  test("periodKey가 없으면 거부된다", () => {
    expect(validateResendPeriod("daily", undefined, TODAY).ok).toBe(false);
    expect(validateResendPeriod("daily", "", TODAY).ok).toBe(false);
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
