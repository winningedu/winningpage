// 자기평가서 조회 계약: 쿼리 스키마와 응답 스키마.

import { describe, expect, test } from "vitest";
import { entryResponseSchema, reportsQuery } from "./reports.js";

const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("reportsQuery", () => {
  test("쿼리가 없으면 목록이다", () => {
    expect(reportsQuery.parse({})).toEqual({});
  });

  test("sessionId 가 uuid 면 상세다", () => {
    expect(reportsQuery.parse({ sessionId: ID })).toEqual({ sessionId: ID });
  });

  test("uuid 가 아니거나 배열이면 거절한다", () => {
    expect(reportsQuery.safeParse({ sessionId: "x" }).success).toBe(false);
    expect(reportsQuery.safeParse({ sessionId: [ID, ID] }).success).toBe(false);
  });
});

describe("entryResponseSchema", () => {
  test("ok 필드 없이 진입 정보와 목록을 받는다", () => {
    const body = {
      entry: {
        quota: null,
        allowed: false,
        activityCount: 0,
        openSession: null,
        growth: null,
        profile: null,
        replyResent: 0,
        academicYearDefault: 2026,
        timeZone: "Asia/Seoul",
      },
      sessions: [],
    };
    expect(entryResponseSchema.parse(body)).toEqual(body);
  });
});
