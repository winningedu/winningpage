// goal_plan_tasks 3상태(pending/done/fail) — 행305 회귀 테스트.
//
// normalizePlanTaskStatus/buildPlanTaskPayload는 api/_lib/goal/repo.ts의 계산 없는
// 매핑 함수라 DB/네트워크 없이 순수 함수처럼 테스트할 수 있다(파일 헤더
// "이 파일에는 계산 로직이 하나도 없다" 그대로).
import { describe, expect, test } from "vitest";
import { buildPlanTaskPayload, normalizePlanTaskStatus } from "./repo.js";

describe("normalizePlanTaskStatus", () => {
  test("done/fail은 그대로 통과한다", () => {
    expect(normalizePlanTaskStatus("done")).toBe("done");
    expect(normalizePlanTaskStatus("fail")).toBe("fail");
  });

  test("pending은 그대로 pending이다", () => {
    expect(normalizePlanTaskStatus("pending")).toBe("pending");
  });

  test("알 수 없는 값·null·undefined는 pending으로 방어한다", () => {
    expect(normalizePlanTaskStatus(null)).toBe("pending");
    expect(normalizePlanTaskStatus(undefined)).toBe("pending");
    expect(normalizePlanTaskStatus("archived")).toBe("pending");
    expect(normalizePlanTaskStatus(1)).toBe("pending");
  });
});

describe("buildPlanTaskPayload — status가 단일 원본, done은 파생값", () => {
  const baseRow = {
    id: 1,
    plan_date: "2026-09-02",
    title: "수학 문제집 20p",
    subject: "math",
    duration_minutes: 60,
    sort_order: 0,
  };

  test("status='done' 행은 done:true를 함께 돌려준다", () => {
    const payload = buildPlanTaskPayload({
      ...baseRow,
      status: "done",
      done: true,
    });
    expect(payload.status).toBe("done");
    expect(payload.done).toBe(true);
  });

  test("status='fail' 행은 done:false다(구 done=true와 무관하게 status가 이긴다)", () => {
    const payload = buildPlanTaskPayload({
      ...baseRow,
      status: "fail",
      done: true,
    });
    expect(payload.status).toBe("fail");
    expect(payload.done).toBe(false);
  });

  test("status='pending' 행은 done:false다", () => {
    const payload = buildPlanTaskPayload({
      ...baseRow,
      status: "pending",
      done: false,
    });
    expect(payload.status).toBe("pending");
    expect(payload.done).toBe(false);
  });

  test("status 컬럼이 아직 없는(백필 전) 행은 pending으로 방어한다", () => {
    const payload = buildPlanTaskPayload({ ...baseRow, done: false });
    expect(payload.status).toBe("pending");
    expect(payload.done).toBe(false);
  });
});
