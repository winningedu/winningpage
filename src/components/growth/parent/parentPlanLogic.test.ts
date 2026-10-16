import { describe, expect, it } from "vitest";
import {
  formatDeadline,
  normalizeParentPlan,
  planSummary,
} from "./parentPlanLogic";

const row = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "독서 활동",
  program: "school",
  priority: "required",
  status: "pending",
  deadline: "2026-11-30",
  ...over,
});

describe("normalizeParentPlan", () => {
  it("DB 컬럼 행을 화면용 라벨로 바꾼다", () => {
    expect(normalizeParentPlan([row()])).toEqual([
      {
        id: "p1",
        title: "독서 활동",
        programLabel: "학교",
        priorityLabel: "반드시",
        done: false,
        deadlineLabel: "11월 30일",
      },
    ]);
  });

  it("status 가 done 이면 완료다", () => {
    expect(normalizeParentPlan([row({ status: "done" })])[0]?.done).toBe(true);
  });

  it("마감이 없거나 잘못되면 null 이다", () => {
    expect(
      normalizeParentPlan([row({ deadline: null })])[0]?.deadlineLabel,
    ).toBeNull();
    expect(formatDeadline("내일")).toBeNull();
  });

  it("제목이나 분류가 깨진 행은 버린다", () => {
    const rows = normalizeParentPlan([
      row({ title: "" }),
      row({ id: "p2", program: "etc" }),
      row({ id: "p3", priority: 3 }),
      row({ id: "p4" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["p4"]);
  });
});

describe("planSummary", () => {
  it("전체와 완료 수를 센다", () => {
    const rows = normalizeParentPlan([
      row({ id: "a", status: "done" }),
      row({ id: "b" }),
    ]);
    expect(planSummary(rows)).toEqual({ total: 2, done: 1 });
  });
});
