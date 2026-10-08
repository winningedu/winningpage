// reviewCycle.ts(지식 DB 자료 관리 주기)의 순수 함수 테스트.
import { describe, expect, it } from "vitest";

import { formatLastReviewed, isStaleReview } from "./reviewCycle";

const NOW = new Date("2026-10-07T12:00:00+09:00");

describe("isStaleReview", () => {
  it("검토 기록이 없으면 미검토다", () => {
    expect(isStaleReview(null, NOW, 6)).toBe(true);
    expect(isStaleReview(undefined, NOW, 6)).toBe(true);
    expect(isStaleReview("", NOW, 6)).toBe(true);
  });

  it("N개월 안에 검토했으면 미검토가 아니다", () => {
    expect(isStaleReview("2026-05-01T00:00:00+09:00", NOW, 6)).toBe(false);
    expect(isStaleReview("2026-10-06T00:00:00+09:00", NOW, 3)).toBe(false);
  });

  it("N개월보다 오래됐으면 미검토다", () => {
    expect(isStaleReview("2026-04-06T00:00:00+09:00", NOW, 6)).toBe(true);
    expect(isStaleReview("2025-10-06T00:00:00+09:00", NOW, 12)).toBe(true);
    expect(isStaleReview("2026-07-06T00:00:00+09:00", NOW, 3)).toBe(true);
  });

  it("읽을 수 없는 날짜는 검토 기록이 없는 것으로 본다", () => {
    expect(isStaleReview("not-a-date", NOW, 6)).toBe(true);
  });
});

describe("formatLastReviewed", () => {
  it("기록이 없으면 안내 문구를, 있으면 날짜를 돌려준다", () => {
    expect(formatLastReviewed(null)).toBe("검토 기록 없음");
    expect(formatLastReviewed("2026-09-30T03:00:00Z")).toBe("2026-09-30");
  });
});
