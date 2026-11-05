// 코칭 판정 엔진 검증(W9). 문구표 r2~r22, 연결표 r2~r42, 결정 3, 4, 36 의 행마다 한 가지씩 확인한다.

import { describe, expect, test } from "vitest";
import {
  AXIS_DEFS,
  type AxisKey,
  type AxisResult,
  type CoachingMetrics,
  coachingTypeOf,
  computeAxes,
  computeCompetencies,
  executionVerdict,
  type Indicator,
  learningVerdict,
  linkageVerdict,
  mockChangeScore,
  naesinChangeScore,
  signalOf,
  summaryLine,
  urgencyOf,
  type VerdictLevel,
} from "./coaching.js";

describe("executionVerdict (문구표 r2~r8, first match wins)", () => {
  const week = (setDays: number, metDays: number, achievementPct: number) => ({
    setDays,
    metDays,
    achievementPct,
  });

  test("no goal service means no data", () => {
    expect(executionVerdict({ usesGoal: false })).toEqual({
      level: "no_data",
    });
  });

  test("a last visit 7 or more days ago is a risk with the reason 미접속", () => {
    expect(
      executionVerdict({
        usesGoal: true,
        daysSinceLastSeen: 7,
        week: week(6, 6, 90),
      }),
    ).toEqual({ level: "risk", reason: "미접속" });
  });

  test("no target day in the last 7 days means no data, not a risk (목표 없음)", () => {
    expect(
      executionVerdict({
        usesGoal: true,
        daysSinceLastSeen: 1,
        week: week(0, 0, 0),
      }),
    ).toEqual({ level: "no_data", reason: "목표 없음" });
  });

  test("fewer met days than half the target days is a risk (최소 미충족)", () => {
    expect(executionVerdict({ usesGoal: true, week: week(6, 2, 90) })).toEqual({
      level: "risk",
      reason: "최소 미충족",
    });
    // 경계: 3/6 은 설정일의 절반이라 이 규칙에 걸리지 않는다
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 3, 90) }).level,
    ).not.toBe("risk");
  });

  test("an achievement under 40% is a risk (달성율 낮음)", () => {
    expect(executionVerdict({ usesGoal: true, week: week(6, 3, 39) })).toEqual({
      level: "risk",
      reason: "달성율 낮음",
    });
  });

  test("70% or more with at most one missed day is good", () => {
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 5, 70) }).level,
    ).toBe("good");
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 4, 90) }).level,
    ).toBe("caution");
    expect(
      executionVerdict({ usesGoal: true, week: week(6, 6, 69) }).level,
    ).toBe("caution");
  });

  test("the example student (72%, 4 of 6 days) is caution", () => {
    expect(executionVerdict({ usesGoal: true, week: week(6, 4, 72) })).toEqual({
      level: "caution",
    });
  });
});

// 학습진단 12영역 점수. 가장 낮은 영역 하나로 긴급도를 정한다.
const areas = (lowest: number) => ({
  GOAL: 80,
  PLAN: lowest,
  EXEC: 75,
  TIME: 72,
  FEEDBACK: 70,
  STABILITY: 90,
  SUBJECT: 80,
  PERFORM: 80,
  INQUIRY: 80,
  ACTIVITY: 80,
  RECORD: 80,
  STRATEGY: 80,
});

describe("urgencyOf (결정 3, 36: 가장 낮은 영역, 기준 45, 60, 70)", () => {
  test.each([
    [44, "very_high"],
    [45, "high"],
    [59, "high"],
    [60, "normal"],
    [69, "normal"],
    [70, "low"],
  ] as const)("the lowest area %i is %s", (lowest, level) => {
    expect(urgencyOf(areas(lowest))).toBe(level);
  });
});

