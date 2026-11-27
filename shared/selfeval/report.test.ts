// 자기평가서 리포트 계약: 쿼리, 본문, 응답 스키마.

import { describe, expect, test } from "vitest";
import {
  reportBody,
  reportQuery,
  reportResponseSchema,
  reportViewSchema,
} from "./report.js";

const ID = "123e4567-e89b-12d3-a456-426614174000";

const view = {
  sessionId: ID,
  finalRevision: 1,
  status: "ready",
  attempts: 1,
  builtAt: "2026-11-23T00:00:00.000Z",
  payload: { version: 1, cover: {} },
};

describe("reportQuery, reportBody", () => {
  test("sessionId 가 uuid 면 받는다", () => {
    expect(reportQuery.parse({ sessionId: ID })).toEqual({ sessionId: ID });
    expect(reportBody.parse({ sessionId: ID })).toEqual({ sessionId: ID });
  });

  test("없거나 uuid 가 아니거나 배열이면 거절한다", () => {
    for (const schema of [reportQuery, reportBody]) {
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ sessionId: "x" }).success).toBe(false);
      expect(schema.safeParse({ sessionId: [ID, ID] }).success).toBe(false);
    }
  });
});

describe("reportViewSchema", () => {
  test("ready 리포트와 payload 가 없는 failed 리포트를 받는다", () => {
    expect(reportViewSchema.parse(view)).toEqual(view);
    const failed = { ...view, status: "failed", payload: null };
    expect(reportViewSchema.parse(failed)).toEqual(failed);
  });

  test("모르는 상태와 payload 가 빠진 본문은 거절한다", () => {
    expect(reportViewSchema.safeParse({ ...view, status: "x" }).success).toBe(
      false,
    );
    const { payload: _p, ...rest } = view;
    expect(reportViewSchema.safeParse(rest).success).toBe(false);
  });
});

describe("reportResponseSchema", () => {
  test("ok 필드 없이 report 와 선택 reused 를 받는다", () => {
    expect(reportResponseSchema.parse({ report: view })).toEqual({
      report: view,
    });
    expect(reportResponseSchema.parse({ reused: true, report: view })).toEqual({
      reused: true,
      report: view,
    });
  });
});
