// 성장설계 성적 곡선 판정·보정 테스트(No.61·76·77, 개발참고 "곡선 보정").
import { describe, expect, test } from "vitest";
import { adjustEstimate, curveSummary, judgeCurve } from "./gradeCurve.js";

describe("judgeCurve", () => {
  test("학기가 2개 이하이면 not_judgeable (No.76, 고1 포함)", () => {
    const r = judgeCurve({
      system: "five",
      semesterAverages: [
        { key: "고1-1", average: 2.8 },
        { key: "고1-2", average: 2.5 },
      ],
    });
    expect(r.verdict).toBe("not_judgeable");
    expect(r.delta).toBeNull();
  });

  test("five 에서 학년 평균 2.8 다음 2.35 는 rising, delta -0.45 (No.76)", () => {
    const r = judgeCurve({
      system: "five",
      semesterAverages: [
        { key: "고1-1", average: 2.8 },
        { key: "고1-2", average: 2.8 },
        { key: "고2-1", average: 2.35 },
      ],
    });
    expect(r.verdict).toBe("rising");
    expect(r.from).toBe(2.8);
    expect(r.to).toBe(2.35);
    expect(r.delta).toBeCloseTo(-0.45, 10);
  });

  test("학기 3개여도 학년이 하나뿐이면 not_judgeable", () => {
    const r = judgeCurve({
      system: "five",
      semesterAverages: [
        { key: "고1-1", average: 2.8 },
        { key: "고1-2", average: 2.5 },
        { key: "고1-3", average: 2.1 },
      ],
    });
    expect(r.verdict).toBe("not_judgeable");
  });

  test("five 에서 0.2 변동은 flat", () => {
    const r = judgeCurve({
      system: "five",
      semesterAverages: [
        { key: "고1-1", average: 2.5 },
        { key: "고1-2", average: 2.5 },
        { key: "고2-1", average: 2.3 },
      ],
    });
    expect(r.verdict).toBe("flat");
  });

  test("nine 에서 0.4 는 flat, 0.5 는 falling (경계 포함)", () => {
    const make = (to: number) =>
      judgeCurve({
        system: "nine",
        semesterAverages: [
          { key: "고1-1", average: 3.0 },
          { key: "고1-2", average: 3.0 },
          { key: "고2-1", average: to },
        ],
      });
    expect(make(3.4).verdict).toBe("flat");
    expect(make(3.5).verdict).toBe("falling");
    expect(make(3.5).threshold).toBe(0.5);
  });

  test("평균이 null 인 학기는 무시하고, 남은 유효 학기가 2개 이하면 not_judgeable", () => {
    const r = judgeCurve({
      system: "five",
      semesterAverages: [
        { key: "고1-1", average: 2.8 },
        { key: "고1-2", average: null },
        { key: "고2-1", average: 2.0 },
      ],
    });
    expect(r.verdict).toBe("not_judgeable");
  });

  test("학년 평균은 그 학년 학기 평균의 산술평균", () => {
    const r = judgeCurve({
      system: "five",
      semesterAverages: [
        { key: "고1-1", average: 3.0 },
        { key: "고1-2", average: 2.0 },
        { key: "고2-1", average: 2.0 },
        { key: "고2-2", average: null },
      ],
    });
    expect(r.from).toBe(2.5);
    expect(r.to).toBe(2.0);
    expect(r.verdict).toBe("rising");
  });

  test("basis 는 계산 근거를 한국어로 병기한다 (No.61)", () => {
    const r = judgeCurve({
      system: "five",
      semesterAverages: [
        { key: "고1-1", average: 2.8 },
        { key: "고1-2", average: 2.8 },
        { key: "고2-1", average: 2.35 },
      ],
    });
    expect(r.basis).toBe("1학년 2.8에서 2학년 2.35로 0.45등급 변동");
  });

  test("판정 불가일 때 basis 는 사유를 알려준다", () => {
    const r = judgeCurve({ system: "five", semesterAverages: [] });
    expect(r.basis).toContain("판정 불가");
  });
});

describe("adjustEstimate", () => {
  test("rising 보정은 빼고(유리) 라벨을 만든다 (No.77, 부호 회귀)", () => {
    const r = adjustEstimate({ actualAverage: 2.3, verdict: "rising", system: "five" });
    expect(r.estimate).toBeCloseTo(2.15, 10);
    expect(r.correction).toBeCloseTo(-0.15, 10);
    expect(r.label).toBe("상승곡선, 5등급제 기준 0.15");
  });

  test("falling 보정은 더한다(불리) (No.77, 부호 회귀)", () => {
    const r = adjustEstimate({ actualAverage: 2.3, verdict: "falling", system: "five" });
    expect(r.estimate).toBeCloseTo(2.45, 10);
    expect(r.correction).toBeCloseTo(0.15, 10);
    expect(r.label).toBe("하향곡선, 5등급제 기준 0.15");
  });

  test("nine 보정 폭은 0.3", () => {
    expect(adjustEstimate({ actualAverage: 3, verdict: "rising", system: "nine" }).estimate).toBeCloseTo(2.7, 10);
    expect(adjustEstimate({ actualAverage: 3, verdict: "falling", system: "nine" }).estimate).toBeCloseTo(3.3, 10);
  });

  test("flat 과 not_judgeable 은 보정 0", () => {
    for (const verdict of ["flat", "not_judgeable"] as const) {
      const r = adjustEstimate({ actualAverage: 2.3, verdict, system: "five" });
      expect(r.estimate).toBe(2.3);
      expect(r.correction).toBe(0);
    }
  });

  test("actualAverage 가 null 이면 estimate null, correction 0", () => {
    const r = adjustEstimate({ actualAverage: null, verdict: "rising", system: "five" });
    expect(r.estimate).toBeNull();
    expect(r.correction).toBe(0);
  });

  test("체계 범위를 벗어나도 클램프하지 않는다", () => {
    const r = adjustEstimate({ actualAverage: 1.05, verdict: "rising", system: "five" });
    expect(r.estimate).toBeCloseTo(0.9, 10);
  });
});

describe("curveSummary", () => {
  test("판정과 보정을 합쳐 actual, estimate, verdict, correction, basis, thresholdText 를 돌려준다", () => {
    const r = curveSummary({
      system: "five",
      actualAverage: 2.3,
      semesterAverages: [
        { key: "고1-1", average: 2.8 },
        { key: "고1-2", average: 2.8 },
        { key: "고2-1", average: 2.35 },
      ],
    });
    expect(r.actual).toBe(2.3);
    expect(r.estimate).toBeCloseTo(2.15, 10);
    expect(r.verdict).toBe("rising");
    expect(r.correction).toBeCloseTo(-0.15, 10);
    expect(r.basis).toBe("1학년 2.8에서 2학년 2.35로 0.45등급 변동");
    expect(r.thresholdText).toBe(
      "5등급제는 학년 간 0.25등급 이상 변동이면 상승 또는 하향, 그 사이는 유지",
    );
  });

  test("nine 의 thresholdText 는 0.5등급", () => {
    const r = curveSummary({ system: "nine", actualAverage: null, semesterAverages: [] });
    expect(r.thresholdText).toContain("9등급제는 학년 간 0.5등급");
    expect(r.estimate).toBeNull();
    expect(r.verdict).toBe("not_judgeable");
  });
});