describe("learningVerdict (문구표 r9~r12)", () => {
  const input = (lowest: number, executionAvg: number) => ({
    areas: areas(lowest),
    executionAvg,
  });

  test("no diagnosis means no data", () => {
    expect(learningVerdict(null)).toEqual({ level: "no_data" });
  });

  test("urgency high or the execution average under 50 is a risk", () => {
    expect(learningVerdict(input(59, 80)).level).toBe("risk");
    expect(learningVerdict(input(44, 80)).level).toBe("risk");
    expect(learningVerdict(input(65, 49.9)).level).toBe("risk");
  });

  test("an execution average of 75 or more is good", () => {
    expect(learningVerdict(input(65, 75)).level).toBe("good");
  });

  test("anything else is caution (the example student: lowest 60, average 62)", () => {
    expect(learningVerdict(input(60, 62)).level).toBe("caution");
    expect(learningVerdict(input(65, 74.9)).level).toBe("caution");
  });
});

describe("linkageVerdict (문구표 r13~r16, 진로 연결도)", () => {
  test.each([
    [null, "no_data"],
    [70, "good"],
    [69.9, "caution"],
    [50, "caution"],
    [49.9, "risk"],
  ] as const)("career link score %s is %s", (score, level) => {
    expect(linkageVerdict(score).level).toBe(level);
  });
});

const NONE_USED = {
  diagnosis: false,
  goal: false,
  growth: false,
  performance: false,
  selfeval: false,
  inquiry: false,
};

// 여섯 서비스를 모두 쓰는 학생(김서연 예시 값). 학습 실행 역량 62, 달성율 72, 충족 4/6.
const metrics = (over: Partial<CoachingMetrics> = {}): CoachingMetrics => ({
  used: {
    diagnosis: true,
    goal: true,
    growth: true,
    performance: true,
    selfeval: true,
    inquiry: true,
  },
  diagnosis: {
    areas: {
      ...areas(60),
      GOAL: 62,
      PLAN: 60,
      EXEC: 62,
      TIME: 62,
      FEEDBACK: 64,
      STABILITY: 62,
      ACTIVITY: 76,
      STRATEGY: 78,
      SUBJECT: 74,
    },
    trend: "up",
  },
  goal: {
    week: { setDays: 6, metDays: 4, achievementPct: 72 },
    naesinChangeScore: null,
    mockChangeScore: null,
  },
  growth: {
    axes: { A: null, B: null, C: null, D: null, E: null },
    curve: null,
  },
  performance: { avgScore: 73, tasks: 3, feedbackDone: 3 },
  inquiry: { topicFit: "normal", reportScore: null },
  selfeval: { verifyScore: null },
  ...over,
});

describe("computeAxes (연결표 r2~r19, 결정 4: 자료 없는 지표는 분모에서 뺀다)", () => {
  const byKey = (m: CoachingMetrics) =>
    Object.fromEntries(computeAxes(m).axes.map((a) => [a.key, a]));

  test("axis 1 averages the diagnosis execution score, the achievement and the minimum met rate", () => {
    // (62 + 72 + 4/6x100) / 3 = 66.9
    expect(byKey(metrics()).execution).toMatchObject({
      score: 67,
      status: "scored",
    });
  });

  test("an achievement above 100 counts as 100 in the score", () => {
    const m = metrics({
      goal: {
        week: { setDays: 6, metDays: 6, achievementPct: 130 },
        naesinChangeScore: null,
        mockChangeScore: null,
      },
    });
    // (62 + 100 + 100) / 3 = 87.3
    expect(byKey(m).execution?.score).toBe(87);
  });

  test("axis 2 uses only the indicators that have data (strategy and subject management)", () => {
    // (78 + 74) / 2 = 76
    expect(byKey(metrics()).readiness?.score).toBe(76);
  });

  test("axis 4 averages the feedback score, the feedback done rate and the diagnosis performance score", () => {
    // 평가 점수 73, 피드백 완료율 3/3 = 100, 수행 대응 80 -> 84.3
    expect(byKey(metrics()).performance?.score).toBe(84);
  });

  test("an axis without any data on its services is not used and names the missing services", () => {
    const m = metrics({
      used: { ...NONE_USED, growth: true, performance: true },
      diagnosis: null,
      goal: null,
      inquiry: null,
      selfeval: null,
    });
    expect(byKey(m).execution).toMatchObject({
      score: null,
      status: "not_used",
      missingServices: ["학습진단", "목표관리"],
    });
  });

  test("axes 5 and 6 are before evaluation while the main service is in use without a result", () => {
    const axes = byKey(metrics());
    expect(axes.inquiry).toMatchObject({ score: null, status: "before_eval" });
    expect(axes.selfAssessment).toMatchObject({
      score: null,
      status: "before_eval",
    });
  });

  test("axes 5 and 6 are scored once the main service has its result", () => {
    const m = metrics({
      inquiry: { topicFit: "fit", reportScore: 80 },
      selfeval: { verifyScore: 90 },
    });
    expect(byKey(m).inquiry?.score).toBe(80);
    // 검증 결과 90 과 학습진단 기록 정리 80 의 평균
    expect(byKey(m).selfAssessment?.score).toBe(85);
  });

  test("axis 5 is not used when the inquiry service is not used, even with a diagnosis score", () => {
    const m = metrics({
      used: { ...metrics().used, inquiry: false },
      inquiry: null,
    });
    expect(byKey(m).inquiry).toMatchObject({
      status: "not_used",
      missingServices: ["심화탐구"],
    });
  });

  test("the topic fit categories become 100, 50 and 0 (결정 4)", () => {
    const withFit = (topicFit: "fit" | "normal" | "off") =>
      byKey(metrics({ inquiry: { topicFit, reportScore: null } })).careerLink;
    // 연계 축은 주제 적합도와 학습진단 활동 연계(76)의 평균
    expect(withFit("fit")?.score).toBe(88);
    expect(withFit("normal")?.score).toBe(63);
    expect(withFit("off")?.score).toBe(38);
  });

  test("the strongest and weakest axes follow the radar order on ties and name the weakest indicator", () => {
    const { strongest, weakest } = computeAxes(metrics());
    // 점수: 실행 67, 준비도 76, 연계 63, 수행평가 84
    expect(strongest).toMatchObject({ key: "performance", score: 84 });
    expect(weakest).toMatchObject({
      key: "careerLink",
      score: 63,
      cause: { service: "심화탐구", name: "주제 적합도", score: 50 },
    });
  });
});

