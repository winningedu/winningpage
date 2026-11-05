// 코칭 문구 엔진 검증(W9). 문구표 r23~r179, r185~r201 의 행마다 설계 문서의 예시 문장과 같은지 본다.

import { describe, expect, test } from "vitest";
import {
  type AreaScores,
  type CoachingMetrics,
  coachingTypeOf,
  computeAxes,
  computeCompetencies,
  executionVerdict,
  learningVerdict,
  linkageVerdict,
  signalOf,
} from "./coaching.js";
import {
  buildCoachingText,
  careerPlan,
  counselPoints,
  goalOpinion,
  gradeInputCheck,
  priorityTask,
  strengths,
  studyMethods,
  type TextFacts,
  typeTasks,
  vsLastWeek,
  weaknesses,
} from "./coachingText.js";
import { type GoalDay, summarizeGoalWeek } from "./goalRate.js";

const day = (
  date: string,
  weekday: GoalDay["weekday"],
  actual: number,
  ideal = 5,
): GoalDay => ({
  date,
  weekday,
  ideal: weekday === "sun" ? 0 : ideal,
  min: weekday === "sun" ? 0 : 3,
  actual,
});

// 김서연 예시: 달성율 72%, 충족 4/6일, 지난주 64%
const DAYS = [
  day("2026-11-02", "mon", 5),
  day("2026-11-01", "sun", 0),
  day("2026-10-31", "sat", 2),
  day("2026-10-30", "fri", 4),
  day("2026-10-29", "thu", 2),
  day("2026-10-28", "wed", 5.5),
  day("2026-10-27", "tue", 3),
];

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

function facts(
  over: Partial<TextFacts> = {},
  metricOver: Partial<CoachingMetrics> = {},
): TextFacts {
  const week = summarizeGoalWeek(DAYS);
  const metrics: CoachingMetrics = {
    used: {
      diagnosis: true,
      goal: true,
      growth: true,
      performance: true,
      selfeval: true,
      inquiry: true,
    },
    diagnosis: { areas: AREAS, trend: "up" },
    goal: { week, naesinChangeScore: null, mockChangeScore: null },
    growth: {
      axes: { A: null, B: null, C: null, D: null, E: null },
      curve: null,
    },
    performance: { avgScore: 73, tasks: 3, feedbackDone: 2 },
    inquiry: { topicFit: "normal", reportScore: null },
    selfeval: { verifyScore: null },
    ...metricOver,
  };
  const axes = computeAxes(metrics);
  const execAvg = 62;
  const verdicts = {
    execution: executionVerdict({
      usesGoal: metrics.used.goal,
      ...(metrics.goal ? { week: metrics.goal.week } : {}),
    }),
    learning: learningVerdict(
      metrics.diagnosis
        ? { areas: metrics.diagnosis.areas, executionAvg: execAvg }
        : null,
    ),
    linkage: linkageVerdict(
      axes.axes.find((a) => a.key === "careerLink")?.score ?? null,
    ),
  };
  const type = coachingTypeOf({
    verdicts,
    axes: axes.axes,
    achievementPct: week.achievementPct,
    usesInquiry: metrics.used.inquiry,
  });
  return {
    grade: "고2",
    month: 11,
    department: "경영학과",
    metrics,
    axes,
    competencies: computeCompetencies(metrics),
    verdicts,
    type,
    goal: {
      week,
      lastWeek: { setDays: 6, metDays: 3, achievementPct: 64 },
      days: DAYS,
      streak: 1,
      daysSinceLastSeen: null,
      reasons: ["스마트폰", "스마트폰", "컨디션", "스마트폰"],
      lastWeekAvgActual: 3.4,
    },
    pendingPerformance: [{ title: "통계로 본 우리 동네", subject: "수학" }],
    inquiryTopic: "도시 열섬 완화 방안",
    growthKeywords: ["도시 재생", "탄소 중립"],
    gradeCheck: null,
    ...over,
  };
}

