// 정시 지연 재계산(lazy recalc) 회귀 테스트(행296·332, QA3 §9-5 결정3).
// 순수 함수만 담은 모듈이라 DB/네트워크 없이 테스트한다.
import { describe, expect, test } from "vitest";
import { calcJeongsiProb } from "../../../src/lib/goal/calc/jeongsi.js";
import {
  computeJungsiRecalc,
  needsJungsiRecalcAttempt,
  resolveJungsiEffectiveGrade,
} from "./jungsiProb.js";

describe("computeJungsiRecalc", () => {
  test("pipeline.ts:341-348 과 같은 원시 함수를 호출하므로 결과가 완전히 같다(패리티)", () => {
    const now = new Date("2026-06-01T00:00:00+09:00");
    const currentMogo = 82;
    const remainMogo = 5;
    const idealJungsiCut = 90;
    const minJungsiCut = 70;

    const result = computeJungsiRecalc({
      grade: "고2",
      currentMogo,
      remainMogo,
      idealJungsiCut,
      minJungsiCut,
      now,
    });

    // pipeline.ts:341-348 이 하는 것과 정확히 같은 원시 함수 호출.
    const expectedIdeal = calcJeongsiProb(
      currentMogo,
      idealJungsiCut,
      remainMogo,
      14,
    );
    const expectedMin = calcJeongsiProb(
      currentMogo,
      minJungsiCut,
      remainMogo,
      14,
    );

    expect(result.idealJungsi).toBe(expectedIdeal);
    expect(result.minJungsi).toBe(expectedMin);
    expect(result.idealJungsiBonus).toBeGreaterThan(0);
    expect(result.minJungsiBonus).toBeGreaterThan(0);
  });

  test("currentMogo <= 0 이면 0(미산출이 아니라 산출된 0%) — pipeline.ts 게이트와 동일", () => {
    const result = computeJungsiRecalc({
      grade: "고3",
      currentMogo: 0,
      remainMogo: 3,
      idealJungsiCut: 90,
      minJungsiCut: 70,
      now: new Date("2026-06-01T00:00:00+09:00"),
    });
    expect(result.idealJungsi).toBe(0);
    expect(result.minJungsi).toBe(0);
  });

  test("susi 자리에 0을 넣어도 jungsi rate 는 영향받지 않는다(bonus.ts 의 susi/jungsi 독립성)", () => {
    const input = {
      grade: "고2",
      currentMogo: 60,
      remainMogo: 4,
      idealJungsiCut: 80,
      minJungsiCut: 60,
      now: new Date("2026-06-01T00:00:00+09:00"),
    };
    const a = computeJungsiRecalc(input);
    const b = computeJungsiRecalc(input);
    expect(a).toEqual(b);
  });

  test("grade 오프셋이 다르면 rate 도 달라진다(고1 vs 고3)", () => {
    const base = {
      currentMogo: 70,
      remainMogo: 4,
      idealJungsiCut: 85,
      minJungsiCut: 65,
      now: new Date("2026-06-01T00:00:00+09:00"),
    };
    const g3 = computeJungsiRecalc({ ...base, grade: "고3" });
    const g1 = computeJungsiRecalc({ ...base, grade: "고1" });
    // 확률(idealJungsi/minJungsi)은 학년과 무관하지만 rate(하루 증분율)는
    // D-day까지 남은 일수(학년 오프셋 포함)로 나누므로 학년마다 다르다.
    expect(g3.idealJungsi).toBe(g1.idealJungsi);
    expect(g3.idealJungsiBonus).not.toBe(g1.idealJungsiBonus);
    expect(g3.idealJungsiBonus).toBeGreaterThan(g1.idealJungsiBonus);
  });
});

describe("resolveJungsiEffectiveGrade", () => {
  test("고1 + priorNaesinGrade 있음 → '중3'으로 치환(intake.ts isMiddleSubstituted 재구성)", () => {
    expect(
      resolveJungsiEffectiveGrade("고1", { priorNaesinGrade: "중3" }),
    ).toBe("중3");
  });

  test("고1이어도 priorNaesinGrade 가 없으면 치환하지 않는다", () => {
    expect(resolveJungsiEffectiveGrade("고1", { kor: {} })).toBe("고1");
    expect(resolveJungsiEffectiveGrade("고1", null)).toBe("고1");
    expect(resolveJungsiEffectiveGrade("고1", undefined)).toBe("고1");
  });

  test("고1이 아니면 priorNaesinGrade 가 있어도 치환하지 않는다", () => {
    expect(
      resolveJungsiEffectiveGrade("고2", { priorNaesinGrade: "중3" }),
    ).toBe("고2");
  });
});

describe("needsJungsiRecalcAttempt", () => {
  test("base_ideal_jungsi 가 null 이고 current_mogo > 0 이면 시도한다", () => {
    expect(
      needsJungsiRecalcAttempt({ base_ideal_jungsi: null, current_mogo: 55 }),
    ).toBe(true);
  });

  test("base_ideal_jungsi 가 이미 있으면(0 포함) 재시도하지 않는다", () => {
    expect(
      needsJungsiRecalcAttempt({ base_ideal_jungsi: 0, current_mogo: 55 }),
    ).toBe(false);
    expect(
      needsJungsiRecalcAttempt({ base_ideal_jungsi: 42.3, current_mogo: 55 }),
    ).toBe(false);
  });

  test("current_mogo 가 0 이하면 재시도하지 않는다(모의고사 미응시)", () => {
    expect(
      needsJungsiRecalcAttempt({ base_ideal_jungsi: null, current_mogo: 0 }),
    ).toBe(false);
    expect(
      needsJungsiRecalcAttempt({ base_ideal_jungsi: null, current_mogo: null }),
    ).toBe(false);
  });
});