describe("computeCompetencies (연결표 r23~r42)", () => {
  const byKey = (m: CoachingMetrics) =>
    Object.fromEntries(computeCompetencies(m).map((c) => [c.key, c]));

  test("the academic competency averages five indicators and reports the basis count", () => {
    const academic = byKey(
      metrics({
        growth: {
          axes: {
            A: { verdict: "confirmed", count: 5, required: 5 },
            B: null,
            C: null,
            D: null,
            E: null,
          },
          curve: null,
        },
      }),
    ).academic;
    // 학습 실행 역량 62, 교과 관리 74, 달성율 72, 평가 점수 73, 성장설계 확인됨 85
    expect(academic).toMatchObject({ score: 73, basisUsed: 5, basisTotal: 5 });
    expect(academic?.evidence).toContain("성장설계 학업역량 판정");
  });

  test("a basis without data stays out of the average and the used count (결정 4)", () => {
    const inquiry = byKey(metrics()).inquiry;
    // 주제 적합도 50 과 학습진단 탐구 심화 80 만 있다. 성장설계 판정과 평가 점수는 없다
    expect(inquiry).toMatchObject({ score: 65, basisUsed: 2, basisTotal: 4 });
  });

  test("a growth axis verdict in caution converts to 25 plus 60 times records over required (r27)", () => {
    const m = metrics({
      growth: {
        axes: {
          A: null,
          B: null,
          C: { verdict: "caution", count: 1, required: 2 },
          D: null,
          E: null,
        },
        curve: null,
      },
    });
    // 25 + 60 x 1/2 = 55, 주제 적합도 50, 탐구 심화 80
    expect(byKey(m).inquiry?.score).toBe(62);
  });

  test("an optional first-year career axis without a record is dropped (결정 4)", () => {
    const m = metrics({
      growth: {
        axes: {
          A: null,
          B: { verdict: "none", count: 0, required: 1, optional: true },
          C: null,
          D: null,
          E: null,
        },
        curve: null,
      },
    });
    expect(byKey(m).career?.basisUsed).toBe(1);
  });

  test("the community competency has no score and says the homeroom teacher fills it in when growth has no verdict (r37)", () => {
    expect(byKey(metrics()).community).toMatchObject({
      score: null,
      basisUsed: 0,
      basisTotal: 1,
      fallback: "담임 관찰로 보완",
    });
  });

  test("the potential competency maps grade curves and diagnosis trends to scores (r39, r40)", () => {
    const m = metrics({
      growth: {
        axes: { A: null, B: null, C: null, D: null, E: null },
        curve: "falling",
      },
    });
    // 성적 곡선 하향 25, 학습진단 성적 흐름 상승 80
    expect(byKey(m).potential).toMatchObject({ score: 53, basisUsed: 2 });
  });
});