describe("지난주 대비 표기 (r203)", () => {
  test("괄호형과 나열형, 같음, 지난주 자료 없음", () => {
    expect(vsLastWeek(72, 64, "paren")).toBe("(지난주보다 8%p 상승)");
    expect(vsLastWeek(60, 64, "list")).toBe(", 지난주보다 4%p 하락");
    expect(vsLastWeek(64, 64, "list")).toBe(", 지난주와 같음");
    expect(vsLastWeek(64, null, "paren")).toBe("");
  });
});

const F1 = { code: "F1", name: "연결 보강" };

describe("우선 과제 (r184 = 유형의 한줄 진단, r23~r90)", () => {
  test("F1 은 목표학과와 반영된 지표를 나열한다 (r56)", () => {
    expect(priorityTask(facts({ type: F1 }))).toBe(
      "경영학과와의 연결이 약합니다(진로 연결도 63점: 심화탐구 주제 적합도 50점, 학습진단 활동 연계 76점). 우선 과제는 다음 활동 주제를 경영학과와 연결하는 것입니다.",
    );
  });

  test("목표학과가 없으면 관심 분야를 쓰고 조사를 맞춘다 (교 #83, r204)", () => {
    expect(priorityTask(facts({ type: F1, department: null }))).toContain(
      "관심 분야와의 연결이 약합니다",
    );
  });

  test("실행과 학습역량이 모두 양호하면 F1 앞머리가 붙는다 (r93)", () => {
    const f = facts({ type: F1 });
    const good = {
      ...f,
      verdicts: {
        ...f.verdicts,
        execution: { level: "good" as const },
        learning: { level: "good" as const },
      },
    };
    expect(priorityTask(good)).toMatch(
      /^실행과 학습역량은 안정적이지만 경영학과와의/,
    );
  });

  test("C2, C3, D1, D2 는 달성율과 충족일을 문장에 넣는다", () => {
    expect(priorityTask(facts({ type: { code: "C2", name: "" } }))).toBe(
      "최근 7일 목표일 6일 중 최소 목표시간을 4일만 지켰습니다(지난주 3일). 우선 과제는 최소 목표시간을 매일 지키는 것입니다.",
    );
    expect(priorityTask(facts({ type: { code: "C3", name: "" } }))).toContain(
      "목표시간 달성율이 72%(지난주보다 8%p 상승)로, 이상 목표시간과",
    );
    expect(priorityTask(facts({ type: { code: "D1", name: "" } }))).toContain(
      "목표시간 달성율 72%(지난주보다 8%p 상승)로 계획의 28%가 밀리고 있습니다.",
    );
    expect(priorityTask(facts({ type: { code: "D2", name: "" } }))).toContain(
      "최소 목표시간을 못 지킨 날이 2일 있어 날마다 편차가 큽니다.",
    );
  });

  test("C1 은 접속 기록을 읽을 수 있을 때만 만든다", () => {
    expect(priorityTask(facts({ type: { code: "C1", name: "" } }))).toBeNull();
    const f = facts({ type: { code: "C1", name: "" } });
    const seen = { ...f, goal: f.goal && { ...f.goal, daysSinceLastSeen: 9 } };
    expect(priorityTask(seen)).toContain("최근 9일간 접속 기록이 없어");
  });

  test("E1 은 긴급도와 가장 낮은 영역과 첫 전략을 넣는다 (r36, r92)", () => {
    expect(priorityTask(facts({ type: { code: "E1", name: "" } }))).toBe(
      "실행은 보통(목표시간 달성율 72%)이고 학습진단 긴급도가 '보통'이고, 계획 설계가 60점(보통)입니다. 우선 과제는 계획 설계 보강이며, 첫 단계는 '월간 계획을 주간, 일간으로 분해'입니다.",
    );
  });

  test("E2 는 목표 75점과의 차이와 가장 시급한 영역을 넣는다 (r48)", () => {
    expect(priorityTask(facts({ type: { code: "E2", name: "" } }))).toBe(
      "실행은 보통(목표시간 달성율 72%)이고 학습 실행 역량이 62점으로 목표 75점에 13점 못 미치고, 가장 시급한 영역은 계획 설계(60점)입니다. 우선 과제는 계획 설계 보강이며, 첫 단계는 '월간 계획을 주간, 일간으로 분해'입니다.",
    );
  });

  test("K, H, I, J 는 축 우선 과제 문장에 원인 상담 문구를 붙인다 (r94)", () => {
    const f = facts({ type: { code: "H", name: "" } });
    const perf = f.axes.axes.find((a) => a.key === "performance");
    expect(priorityTask(f)).toBe(
      `수행평가 완성도가 ${perf?.score}점으로 6축 중 가장 보완이 필요합니다(원인 수행평가 피드백 완료율 67점). 먼저 할 일: 피드백 대기 수행평가 1건 수정, 재제출.`,
    );
  });

  test("A, B, F2, G2 는 자료 없음 상황의 문장이다 (r72, r76, r80, r88)", () => {
    const noDx = facts(
      { type: { code: "A", name: "" } },
      {
        diagnosis: null,
        used: {
          diagnosis: false,
          goal: true,
          growth: true,
          performance: true,
          selfeval: true,
          inquiry: true,
        },
      },
    );
    expect(priorityTask(noDx)).toBe(
      "학습진단 결과가 없어 학습 역량을 판단할 수 없습니다. 실행은 보통입니다(목표시간 달성율 72%). 우선 과제는 학습진단 응시입니다.",
    );
    expect(priorityTask(facts({ type: { code: "B", name: "" } }))).toContain(
      "학습 실행 역량은 62점(목표 75점)이고 가장 시급한 영역은 계획 설계(60점)입니다",
    );
    expect(priorityTask(facts({ type: { code: "F2", name: "" } }))).toContain(
      "경영학과와 연결되는 탐구 질문 1개 정하기입니다.",
    );
    expect(priorityTask(facts({ type: { code: "G2", name: "" } }))).toContain(
      "경영학과 관련 심화탐구를 시작하는 것입니다.",
    );
  });

  test("G1 은 탐구 단계 이름의 출처가 없어 만들지 않는다", () => {
    expect(priorityTask(facts({ type: { code: "G1", name: "" } }))).toBeNull();
  });
});

