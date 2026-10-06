// 성장설계 "방향 일관성" 지표 테스트(명세 No.59~62, 103, 149 / 시안 1-10).
// 순수 함수만 담은 모듈이라 DB/네트워크 없이 테스트한다.
import { describe, expect, test } from "vitest";
import {
  CONSISTENCY_LABEL,
  computeConsistency,
  countLinked,
  type ConsistencyActivity,
  linkedBreakdown,
  projectConsistency,
} from "./consistency.js";

/** 연결 신호 유무만 다른 활동 목록을 만든다. */
function makeActivities(linked: number, total: number): ConsistencyActivity[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `a${i}`,
    signals: i < linked ? ["subject_link"] : [],
  }));
}

describe("computeConsistency", () => {
  test("7/14 는 50% 이고 '갈리는 중' 으로 판정한다(No.59·60)", () => {
    const r = computeConsistency(makeActivities(7, 14));
    expect(r.percent).toBe(50);
    expect(r.linked).toBe(7);
    expect(r.total).toBe(14);
    expect(r.verdict).toBe("splitting");
    expect(r.verdictLabel).toBe("갈리는 중");
  });

  test("9/14 는 64.3% 이고 '뚜렷함' 이다(No.59·60)", () => {
    const r = computeConsistency(makeActivities(9, 14));
    expect(r.percent).toBe(64.3);
    expect(r.verdict).toBe("clear");
    expect(r.verdictLabel).toBe("뚜렷함");
  });

  test("4/14 는 28.6% 이고 '흩어짐' 이다(No.59·60)", () => {
    const r = computeConsistency(makeActivities(4, 14));
    expect(r.percent).toBe(28.6);
    expect(r.verdict).toBe("scattered");
    expect(r.verdictLabel).toBe("흩어짐");
  });

  test("경계값 60% 는 뚜렷함, 35% 는 갈리는 중으로 상위 구간에 든다(No.60)", () => {
    expect(computeConsistency(makeActivities(6, 10)).verdict).toBe("clear");
    expect(computeConsistency(makeActivities(7, 20)).percent).toBe(35);
    expect(computeConsistency(makeActivities(7, 20)).verdict).toBe("splitting");
    expect(computeConsistency(makeActivities(34, 100)).verdict).toBe("scattered");
    expect(computeConsistency(makeActivities(59, 100)).verdict).toBe("splitting");
  });

  test("한 활동에서 여러 신호가 나와도 분자에서는 1건으로만 센다(No.62)", () => {
    const activities: ConsistencyActivity[] = [
      { id: "a", signals: ["subject_link", "grade_link", "axis_match"] },
      { id: "b", signals: [] },
    ];
    const r = computeConsistency(activities);
    expect(r.linked).toBe(1);
    expect(r.total).toBe(2);
    expect(r.percent).toBe(50);
  });

  test("활동이 0건이면 percent 와 판정이 null 이다(No.59)", () => {
    const r = computeConsistency([]);
    expect(r.percent).toBeNull();
    expect(r.verdict).toBeNull();
    expect(r.verdictLabel).toBeNull();
    expect(r.linked).toBe(0);
    expect(r.total).toBe(0);
  });

  test("계산 근거 문자열과 판정 기준 문구를 함께 낸다(No.61, 시안 1-10)", () => {
    const r = computeConsistency(makeActivities(7, 14));
    expect(r.formula).toBe("연결 활동 7건 ÷ 전체 14건 × 100 = 50%");
    expect(r.criteria).toBe(
      "60% 이상 뚜렷함 / 35% 이상 60% 미만 갈리는 중 / 35% 미만 흩어짐",
    );
    expect(computeConsistency(makeActivities(9, 14)).formula).toBe(
      "연결 활동 9건 ÷ 전체 14건 × 100 = 64.3%",
    );
  });

  test("표본이 5건 미만이면 smallSample 이다(No.149)", () => {
    expect(computeConsistency(makeActivities(2, 4)).smallSample).toBe(true);
    expect(computeConsistency(makeActivities(2, 5)).smallSample).toBe(false);
    expect(computeConsistency(makeActivities(0, 0)).smallSample).toBe(true);
  });
});

describe("countLinked", () => {
  test("신호가 있는 활동만 센다(No.62)", () => {
    expect(countLinked(makeActivities(3, 8))).toBe(3);
    expect(countLinked([])).toBe(0);
  });
});

describe("CONSISTENCY_LABEL", () => {
  test("사용자 노출 명칭은 '방향 일관성' 이다", () => {
    expect(CONSISTENCY_LABEL).toBe("방향 일관성");
  });
});

describe("linkedBreakdown", () => {
  test("연결로 센 활동만 대표 신호와 함께 돌려주고 대표 신호는 축 일치, 과목 간, 학년 간 순으로 고른다", () => {
    const activities: ConsistencyActivity[] = [
      { id: "a", signals: ["grade_link", "axis_match"] },
      { id: "b", signals: ["grade_link", "subject_link"] },
      { id: "c", signals: ["grade_link"] },
      { id: "d", signals: [] },
    ];
    expect(linkedBreakdown(activities)).toEqual([
      { id: "a", primarySignal: "axis_match", signals: ["grade_link", "axis_match"] },
      { id: "b", primarySignal: "subject_link", signals: ["grade_link", "subject_link"] },
      { id: "c", primarySignal: "grade_link", signals: ["grade_link"] },
    ]);
  });
});

describe("projectConsistency", () => {
  test("7/14 에 연결 3건이 추가되면 전체도 늘어 10/17 로 예측한다(No.103)", () => {
    const r = projectConsistency({ linked: 7, total: 14 }, 3);
    expect(r).toEqual({ percent: 58.8, verdict: "splitting" });
  });

  test("입력이 null 이면 null 이다", () => {
    expect(projectConsistency(null, 3)).toBeNull();
  });
});