describe("signalOf (문구표 r17~r22)", () => {
  const axisScores = (...scores: (number | null)[]) =>
    scores.map((score) => ({ score }));
  const verdicts = (
    execution: VerdictLevel,
    learning: VerdictLevel,
    linkage: VerdictLevel,
  ) => ({
    execution: { level: execution },
    learning: { level: learning },
    linkage: { level: linkage },
  });

  test("an execution risk is focus coaching", () => {
    expect(
      signalOf(verdicts("risk", "good", "good"), axisScores(90, 90)).signal,
    ).toBe("focus");
  });

  test("two severe counts is focus coaching and a learning risk counts as one", () => {
    expect(
      signalOf(verdicts("good", "risk", "good"), axisScores(49, 90)).signal,
    ).toBe("focus");
    expect(
      signalOf(verdicts("good", "good", "good"), axisScores(49, 40)).signal,
    ).toBe("focus");
  });

  test("one severe count, an execution or learning caution, or any axis under 70 is caution", () => {
    expect(
      signalOf(verdicts("good", "good", "good"), axisScores(49, 90)).signal,
    ).toBe("caution");
    expect(
      signalOf(verdicts("caution", "good", "good"), axisScores(90)).signal,
    ).toBe("caution");
    expect(
      signalOf(verdicts("good", "caution", "good"), axisScores(90)).signal,
    ).toBe("caution");
    expect(
      signalOf(verdicts("good", "good", "good"), axisScores(69.9, 90)).signal,
    ).toBe("caution");
  });

  test("no diagnosis or no execution data is insufficient data", () => {
    expect(
      signalOf(verdicts("no_data", "good", "good"), axisScores(90)).signal,
    ).toBe("insufficient");
    expect(
      signalOf(verdicts("good", "no_data", "good"), axisScores(90)).signal,
    ).toBe("insufficient");
  });

  test("anything else is stable, and axes without a score are not counted", () => {
    expect(
      signalOf(verdicts("good", "good", "good"), axisScores(90, null)).signal,
    ).toBe("stable");
  });

  test("the sub-line lists the three verdicts with commas (r22, 결정 6)", () => {
    expect(
      signalOf(verdicts("caution", "caution", "caution"), axisScores(60))
        .subLine,
    ).toBe("실행 주의, 학습역량 주의, 연계 주의");
    expect(
      signalOf(verdicts("no_data", "no_data", "risk"), axisScores(40)).subLine,
    ).toBe("실행 자료 없음, 학습역량 자료 없음, 연계 위험");
  });
});