describe("유형 과제와 향후 진로계획 (r25~r89, r107~r120)", () => {
  test("유형 과제 3개: C2, F1, E2", () => {
    expect(typeTasks(facts({ type: { code: "C2", name: "" } }))).toEqual([
      "최소 목표시간 매일 충족(현재 4/6일)",
      "최소선을 못 지킨 요일의 일정 조정",
      "목표시간 달성율 70% 이상 유지",
    ]);
    expect(typeTasks(facts({ type: F1 }))).toEqual([
      "다음 수행평가 주제를 경영학과와 연결",
      "연결된 활동을 성장설계 스토리에 반영",
      "진로 연결도 70점 이상",
    ]);
    expect(typeTasks(facts({ type: { code: "E2", name: "" } }))?.[1]).toBe(
      "계획 설계: 시험과 수행평가 일정 통합, 이어서 주 1회 계획 조정 시간 고정",
    );
  });

  test("1, 2학년은 칸마다 유형 과제와 서비스 다음 할 일을 둔다 (설계 예시 문장)", () => {
    const plan = careerPlan(facts({ type: F1 }));
    expect(plan?.map((p) => p.label)).toEqual([
      "우선 2주",
      "이번 학기",
      "다음 학기",
    ]);
    expect(plan?.[0]?.items).toEqual([
      "다음 수행평가 주제를 경영학과와 연결",
      "수행평가 '통계로 본 우리 동네'(수학) 피드백 반영 후 재제출",
    ]);
    // 서비스 다음 할 일이 모자라면 기본 문구(r116)로 채운다
    expect(plan?.[1]?.items[1]).toBe(
      "수행평가마다 교과 개념과 경영학과 연결 한 줄 정리",
    );
    expect(plan?.[2]?.items[1]).toBe("학기 활동 기록 정리");
  });

  test("심화탐구를 쓰지 않는 저학년은 주제 탐색을 안내한다 (r108)", () => {
    const f = facts(
      { type: F1, pendingPerformance: [] },
      {
        used: {
          diagnosis: true,
          goal: true,
          growth: true,
          performance: true,
          selfeval: true,
          inquiry: false,
        },
      },
    );
    expect(careerPlan(f)?.[0]?.items[1]).toBe(
      "경영학과 관련 심화탐구 주제 탐색 시작",
    );
  });

  test("3학년은 달에 따라 시기 과제를 둔다 (r117~r120)", () => {
    const plan = careerPlan(facts({ type: F1, grade: "고3", month: 5 }));
    expect(plan?.map((p) => p.label)).toEqual([
      "지금 ~ 4주",
      "1학기 중",
      "여름방학",
    ]);
    expect(plan?.[0]?.items).toEqual([
      "다음 수행평가 주제를 경영학과와 연결",
      "이상, 최소 목표대학 기준 전형 유형 점검",
    ]);
    expect(plan?.[1]?.items[0]).toBe(
      "서류에 쓸 활동 근거 선별('도시 열섬 완화 방안' 포함)",
    );
    expect(
      careerPlan(facts({ type: F1, grade: "고3", month: 8 }))?.[0]?.label,
    ).toBe("지금 ~ 원서 접수");
    expect(
      careerPlan(facts({ type: F1, grade: "고3", month: 1 }))?.[2]?.label,
    ).toBe("졸업 전");
  });

  test("3학년이고 수행평가, 심화탐구 기록이 없으면 면접 문장으로 바꾼다", () => {
    const plan = careerPlan(
      facts({
        type: F1,
        grade: "고3",
        month: 5,
        pendingPerformance: [],
        inquiryTopic: null,
      }),
    );
    expect(plan?.[1]?.items[0]).toBe("면접에서 말할 활동 1건 정리");
  });
});

