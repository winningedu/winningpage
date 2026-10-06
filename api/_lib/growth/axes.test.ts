// 성장설계 5축 판정 모듈 테스트(명세 No.64~72, 103, 152).
import { describe, expect, test } from "vitest";
import {
  AXIS_REQUIREMENTS,
  AXIS_TO_UNIVERSITY_FACTORS,
  countAxisEvidence,
  evaluateAxes,
  judgeAxis,
  projectAxes,
  shortfalls,
  weakestAxis,
} from "./axes.js";

describe("AXIS_REQUIREMENTS (No.66~70)", () => {
  test("학년별 축별 요구 건수 15개가 명세와 같다", () => {
    const required = (g: "고1" | "고2" | "고3") =>
      (["A", "B", "C", "D", "E"] as const).map(
        (a) => AXIS_REQUIREMENTS[g][a].required,
      );
    expect(required("고1")).toEqual([3, 1, 2, 2, 1]);
    expect(required("고2")).toEqual([5, 4, 2, 1, 2]);
    expect(required("고3")).toEqual([3, 6, 2, 1, 2]);
  });
});

describe("countAxisEvidence (No.64, No.152)", () => {
  test("같은 활동이 같은 축에 여러 번 나와도 그 축에서는 1건이다", () => {
    const r = countAxisEvidence([
      { activityId: "a1", axis: "A" },
      { activityId: "a1", axis: "A" },
    ]);
    expect(r.A).toEqual({ count: 1, activityIds: ["a1"] });
  });

  test("한 활동이 여러 축의 근거면 축마다 1건씩 센다", () => {
    const r = countAxisEvidence([
      { activityId: "a1", axis: "A" },
      { activityId: "a1", axis: "C" },
    ]);
    expect(r.A.count).toBe(1);
    expect(r.C.count).toBe(1);
    expect(r.B).toEqual({ count: 0, activityIds: [] });
  });
});

describe("judgeAxis (No.65)", () => {
  test("0건은 none, required 이상은 confirmed, 그 사이는 caution", () => {
    expect(judgeAxis(0, 3)).toBe("none");
    expect(judgeAxis(1, 3)).toBe("caution");
    expect(judgeAxis(2, 3)).toBe("caution");
    expect(judgeAxis(3, 3)).toBe("confirmed");
    expect(judgeAxis(4, 3)).toBe("confirmed");
  });

  test("required 가 1이면 caution 구간이 없다", () => {
    expect(judgeAxis(0, 1)).toBe("none");
    expect(judgeAxis(1, 1)).toBe("confirmed");
  });
});

describe("evaluateAxes / shortfalls (No.71)", () => {
  const ev = (activityId: string, axis: "A" | "B" | "C" | "D" | "E") => ({
    activityId,
    axis,
  });

  test("다섯 축 각각 건수, 판정, 한글 라벨, 지침을 담는다", () => {
    const r = evaluateAxes("고1", [
      ev("a1", "A"),
      ev("a2", "A"),
      ev("a3", "A"),
      ev("a1", "D"),
    ]);
    expect(r.map((x) => x.axis)).toEqual(["A", "B", "C", "D", "E"]);
    const a = r[0];
    expect(a).toMatchObject({
      name: "학업역량",
      count: 3,
      required: 3,
      verdict: "confirmed",
      verdictLabel: "확인됨",
      guideline: "개념을 정확히 쓴 기록 3건",
      optional: false,
      activityIds: ["a1", "a2", "a3"],
    });
    expect(r[3]).toMatchObject({ verdict: "caution", verdictLabel: "주의" });
    expect(r[2]).toMatchObject({ verdict: "none", verdictLabel: "아직 없음" });
  });

  test("gradeFilterIds 가 있으면 그 활동만 센다", () => {
    const r = evaluateAxes("고1", [ev("a1", "A"), ev("a2", "A")], {
      gradeFilterIds: ["a2"],
    });
    expect(r[0]?.count).toBe(1);
    expect(r[0]?.activityIds).toEqual(["a2"]);
  });

  test("B 고1 은 optional 이라 비어 있어도 미달 목록에서 빠진다", () => {
    const r = evaluateAxes("고1", []);
    expect(r[1]?.optional).toBe(true);
    expect(shortfalls(r).map((x) => x.axis)).not.toContain("B");
  });

  test("미달 축은 부족 건수가 큰 순으로 정렬되고 confirmed 는 제외한다", () => {
    const r = evaluateAxes("고2", [
      ev("a1", "A"),
      ev("a2", "A"),
      ev("a3", "A"),
      ev("a4", "A"),
      ev("a5", "A"),
      ev("b1", "B"),
      ev("c1", "C"),
      ev("c2", "C"),
    ]);
    // A 확인됨, C 확인됨, B 부족 3, D 부족 1, E 부족 2
    expect(shortfalls(r).map((x) => x.axis)).toEqual(["B", "E", "D"]);
  });
});

describe("weakestAxis", () => {
  test("count/required 비율이 가장 낮은 축을 고른다", () => {
    const r = evaluateAxes("고2", [
      { activityId: "a1", axis: "A" },
      { activityId: "a2", axis: "A" },
      { activityId: "b1", axis: "B" },
      { activityId: "c1", axis: "C" },
      { activityId: "d1", axis: "D" },
      { activityId: "e1", axis: "E" },
    ]);
    // A 2/5=0.4, B 1/4=0.25, C 0.5, D 1, E 0.5
    expect(weakestAxis(r)?.axis).toBe("B");
  });

  test("동률이면 D 를 먼저 고른다", () => {
    expect(weakestAxis(evaluateAxes("고2", []))?.axis).toBe("D");
  });

  test("D 가 없는 동률은 알파벳 순이다", () => {
    const r = evaluateAxes("고2", []).filter((x) => x.axis !== "D");
    expect(weakestAxis(r)?.axis).toBe("A");
  });
});

describe("AXIS_TO_UNIVERSITY_FACTORS (No.72)", () => {
  test("시안 2부 머리 표 문구와 같다", () => {
    expect(AXIS_TO_UNIVERSITY_FACTORS.A).toEqual({
      factor: "학업역량",
      detail: "학업성취도, 학업태도",
    });
    expect(AXIS_TO_UNIVERSITY_FACTORS.B).toEqual({
      factor: "진로역량",
      detail: "계열 관련 교과 이수 노력, 계열 관련 교과 성취도",
    });
    expect(AXIS_TO_UNIVERSITY_FACTORS.C.detail).toBe(
      "학업역량의 탐구력, 진로역량의 진로 탐색 활동과 경험",
    );
    expect(AXIS_TO_UNIVERSITY_FACTORS.D).toEqual({
      factor: "공동체역량",
      detail: "협업과 소통, 나눔과 배려, 성실성과 규칙준수, 리더십",
    });
    expect(AXIS_TO_UNIVERSITY_FACTORS.E.detail).toBe(
      "세 역량 전반의 변화 추이. 공식 항목에는 없지만 성장 궤적을 보는 축",
    );
  });
});

describe("projectAxes (No.103)", () => {
  test("D 가 0건일 때 활동 3건을 더하면 confirmed 가 된다", () => {
    const r = projectAxes(
      { A: 0, B: 0, C: 0, D: 0, E: 0 },
      [{ axis: "D" }, { axis: "D" }, { axis: "D" }],
      "고2",
    );
    expect(r.find((x) => x.axis === "D")).toMatchObject({
      count: 3,
      verdict: "confirmed",
    });
    expect(r.find((x) => x.axis === "A")).toMatchObject({
      count: 0,
      verdict: "none",
    });
  });
});