describe("summaryLine (문구표 r180~r183, r204)", () => {
  const axis = (
    key: AxisKey,
    name: string,
    score: number | null,
    status: "scored" | "not_used" | "before_eval",
    extra: Partial<AxisResult> = {},
  ): AxisResult => ({
    key,
    name,
    score,
    status,
    missingServices: [],
    cause: null,
    ...extra,
  });
  const pick = (axes: AxisResult[]) => {
    const scored = axes.filter((a) => a.status === "scored");
    return {
      axes,
      strongest: scored.reduce((a, b) =>
        (b.score as number) > (a.score as number) ? b : a,
      ),
      weakest: scored.reduce((a, b) =>
        (b.score as number) < (a.score as number) ? b : a,
      ),
    };
  };

  test("with no scored axis the sentence says the diagnosis cannot be produced yet", () => {
    expect(
      summaryLine({
        axes: [axis("execution", "학습 실행력", null, "not_used")],
        strongest: null,
        weakest: null,
      }),
    ).toBe("6종 서비스 결과가 아직 없어 6축 종합 진단을 산출할 수 없습니다.");
  });

  test("with one scored axis the sentence names the axis and its lowest basis", () => {
    const cause = {
      service: "학습진단",
      name: "활동 연계",
      score: 40,
    } as const;
    expect(
      summaryLine(
        pick([axis("careerLink", "진로 연결도", 40, "scored", { cause })]),
      ),
    ).toBe(
      "6축 중 1축만 산출되었습니다(진로 연결도 40점, 가장 낮은 근거 학습진단 활동 연계 40점).",
    );
  });

  test("with two or more axes the sentence gives the average level, the strongest and the weakest axis, then the empty axes", () => {
    const cause = {
      service: "수행평가",
      name: "전공 연결 비율",
      score: 33,
    } as const;
    const result = pick([
      axis("execution", "학습 실행력", 67, "scored"),
      axis("readiness", "목표대학 준비도", 76, "scored"),
      axis("careerLink", "진로 연결도", 60, "scored", { cause }),
      axis("performance", "수행평가 완성도", 73, "scored"),
      axis("inquiry", "탐구 완성도", null, "before_eval"),
      axis("selfAssessment", "자기평가 충실도", null, "before_eval"),
    ]);
    expect(summaryLine(result)).toBe(
      "6축 중 4축 산출, 평균 69점으로 보완이 필요한 축이 있습니다. 가장 강한 축은 목표대학 준비도(76점), 가장 약한 축은 진로 연결도(60점, 원인 수행평가 전공 연결 비율 33점)입니다. 탐구 완성도, 자기평가 충실도는 평가 결과가 나오기 전입니다.",
    );
  });

  test("the level words split at 70 and 50", () => {
    const two = (a: number, b: number) =>
      summaryLine(
        pick([
          axis("execution", "학습 실행력", a, "scored"),
          axis("readiness", "목표대학 준비도", b, "scored"),
        ]),
      );
    expect(two(70, 70)).toContain("평균 70점으로 전반적으로 안정적입니다");
    expect(two(50, 50)).toContain("평균 50점으로 보완이 필요한 축이 있습니다");
    expect(two(49, 49)).toContain("평균 49점으로 전반적인 보강이 필요합니다");
  });

  test("unused axes list their main services first and the particle follows the last syllable", () => {
    const result = pick([
      axis("readiness", "목표대학 준비도", 80, "scored"),
      axis("careerLink", "진로 연결도", 70, "scored"),
      axis("execution", "학습 실행력", null, "not_used", {
        missingServices: ["학습진단", "목표관리"],
      }),
      axis("inquiry", "탐구 완성도", null, "not_used", {
        missingServices: ["심화탐구"],
      }),
      axis("selfAssessment", "자기평가 충실도", null, "before_eval"),
    ]);
    expect(summaryLine(result)).toMatch(
      / 학습 실행력, 탐구 완성도는 학습진단, 목표관리, 심화탐구 결과가 없어 비어 있습니다\. 자기평가 충실도는 평가 결과가 나오기 전입니다\.$/,
    );
  });
});