describe("학습방법 (r95~r106)", () => {
  test("설계 예시: 공통 문구, 학습진단 전략 둘, 피드백 체크리스트", () => {
    expect(studyMethods(facts({ type: F1 }))).toEqual([
      "공부량이 적은 요일에 최소 목표시간 알림 설정",
      "계획 설계: 월간 계획을 주간, 일간으로 분해, 이어서 계획을 문제 수, 페이지 단위로 작성",
      "수학 수행평가 피드백을 다음 제출 전 체크리스트로 만들기",
    ]);
  });

  test("실행 판정별 공통 문구 (r95~r99)", () => {
    const withExec = (
      level: "good" | "caution" | "no_data",
      pct: number | null,
    ) => {
      const f = facts({ type: F1 });
      return studyMethods({
        ...f,
        verdicts: { ...f.verdicts, execution: { level } },
        goal: f.goal && {
          ...f.goal,
          week: { ...f.goal.week, achievementPct: pct },
        },
      })[0];
    };
    expect(withExec("caution", 60)).toBe(
      "밀리는 과목을 하루 단위로 쪼개 배치하기",
    );
    expect(withExec("good", 85)).toBe(
      "목표시간 달성율 80% 이상을 유지하며 남는 시간을 탐구에 배정하기",
    );
    expect(withExec("good", 75)).toBe(
      "목표시간 달성율을 75%에서 80%까지 끌어올리며 오답, 개념 노트를 탐구 질문으로 연결하기",
    );
    expect(withExec("no_data", null)).toBe(
      "하루 이상, 최소 목표시간을 정하고 실제 학습시간을 매일 기록하기",
    );
  });

  test("C 와 D 유형은 유형 학습방법을 쓴다", () => {
    expect(studyMethods(facts({ type: { code: "C2", name: "" } }))[0]).toBe(
      "최소 목표시간을 하루 첫 공부 블록에 먼저 배치하기",
    );
    expect(studyMethods(facts({ type: { code: "D1", name: "" } }))[0]).toBe(
      "밀리는 과목을 하루 단위로 쪼개 배치하기",
    );
    expect(
      studyMethods(facts({ type: { code: "C3", name: "" } }))[0],
    ).toContain("지난주 실제 평균 학습시간보다 30분 많게 잡기");
  });

  test("학습진단이 없으면 응시를 안내하고 대기 수행평가가 없으면 성장설계 키워드를 쓴다 (r100, r105)", () => {
    const f = facts({ type: F1, pendingPerformance: [] }, { diagnosis: null });
    const out = studyMethods(f);
    expect(out[1]).toBe("학습진단을 응시해 가장 시급한 영역 확인하기");
    expect(out[2]).toBe("수행평가마다 '도시 재생'과 연결되는 한 줄 정리");
  });
});

