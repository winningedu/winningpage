// 금지 표현 검사(교 #140, 결정 106). 콘솔이 만드는 코칭 문장에 합격을 단정하는 표현이 없는지 테스트로만 본다.

import { describe, expect, test } from "vitest";
import {
  type AreaScores,
  type CoachingMetrics,
  type CoachingTypeCode,
  computeAxes,
  computeCompetencies,
  executionVerdict,
  learningVerdict,
  linkageVerdict,
  signalOf,
  summaryLine,
} from "./coaching.js";
import {
  buildCoachingText,
  type GoalFacts,
  type TextFacts,
} from "./coachingText.js";
import { diagnosisDetail } from "./diagnosisDetail.js";
import { findForbiddenClaims } from "./forbiddenClaims.js";
import { type GoalDay, summarizeGoalWeek } from "./goalRate.js";
import { serviceDetail } from "./serviceDetail.js";
import { INQUIRY_STEPS, SELFEVAL_STEPS } from "./sessionStatus.js";

describe("findForbiddenClaims 문구 판정", () => {
  test.each([
    "합격 보장합니다",
    "반드시 합격할 수 있습니다",
    "합격 확률은 34%입니다",
    "합격을 보장해 드립니다",
    "합격 가능성이 높습니다",
    "합격 가능성이 큰 편입니다",
    "충분히 합격할 수 있습니다",
    "확률이 34%예요",
    "확률이 34%이에요",
    "확률은 34%로 높습니다",
    "확률은 34%이다",
  ])("단정 표현은 잡는다: %s", (text) => {
    expect(findForbiddenClaims(text)).toHaveLength(1);
    expect(findForbiddenClaims(text)[0]?.text).toBe(text);
  });

  test.each([
    "목표대학 확률은 합격 가능성 예측이 아니라 상담 참고 지표입니다",
    "이상 가나대 경영학과 34%",
    "달성율 100%",
    "방해 요인 1위 '스마트폰'",
  ])("콘솔이 쓰는 정상 문구는 잡지 않는다: %s", (text) => {
    expect(findForbiddenClaims(text)).toEqual([]);
  });

  test("중첩 객체와 배열의 문자열을 모두 훑고 빈 문자열은 건너뛴다", () => {
    const hits = findForbiddenClaims({
      a: ["", "괜찮은 문장", { b: "반드시 합격합니다" }],
      c: { d: [{ e: "합격 보장" }], n: 34, f: null },
    });
    expect(hits.map((h) => h.text)).toEqual(["반드시 합격합니다", "합격 보장"]);
  });
});

// ---- 전체 훑기: 콘솔이 만드는 코칭 문장에 단정 표현이 없다 -----------------------------------

const TYPE_CODES: CoachingTypeCode[] = [
  "C1",
  "C2",
  "C3",
  "E1",
  "D1",
  "D2",
  "E2",
  "K",
  "F1",
  "H",
  "I",
  "J",
  "A",
  "B",
  "F2",
  "G1",
  "G2",
];
const GRADES = ["중2", "고1", "고2", "고3", null];
const MONTHS = [1, 3, 6, 9, 11, 12];
const PROBABILITIES = [0, 34, 100, null];

const AREAS: AreaScores = {
  GOAL: 62,
  PLAN: 60,
  EXEC: 62,
  TIME: 62,
  FEEDBACK: 64,
  STABILITY: 62,
  SUBJECT: 74,
  PERFORM: 80,
  INQUIRY: 80,
  ACTIVITY: 76,
  RECORD: 80,
  STRATEGY: 78,
};

const day = (
  date: string,
  weekday: GoalDay["weekday"],
  actual: number,
): GoalDay => ({
  date,
  weekday,
  ideal: weekday === "sun" ? 0 : 5,
  min: weekday === "sun" ? 0 : 3,
  actual,
});
const DAYS = [
  day("2026-11-02", "mon", 5),
  day("2026-11-01", "sun", 0),
  day("2026-10-31", "sat", 2),
  day("2026-10-30", "fri", 4),
  day("2026-10-29", "thu", 2),
  day("2026-10-28", "wed", 5.5),
  day("2026-10-27", "tue", 3),
];

const metrics = (): CoachingMetrics => ({
  used: {
    diagnosis: true,
    goal: true,
    growth: true,
    performance: true,
    selfeval: true,
    inquiry: true,
  },
  diagnosis: { areas: AREAS, trend: "up" },
  goal: {
    week: summarizeGoalWeek(DAYS),
    naesinChangeScore: null,
    mockChangeScore: null,
  },
  growth: {
    axes: { A: null, B: null, C: null, D: null, E: null },
    curve: null,
  },
  performance: { avgScore: 73, tasks: 3, feedbackDone: 2 },
  inquiry: { topicFit: "normal", reportScore: null },
  selfeval: { verifyScore: null },
});

function goalFacts(): GoalFacts {
  return {
    week: summarizeGoalWeek(DAYS),
    lastWeek: { setDays: 6, metDays: 3, achievementPct: 64 },
    days: DAYS,
    streak: 1,
    daysSinceLastSeen: null,
    reasons: ["스마트폰", "스마트폰", "컨디션", "스마트폰"],
    lastWeekAvgActual: 3.4,
  };
}