describe("coachingTypeOf (문구표 r91 판정 순서)", () => {
  const axes = (scores: Partial<Record<AxisKey, number | null>>) =>
    AXIS_DEFS.map((d) => ({
      key: d.key,
      name: d.name,
      score: scores[d.key] ?? null,
      status: (scores[d.key] ?? null) === null ? "not_used" : "scored",
      missingServices: [],
      cause: null,
    })) as AxisResult[];
  const input = (over: Partial<Parameters<typeof coachingTypeOf>[0]> = {}) => ({
    verdicts: verdicts("good", "good", "good"),
    axes: axes({ execution: 80, readiness: 80 }),
    achievementPct: 80,
    usesInquiry: true,
    ...over,
  });
  const verdicts = (
    execution: VerdictLevel,
    learning: VerdictLevel,
    linkage: VerdictLevel,
    reason?: string,
  ) => ({
    execution: { level: execution, reason },
    learning: { level: learning },
    linkage: { level: linkage },
  });

  test("an execution risk is C1, C2 or C3 by its reason", () => {
    const code = (reason: string) =>
      coachingTypeOf(
        input({ verdicts: verdicts("risk", "good", "good", reason) }),
      ).code;
    expect(code("미접속")).toBe("C1");
    expect(code("최소 미충족")).toBe("C2");
    expect(code("달성율 낮음")).toBe("C3");
  });

  test("a learning risk is E1", () => {
    expect(
      coachingTypeOf(input({ verdicts: verdicts("good", "risk", "good") })),
    ).toEqual({ code: "E1", name: "기초 보강" });
  });

  test("the lowest axis under 70 decides the type, ties go to the radar order", () => {
    const code = (scores: Partial<Record<AxisKey, number>>) =>
      coachingTypeOf(input({ axes: axes(scores) })).code;
    expect(code({ readiness: 60, careerLink: 90 })).toBe("K");
    expect(code({ careerLink: 60 })).toBe("F1");
    expect(code({ performance: 60 })).toBe("H");
    expect(code({ inquiry: 60 })).toBe("I");
    expect(code({ selfAssessment: 60 })).toBe("J");
    expect(code({ readiness: 60, careerLink: 60 })).toBe("K");
  });

  test("the lowest axis being execution gives D1 or D2 by the achievement when the cause is a goal indicator, E2 for a diagnosis cause", () => {
    const executionLowest = (cause: Indicator, achievementPct: number) =>
      coachingTypeOf(
        input({
          axes: axes({ execution: 50 }).map((a) =>
            a.key === "execution" ? { ...a, cause } : a,
          ),
          achievementPct,
        }),
      ).code;
    const goalCause = {
      service: "목표관리",
      name: "목표시간 달성율",
      score: 50,
    } as const;
    const diagCause = {
      service: "학습진단",
      name: "학습 실행 역량",
      score: 50,
    } as const;
    expect(executionLowest(goalCause, 69)).toBe("D1");
    expect(executionLowest(goalCause, 70)).toBe("D2");
    expect(executionLowest(diagCause, 80)).toBe("E2");
  });

  test("with every axis at 70 or more the order is A, B, D, E2, F2, G1, G2", () => {
    const base = {
      axes: axes({ execution: 80, readiness: 80, careerLink: 80 }),
    };
    expect(
      coachingTypeOf(
        input({ ...base, verdicts: verdicts("good", "no_data", "good") }),
      ).code,
    ).toBe("A");
    expect(
      coachingTypeOf(
        input({ ...base, verdicts: verdicts("no_data", "good", "good") }),
      ).code,
    ).toBe("B");
    expect(
      coachingTypeOf(
        input({
          ...base,
          verdicts: verdicts("caution", "good", "good"),
          achievementPct: 65,
        }),
      ).code,
    ).toBe("D1");
    expect(
      coachingTypeOf(
        input({
          ...base,
          verdicts: verdicts("caution", "good", "good"),
          achievementPct: 72,
        }),
      ).code,
    ).toBe("D2");
    expect(
      coachingTypeOf(
        input({ ...base, verdicts: verdicts("good", "caution", "good") }),
      ).code,
    ).toBe("E2");
    expect(
      coachingTypeOf(
        input({ ...base, verdicts: verdicts("good", "good", "no_data") }),
      ).code,
    ).toBe("F2");
    expect(coachingTypeOf(input(base)).code).toBe("G1");
    expect(coachingTypeOf(input({ ...base, usesInquiry: false })).code).toBe(
      "G2",
    );
  });
});

describe("change scores (연결표 r41, r42)", () => {
  test("the grade change is 50 plus the improvement times 40 on 5 grades and 20 on 9 grades, clamped to 0..100", () => {
    expect(naesinChangeScore(3, 2, 5)).toBe(90);
    expect(naesinChangeScore(3, 4, 5)).toBe(10);
    expect(naesinChangeScore(3, 2, 9)).toBe(70);
    expect(naesinChangeScore(5, 1, 5)).toBe(100);
    expect(naesinChangeScore(1, 5, 5)).toBe(0);
  });

  test("the percentile change is 50 plus the change times 2.5, clamped to 0..100", () => {
    expect(mockChangeScore(80, 84)).toBe(60);
    expect(mockChangeScore(80, 78)).toBe(45);
    expect(mockChangeScore(10, 90)).toBe(100);
    expect(mockChangeScore(90, 10)).toBe(0);
  });
});