describe("강점과 보완 (r133~r149)", () => {
  test("학습진단 최고 영역이 80점이면 강점이 되고 그다음 성장설계 키워드가 나온다 (r134, r136)", () => {
    expect(strengths(facts({ type: F1 }))).toEqual([
      "수행 대응 80점(양호), 학습진단에서 가장 높은 영역으로 상담의 출발점",
      "성장설계 키워드(도시 재생, 탄소 중립)가 정리되어 있음",
    ]);
  });

  test("강점: 실행 양호와 학습진단 80점 이상과 연계 양호가 위에서부터 최대 3개", () => {
    const f = facts({ type: F1 });
    const good = {
      ...f,
      verdicts: {
        execution: { level: "good" as const },
        learning: f.verdicts.learning,
        linkage: { level: "good" as const },
      },
      goal: f.goal && { ...f.goal, streak: 3 },
    };
    const out = strengths(good);
    expect(out[0]).toBe(
      "목표시간 달성율 72%, 지난주보다 8%p 상승, 최소 목표시간 4/6일 충족, 3일 연속",
    );
    expect(out[1]).toBe(
      "수행 대응 80점(양호), 학습진단에서 가장 높은 영역으로 상담의 출발점",
    );
    expect(out[2]).toBe("진로 연결도 63점");
    expect(out).toHaveLength(3);
  });

  test("강점이 하나도 없으면 안내 문장 (r137)", () => {
    const f = facts({ type: F1, growthKeywords: [] });
    expect(
      strengths({ ...f, metrics: { ...f.metrics, diagnosis: null } }),
    ).toEqual(["아직 뚜렷한 강점 근거가 쌓이지 않았습니다."]);
  });

  test("설계 예시: 보완 세 줄과 네 번째 줄은 잘린다", () => {
    expect(weaknesses(facts({ type: F1 }))).toEqual([
      "목표시간 달성율 72%, 최소 충족 4/6일: 계획 조정 필요",
      "계획 설계 60점(보통): 가장 시급한 영역, 목표까지 15점",
      "경영학과와의 연결 부족(진로 연결도 63점)",
    ]);
  });

  test("H, I, J, K 유형은 가장 낮은 축이 맨 위다 (r138)", () => {
    const out = weaknesses(facts({ type: { code: "H", name: "" } }));
    expect(out[0]).toMatch(
      /^수행평가 완성도 \d+점: 6축 중 가장 낮음\(원인 수행평가 피드백 완료율 67점\)$/,
    );
  });

  test("목표관리 미이용, 목표 없음, 실행 위험은 각자 문장이다 (r139~r141)", () => {
    const unused = facts(
      { type: F1, goal: null },
      {
        used: {
          diagnosis: true,
          goal: false,
          growth: true,
          performance: true,
          selfeval: true,
          inquiry: true,
        },
        goal: null,
      },
    );
    expect(weaknesses(unused)[0]).toBe(
      "목표관리 미이용: 목표대학과 하루 목표시간 설정 필요",
    );
    const f = facts({ type: F1 });
    const none = {
      ...f,
      verdicts: {
        ...f.verdicts,
        execution: { level: "no_data" as const, reason: "목표 없음" },
      },
    };
    expect(weaknesses(none)[0]).toBe(
      "최근 7일 목표시간 없음: 하루 목표시간 설정 필요",
    );
    const risk = (reason: string) =>
      weaknesses({
        ...f,
        verdicts: {
          ...f.verdicts,
          execution: { level: "risk" as const, reason },
        },
      })[0];
    expect(risk("최소 미충족")).toBe(
      "최소 목표시간 4/6일 충족(지난주 3일): 습관 회복 필요",
    );
    expect(risk("달성율 낮음")).toBe(
      "목표시간 달성율 72%, 지난주보다 8%p 상승: 습관 회복 필요",
    );
  });

  test("학습진단 미실시, 준비도 최저 60 미만, 연계 자료 없음, 보완 없음 (r143, r145, r147, r149)", () => {
    const f = facts({ type: F1, pendingPerformance: [] });
    const noDx = weaknesses({
      ...f,
      metrics: { ...f.metrics, diagnosis: null },
    });
    expect(noDx).toContain("학습진단 미실시: 학습 역량 판단 불가");
    const lowPrep = facts(
      { type: F1, pendingPerformance: [] },
      { diagnosis: { areas: { ...AREAS, SUBJECT: 55 }, trend: "up" } },
    );
    expect(weaknesses(lowPrep)).toContain(
      "학교생활 준비도: 교과 관리 55점(보완 필요): 과목별 성적 추이 정리",
    );
    const noLink = {
      ...f,
      verdicts: { ...f.verdicts, linkage: { level: "no_data" as const } },
    };
    expect(weaknesses(noLink)).toContain(
      "성장설계, 수행평가, 심화탐구 기록 없음: 진로 연결 확인 불가",
    );
    const clean = {
      ...f,
      verdicts: {
        execution: { level: "good" as const },
        learning: { level: "good" as const },
        linkage: { level: "good" as const },
      },
    };
    expect(weaknesses(clean)).toEqual([
      "뚜렷한 보완점은 없습니다. 월 1회 상태 유지를 점검하세요.",
    ]);
  });

  test("피드백 대기 수행평가는 둘 이상이면 외 n건을 붙인다 (r148)", () => {
    const f = facts({
      type: F1,
      pendingPerformance: [
        { title: "가", subject: "수학" },
        { title: "나", subject: "영어" },
        { title: "다", subject: "국어" },
      ],
    });
    const clean = {
      ...f,
      verdicts: {
        execution: { level: "good" as const },
        learning: { level: "good" as const },
        linkage: { level: "good" as const },
      },
    };
    expect(weaknesses(clean)).toEqual(["피드백 대기 수행평가 '가' 외 2건"]);
  });
});