function facts(
  code: CoachingTypeCode,
  over: Partial<TextFacts> = {},
): TextFacts {
  const m = metrics();
  const axes = computeAxes(m);
  const week = summarizeGoalWeek(DAYS);
  const verdicts = {
    execution: executionVerdict({ usesGoal: true, week }),
    learning: learningVerdict({ areas: AREAS, executionAvg: 62 }),
    linkage: linkageVerdict(
      axes.axes.find((a) => a.key === "careerLink")?.score ?? null,
    ),
  };
  return {
    grade: "고2",
    month: 11,
    department: "경영학과",
    metrics: m,
    axes,
    competencies: computeCompetencies(m),
    verdicts,
    type: { code, name: "" },
    goal: goalFacts(),
    pendingPerformance: [{ title: "통계로 본 우리 동네", subject: "수학" }],
    inquiryTopic: "도시 열섬 완화 방안",
    inquiryStage: { step: 4, name: "보고서 작성", completed: false },
    selfevalStage: { step: 2, name: "자기 점검", finished: false },
    growthKeywords: ["도시 재생", "탄소 중립"],
    targets: null,
    gradeCheck: { diagnosis: 2.1, goalInput: 2.4 },
    ...over,
  };
}

const SERVICES = [
  "goal",
  "diagnosis",
  "growth",
  "performance",
  "inquiry",
  "selfeval",
] as const;

const targets = (p: number | null): NonNullable<TextFacts["targets"]> => ({
  ideal: { university: "가나대", department: "경영학과", probability: p },
  min: { university: "다라대", department: "경영학과", probability: p },
});

describe("코칭 문구 전체 훑기 (결정 106 7번)", () => {
  test("유형 17종, 학년, 월, 확률(0, 34, 100, 없음) 모든 조합에서 문장에 단정 표현이 없다", () => {
    for (const code of TYPE_CODES) {
      for (const grade of GRADES) {
        for (const month of MONTHS) {
          for (const p of PROBABILITIES) {
            const f = facts(code, { grade, month, targets: targets(p) });
            expect(
              findForbiddenClaims(buildCoachingText(f)),
              `${code} ${grade} ${month}월 확률 ${p}`,
            ).toEqual([]);
          }
        }
      }
    }
  });

  test("심화탐구 모든 단계와 자기평가 모든 단계에서 문장에 단정 표현이 없다", () => {
    const inquiryStages = [
      ...INQUIRY_STEPS.map((name, i) => ({
        step: i + 1,
        name,
        completed: false,
      })),
      { step: 6, name: INQUIRY_STEPS[5], completed: true },
    ];
    const selfevalStages = [
      ...SELFEVAL_STEPS.map((name, i) => ({
        step: i,
        name,
        finished: i >= SELFEVAL_STEPS.length - 2,
      })),
      { step: 6, name: SELFEVAL_STEPS[5], finished: true },
    ];
    for (const code of TYPE_CODES) {
      for (const inquiryStage of inquiryStages) {
        const f = facts(code, { inquiryStage });
        expect(
          findForbiddenClaims(buildCoachingText(f)),
          `${code} 탐구 ${inquiryStage.step} ${inquiryStage.completed}`,
        ).toEqual([]);
      }
      for (const selfevalStage of selfevalStages) {
        const f = facts(code, { selfevalStage });
        expect(
          findForbiddenClaims(buildCoachingText(f)),
          `${code} 자기평가 ${selfevalStage.step}`,
        ).toEqual([]);
      }
    }
  });

  test("목표학과 없음, 중학생, 탐구 주제 없음 같은 빈 자료에서도 없다", () => {
    for (const code of TYPE_CODES) {
      const f = facts(code, {
        department: null,
        inquiryTopic: null,
        inquiryStage: null,
        selfevalStage: null,
        growthKeywords: [],
        pendingPerformance: [],
        goal: null,
      });
      expect(findForbiddenClaims(buildCoachingText(f)), code).toEqual([]);
    }
  });

  test("한줄 진단과 신호 아래 줄에도 없다", () => {
    const f = facts("D1");
    expect(
      findForbiddenClaims([
        summaryLine(f.axes),
        signalOf(f.verdicts, f.axes.axes).subLine,
      ]),
    ).toEqual([]);
  });

  test("여섯 서비스 상세 창 문장은 확률 0, 34, 100에서도 단정하지 않는다", () => {
    for (const p of PROBABILITIES) {
      const f = facts("D1", { targets: targets(p) });
      f.metrics.growth = {
        axes: {
          A: { verdict: "confirmed", count: 3, required: 3 },
          B: { verdict: "caution", count: 1, required: 3 },
          C: { verdict: "none", count: 0, required: 3 },
          D: null,
          E: null,
        },
        curve: "rising",
      };
      f.metrics.inquiry = { topicFit: "fit", reportScore: 82 };
      f.metrics.selfeval = { verifyScore: 77 };
      const built = {
        data: {
          metrics: f.metrics,
          goalFacts: f.goal,
          targets: f.targets,
          diagnosisPrevious: { ...AREAS, EXEC: 50 },
          diagnosisMeta: {
            schoolType: "일반고",
            gpa: "2.3",
            gradeTrend: "상승",
            diagnosedAt: "2026-10-01",
          },
          growthKeywords: f.growthKeywords,
          performanceTasks: [
            { title: "통계 보고서", subject: "수학", done: true, score: 88 },
            { title: "발표", subject: "국어", done: false, score: null },
          ],
          inquiryTopic: f.inquiryTopic,
        },
        text: buildCoachingText(f),
      } as unknown as Parameters<typeof serviceDetail>[1];
      for (const key of SERVICES) {
        expect(serviceDetail(key, built), key).not.toBeNull();
      }
      expect(
        findForbiddenClaims([
          serviceDetail("goal", built),
          serviceDetail("diagnosis", built),
          serviceDetail("growth", built),
          serviceDetail("performance", built),
          serviceDetail("inquiry", built),
          serviceDetail("selfeval", built),
        ]),
        `확률 ${p}`,
      ).toEqual([]);
    }
    expect(findForbiddenClaims(diagnosisDetail(AREAS, null, null))).toEqual([]);
  });
});
