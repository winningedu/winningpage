// 성장설계 세션 규칙 테스트(명세 No.21, 56, 115, 116, 139, 147).
// 순수 함수만 다루므로 DB/네트워크 없이 검증한다.
import { describe, expect, test } from "vitest";
import {
  activeReport,
  careerChanged,
  isExpired,
  openReport,
  REPORT_EXPIRY_DAYS,
  shouldProposePromotion,
} from "./session.js";

describe("REPORT_EXPIRY_DAYS (No.115 기본안)", () => {
  test("기본 만료 일수는 90일이다", () => {
    expect(REPORT_EXPIRY_DAYS).toBe(90);
  });
});

describe("isExpired (No.115, 116, 139)", () => {
  test("마지막 활동 후 90일이 지나면 만료, 89일이면 아직이다", () => {
    expect(isExpired("2026-07-08T00:00:00Z", "2026-10-06T00:00:00Z")).toBe(
      true,
    );
    expect(isExpired("2026-07-09T00:00:00Z", "2026-10-06T00:00:00Z")).toBe(
      false,
    );
  });

  test("기준 일수를 바꿀 수 있다", () => {
    expect(isExpired("2026-10-01T00:00:00Z", "2026-10-06T00:00:00Z", 5)).toBe(
      true,
    );
    expect(isExpired("2026-10-02T00:00:00Z", "2026-10-06T00:00:00Z", 5)).toBe(
      false,
    );
  });
});

describe("activeReport / openReport (No.115, 116)", () => {
  const reports = [
    { id: "a", status: "completed", issuedAt: "2026-03-01T00:00:00Z" },
    { id: "b", status: "completed", issuedAt: "2026-06-01T00:00:00Z" },
    { id: "c", status: "draft", issuedAt: "2026-07-01T00:00:00Z" },
    { id: "d", status: "in_progress", issuedAt: "2026-08-01T00:00:00Z" },
  ];

  test("activeReport 는 가장 최근 completed 1개를 돌려준다", () => {
    expect(activeReport(reports)?.id).toBe("b");
  });

  test("completed 가 없으면 null 이다", () => {
    expect(activeReport([reports[2] as (typeof reports)[number]])).toBeNull();
    expect(activeReport([])).toBeNull();
  });

  test("openReport 는 draft 또는 in_progress 1개를 돌려주고 여럿이면 최신이다", () => {
    expect(openReport(reports)?.id).toBe("d");
    expect(openReport([reports[0] as (typeof reports)[number]])).toBeNull();
  });
});

describe("careerChanged (No.56, 147)", () => {
  test("공백을 정규화한 뒤 다르면 변경이다", () => {
    expect(careerChanged("의사", "약사")).toBe(true);
    expect(careerChanged("컴퓨터  공학자", " 컴퓨터 공학자 ")).toBe(false);
  });

  test("이전 값이 null 이면 변경이 아니다", () => {
    expect(careerChanged(null, "의사")).toBe(false);
  });

  test("현재 값이 비워지면 변경이다", () => {
    expect(careerChanged("의사", null)).toBe(true);
    expect(careerChanged("의사", "   ")).toBe(true);
  });
});

describe("shouldProposePromotion (No.21)", () => {
  test("학년도 전환 3월 1일(KST) 이전엔 제안하지 않고 당일부터 제안한다", () => {
    const profile = {
      grade: 1,
      semester: 2,
      updatedAt: "2026-01-10T00:00:00+09:00",
    } as const;
    expect(
      shouldProposePromotion(profile, "2026-02-28T23:59:59+09:00"),
    ).toEqual({
      propose: false,
      next: null,
    });
    expect(
      shouldProposePromotion(profile, "2026-03-01T00:00:00+09:00"),
    ).toEqual({
      propose: true,
      next: { grade: 2, semester: 1 },
    });
  });

  test("같은 학년도에 갱신했으면 제안하지 않는다", () => {
    const profile = {
      grade: 2,
      semester: 1,
      updatedAt: "2026-03-02T00:00:00+09:00",
    } as const;
    expect(
      shouldProposePromotion(profile, "2027-02-28T00:00:00+09:00").propose,
    ).toBe(false);
  });

  test("고2 는 고3 1학기를 제안하고 고3 은 제안하지 않는다(졸업 처리는 결정 대기)", () => {
    const old = "2026-04-01T00:00:00+09:00";
    expect(
      shouldProposePromotion(
        { grade: 2, semester: 2, updatedAt: old },
        "2027-03-05T00:00:00+09:00",
      ).next,
    ).toEqual({ grade: 3, semester: 1 });
    expect(
      shouldProposePromotion(
        { grade: 3, semester: 2, updatedAt: old },
        "2027-03-05T00:00:00+09:00",
      ),
    ).toEqual({ propose: false, next: null });
  });
});