describe("종합 진단 상담 포인트 (r159~r179)", () => {
  test("70점 미만 축마다 원인 지표별 상담 문구를 붙이고 낮은 축부터 최대 2개, 한줄 진단이 다룬 축은 뺀다 (r159~r177)", () => {
    const low = facts(
      { type: F1 },
      { performance: { avgScore: 50, tasks: 3, feedbackDone: 2 } },
    );
    expect(counselPoints(low)).toEqual([
      '수행평가 완성도 66점, 원인 수행평가 평가 점수 50점: 수행평가 평가 리포트의 "보완할 점"을 다음 과제에 먼저 반영',
      "학습 실행력 67점, 원인 학습진단 학습 실행 역량 62점: 학습진단 가장 시급한 영역(계획 설계)부터, 월간 계획을 주간, 일간으로 분해",
    ]);
    expect(
      counselPoints({ ...low, type: { code: "H", name: "" } }).some((p) =>
        p.startsWith("수행평가 완성도"),
      ),
    ).toBe(false);
    expect(
      counselPoints(facts({ type: { code: "D1", name: "" } })).some((p) =>
        p.startsWith("학습 실행력"),
      ),
    ).toBe(false);
  });

  test("성적 입력값 확인은 0.5등급 이상 차이일 때만 (r178)", () => {
    expect(gradeInputCheck(facts())).toBeNull();
    expect(
      gradeInputCheck(
        facts({ gradeCheck: { diagnosis: 3.2, goalInput: 3.6 } }),
      ),
    ).toBeNull();
    expect(
      gradeInputCheck(facts({ gradeCheck: { diagnosis: 3.2, goalInput: 4 } })),
    ).toBe(
      "성적 입력값 확인: 학습진단 평균 내신 3.2등급과 목표관리 입력 내신 4등급이 0.8등급 다릅니다. 최근 성적표로 두 서비스 입력값을 함께 확인",
    );
  });
});

