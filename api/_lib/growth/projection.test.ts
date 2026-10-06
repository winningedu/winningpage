import { describe, expect, test } from "vitest";
import { projectCompletion } from "./projection.js";
import type { Axis } from "./types.js";

const zero: Record<Axis, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };

describe("projectCompletion", () => {
  test("연결 과제 3건을 완료하면 50% 갈리는 중에서 58.8% 갈리는 중이 된다", () => {
    const result = projectCompletion({
      current: {
        consistency: { linked: 7, total: 14 },
        axisCounts: zero,
        grade: "고2",
      },
      items: [
        { id: "1", linksToTheme: true },
        { id: "2", linksToTheme: true },
        { id: "3", linksToTheme: true },
      ],
    });
    expect(result.consistency.before).toEqual({
      percent: 50,
      verdictLabel: "갈리는 중",
    });
    expect(result.consistency.after).toEqual({
      percent: 58.8,
      verdictLabel: "갈리는 중",
    });
  });

  test("연결 3건과 비연결 3건을 완료하면 10/20 = 50% 로 예측한다", () => {
    const result = projectCompletion({
      current: {
        consistency: { linked: 7, total: 14 },
        axisCounts: zero,
        grade: "고2",
      },
      items: [
        { id: "1", linksToTheme: true },
        { id: "2", linksToTheme: true },
        { id: "3", linksToTheme: true },
        { id: "4", linksToTheme: false },
        { id: "5" },
        { id: "6", linksToTheme: false },
      ],
    });
    expect(result.consistency.after).toEqual({
      percent: 50,
      verdictLabel: "갈리는 중",
    });
  });

  test("한 항목이 C 와 D 두 축 근거를 함께 올린다", () => {
    const result = projectCompletion({
      current: {
        consistency: { linked: 0, total: 0 },
        axisCounts: zero,
        grade: "고2",
      },
      items: [{ id: "1", axes: ["C", "D"] }],
    });
    const count = (axis: Axis) =>
      result.axes.find((a) => a.axis === axis)?.after.count;
    expect(count("C")).toBe(1);
    expect(count("D")).toBe(1);
    expect(count("A")).toBe(0);
  });

  test("D 과제 3건을 완료하면 D 축이 아직 없음에서 확인됨으로 바뀐다", () => {
    const result = projectCompletion({
      current: {
        consistency: { linked: 0, total: 0 },
        axisCounts: zero,
        grade: "고2",
      },
      items: [
        { id: "1", axes: ["D"] },
        { id: "2", axes: ["D"] },
        { id: "3", axes: ["D"] },
      ],
    });
    const d = result.axes.find((a) => a.axis === "D");
    expect(d?.before).toEqual({ count: 0, verdictLabel: "아직 없음" });
    expect(d?.after).toEqual({ count: 3, verdictLabel: "확인됨" });
    expect(result.changedAxes).toContain("D");
  });

  test("완료된 항목은 가정에서 제외한다", () => {
    const result = projectCompletion({
      current: {
        consistency: { linked: 7, total: 14 },
        axisCounts: zero,
        grade: "고2",
      },
      items: [
        { id: "1", axes: ["D"], linksToTheme: true, done: true },
        { id: "2", axes: ["D"], linksToTheme: true, done: true },
      ],
    });
    expect(result.consistency.after).toEqual(result.consistency.before);
    expect(result.axes.every((a) => a.before.count === a.after.count)).toBe(
      true,
    );
    expect(result.changedAxes).toEqual([]);
  });

  test("항목이 없으면 before 와 after 가 같다", () => {
    const result = projectCompletion({
      current: {
        consistency: { linked: 7, total: 14 },
        axisCounts: zero,
        grade: "고1",
      },
      items: [],
    });
    expect(result.consistency.after).toEqual(result.consistency.before);
    expect(result.changedAxes).toEqual([]);
  });

  test("current.consistency 가 total 0 이면 percent 가 null 이다", () => {
    const result = projectCompletion({
      current: {
        consistency: { linked: 0, total: 0 },
        axisCounts: zero,
        grade: "고1",
      },
      items: [],
    });
    expect(result.consistency.before.percent).toBeNull();
    expect(result.consistency.before.verdictLabel).toBeNull();
  });
});
