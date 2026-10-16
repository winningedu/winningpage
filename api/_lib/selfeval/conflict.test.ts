import { describe, expect, it } from "vitest";

import { detectConflicts, resolveConflict } from "./conflict.js";
import type { ActivityRecordLike } from "./types.js";

const rec = (
  id: string,
  o: Partial<ActivityRecordLike> = {},
): ActivityRecordLike => ({
  id,
  sourceProgram: "performance",
  status: "confirmed",
  gradeLabel: "고1",
  semester: 1,
  subjectGroup: "수학",
  subject: "수학",
  topic: "표본 조사 설계 방법",
  concept: null,
  method: null,
  result: "응답 30명",
  limitation: null,
  numbers: [],
  sources: [],
  createdAt: "2026-01-01T00:00:00Z",
  ...o,
});

describe("detectConflicts", () => {
  it("같은 제목이고 수치가 다르면 numbers 1행", () => {
    const rows = detectConflicts(rec("a"), [rec("b", { result: "응답 45명" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "numbers", resolved: null });
    expect(rows[0]?.a.activityId).toBe("a");
    expect(rows[0]?.b.activityId).toBe("b");
    expect(rows[0]?.a.text).toContain("30");
    expect(rows[0]?.b.text).toContain("45");
  });
  it("수치가 같으면 충돌 없음(단위 차이는 무시)", () => {
    expect(
      detectConflicts(rec("a"), [rec("b", { result: "응답 30.00 명" })]),
    ).toEqual([]);
  });
  it("제목이 다르면 비교하지 않는다", () => {
    const rows = detectConflicts(rec("a"), [
      rec("b", { topic: "전혀 다른 주제 탐구", result: "응답 99명" }),
    ]);
    expect(rows).toEqual([]);
  });
  it("기간이 다르면 period 행(주를 일로 환산)", () => {
    const rows = detectConflicts(rec("a", { result: "2주 동안 관찰" }), [
      rec("b", { result: "10일 동안 관찰" }),
    ]);
    const p = rows.filter((r) => r.kind === "period");
    expect(p).toHaveLength(1);
  });
  it("2주와 14일은 같은 기간", () => {
    const rows = detectConflicts(rec("a", { result: "2주 동안 관찰" }), [
      rec("b", { result: "14일 동안 관찰" }),
    ]);
    expect(rows.filter((r) => r.kind === "period")).toEqual([]);
  });
  it("보조가 없으면 빈 배열", () => {
    expect(detectConflicts(rec("a"), [])).toEqual([]);
  });
});

describe("resolveConflict", () => {
  const rows = detectConflicts(rec("a"), [rec("b", { result: "응답 45명" })]);
  it("a 를 고르면 a.text 가 resolved", () => {
    const r = resolveConflict(rows, 0, "a");
    expect(r[0]?.resolved).toBe(rows[0]?.a.text);
    expect(rows[0]?.resolved).toBeNull();
  });
  it("b 를 고르면 b.text", () => {
    expect(resolveConflict(rows, 0, "b")[0]?.resolved).toBe(rows[0]?.b.text);
  });
  it("범위 밖 index 는 그대로", () => {
    expect(resolveConflict(rows, 5, "a")).toEqual(rows);
  });
});