describe("목표관리 상담 의견 (r150~r158, r185~r201)", () => {
  test("목표관리 미이용과 목표 없음은 한 줄만 (r150, r151)", () => {
    const unused = facts(
      { goal: null },
      {
        goal: null,
        used: {
          diagnosis: true,
          goal: false,
          growth: true,
          performance: true,
          selfeval: true,
          inquiry: true,
        },
      },
    );
    expect(goalOpinion(unused)).toEqual({
      summary:
        "목표관리를 아직 시작하지 않았습니다. 이상, 최소 목표대학과 하루 목표시간 설정부터 안내하세요.",
      details: null,
    });
    const f = facts();
    const none = {
      ...f,
      verdicts: { ...f.verdicts, execution: { level: "no_data" as const } },
    };
    expect(goalOpinion(none)?.summary).toBe(
      "최근 7일 동안 설정된 목표시간이 없습니다. 하루 이상, 최소 목표시간이 생성되는지부터 함께 확인하세요.",
    );
  });

  test("설계 예시: 주의 요약과 기록 흐름, 요일 패턴, 방해 요인, 상담 질문", () => {
    const opinion = goalOpinion(facts());
    expect(opinion?.summary).toBe(
      "목표시간 달성율 72%, 지난주보다 8%p 상승, 최소 목표시간 충족 4/6일입니다. 못 지킨 요일을 함께 찾아 그날 일정을 조정하세요.",
    );
    expect(opinion?.details).toEqual({
      recordFlow:
        "최소 목표시간 충족 지난주 3일, 이번 주 4/6일, 연속 기록 1일.",
      weekdayPattern:
        "최소 목표시간을 못 지킨 날: 목요일(10/29), 토요일(10/31). 가장 적게 한 날 목요일(이상 목표의 40%), 가장 많이 한 날 수요일(110%). 토요일 달성율이 월~금 평균보다 38%p 낮습니다.",
      distractions: "학생이 기록한 방해 요인: 스마트폰 3회, 컨디션 1회.",
      questions: [
        "목요일, 토요일에 반복되는 일정이 있는지 묻고, 그날 최소 목표시간을 하루 첫 일정으로 옮기기",
        "토요일 학습 시작 시각을 미리 정해 두기",
        "방해 요인 1위 '스마트폰': 공부 시간에는 휴대폰을 다른 공간에 두는 규칙 정하기",
      ],
    });
  });

  test("판정별 요약 (r152~r158)", () => {
    const f = facts();
    const withVerdict = (
      level: "risk" | "caution" | "good",
      reason?: string,
      over: Partial<NonNullable<TextFacts["goal"]>> = {},
    ) =>
      goalOpinion({
        ...f,
        verdicts: {
          ...f.verdicts,
          execution: { level, ...(reason ? { reason } : {}) },
        },
        goal: f.goal && { ...f.goal, ...over },
      })?.summary;
    expect(withVerdict("risk", "미접속", { daysSinceLastSeen: 8 })).toBe(
      "최근 8일간 접속 기록이 없습니다. 실행이 어려웠던 이유를 학생 말로 먼저 듣고, 최소 목표시간만 지키는 것부터 다시 시작하세요.",
    );
    expect(withVerdict("risk", "최소 미충족")).toBe(
      "최근 7일 목표일 6일 중 최소 목표시간을 4일만 지켰습니다(지난주 3일). 이상 목표보다 최소 목표를 매일 지키는 약속을 먼저 하세요.",
    );
    expect(withVerdict("risk", "달성율 낮음")).toBe(
      "목표시간 달성율이 72%(지난주보다 8%p 상승)로 낮습니다. 이상 목표시간이 현실보다 높게 잡혔는지 함께 점검하세요.",
    );
    expect(withVerdict("good", undefined, { streak: 4 })).toBe(
      "실행이 안정적입니다(달성율 72%, 지난주보다 8%p 상승, 4일 연속 최소 목표 충족). 연속 기록 칭찬으로 시작하고, 늘어난 여유 시간은 심화탐구로 옮기도록 안내하세요.",
    );
    expect(withVerdict("good", undefined, { streak: 1 })).toBe(
      "실행이 안정적입니다(달성율 72%, 지난주보다 8%p 상승). 최근 연속 기록이 끊겼으니 다시 이어갈 방법을 함께 정하세요.",
    );
  });

  test("기록 흐름: 연속 3일 이상이면 유지 중, 0일이면 끊김, 일요일 학습은 달성율에 더해진 값을 말한다 (r185)", () => {
    const f = facts();
    const flow = (streak: number, days: GoalDay[] = DAYS) =>
      goalOpinion({ ...f, goal: f.goal && { ...f.goal, streak, days } })
        ?.details?.recordFlow;
    expect(flow(3)).toContain("연속 기록 3일(유지 중).");
    expect(flow(0)).toContain("연속 기록 0일(최근 목표일에 끊김).");
    const sunday = DAYS.map((d) =>
      d.weekday === "sun" ? { ...d, actual: 1.5 } : d,
    );
    expect(flow(1, sunday)).toContain(
      "일요일에 1.5시간 더 공부해 주간 달성율에 5%p가 더해졌습니다.",
    );
  });

  test("요일 패턴: 모두 지켰으면 그 문장이고 방해 요인이 없으면 안내한다 (r186, r187)", () => {
    const f = facts();
    const allMet = DAYS.map((d) => ({
      ...d,
      actual: d.weekday === "sun" ? 0 : 5,
    }));
    const opinion = goalOpinion({
      ...f,
      goal: f.goal && { ...f.goal, days: allMet, reasons: [] },
    });
    expect(
      opinion?.details?.weekdayPattern.startsWith(
        "목표일 6일 모두 최소 목표시간을 지켰습니다.",
      ),
    ).toBe(true);
    expect(opinion?.details?.distractions).toBe(
      "이번 주 기록된 방해 요인이 없습니다. 방해 요인을 함께 기록하도록 안내하세요.",
    );
    expect(opinion?.details?.questions).toEqual([
      "지금 패턴을 유지하며 남는 시간을 심화탐구에 배정",
    ]);
  });

  test("방해 요인별 안내는 앱의 이유만 쓰고 없는 이유는 안내를 붙이지 않는다 (r195~r201, 결정 5)", () => {
    const f = facts();
    const ask = (reason: string) =>
      goalOpinion({
        ...f,
        goal: f.goal && {
          ...f.goal,
          reasons: [reason],
          days: DAYS.map((d) => ({ ...d, actual: 5 })),
        },
      })?.details?.questions;
    expect(ask("학원 과제")).toEqual([
      "방해 요인 1위 '학원 과제': 학원 과제 시간을 목표시간에 포함해 이상 목표시간 다시 잡기",
    ]);
    expect(ask("수면 부족")?.[0]).toContain("취침 시각을 먼저 고정");
    expect(ask("동아리·행사")?.[0]).toContain("행사 주간은 최소 목표시간만");
    expect(ask("컨디션")?.[0]).toContain("컨디션이 나쁜 날의 최소 학습량");
    expect(ask("친구 약속")?.[0]).toContain("약속이 있는 날은");
    expect(ask("게임")?.[0]).toContain("게임은 최소 목표시간을 채운 뒤로");
    expect(ask("집중 안 됨")).toEqual([
      "지금 패턴을 유지하며 남는 시간을 심화탐구에 배정",
    ]);
  });
});

describe("buildCoachingText", () => {
  test("모든 칸을 한 번에 만든다", () => {
    const f = facts({ type: F1 });
    const text = buildCoachingText(f);
    expect(Object.keys(text).sort()).toEqual([
      "careerPlan",
      "competencyGap",
      "goalOpinion",
      "gradeInputCheck",
      "points",
      "priorityTask",
      "serviceCards",
      "strengths",
      "studyMethods",
      "weaknesses",
    ]);
    expect(signalOf(f.verdicts, f.axes.axes).signal).toBe("caution");
  });
});
