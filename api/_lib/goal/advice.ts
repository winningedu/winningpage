// 목표관리 AI 조언(QA 행295·306) — 프롬프트 조립 · 컴플라이언스 후처리 · 규칙 기반
// 폴백을 담은 순수 함수 모음. DB I/O·Gemini 호출은 전혀 하지 않는다(api/goal/advice.ts
// 가 이 모듈의 결과를 캐시·응답에 배선한다) — 그래서 전부 결정적으로 단위 테스트할 수
// 있다(majorTheme 랜덤만 예외, 호출부가 rand 함수를 주입할 수 있게 열어 둔다).
//
// 원본 이식 대상: target/App.tsx:1094-1253(프롬프트 조립·로테이션), :1323-1351(후처리).
// docs/figma-goal/target-app-analysis.md §7.1 실측과 대조 완료.
//
// 학생명은 어느 문맥에도 넣지 않는다 — goal_students 스키마에 표시 이름 컬럼이 없고
// (src/lib/goal/report/insights.ts 파일 헤더와 동일 판단), 사이드바가 이미 이름을
// 표기한다(팀장 지시 "학생명 제외").

// ---------------------------------------------------------------------------
// 로테이션 — submitCount % 5(관점·내일 계획 모드는 결정적), 학과 테마는 랜덤(원본과 동일)
// ---------------------------------------------------------------------------

export const ADVICE_THEMES = [
  "학습전략",
  "멘탈 관리",
  "동기부여",
  "생기부 관리",
  "과목별 보완",
] as const;

export type AdviceTheme = (typeof ADVICE_THEMES)[number];

export type PlanMode = {
  key:
    | "time_allocation"
    | "weak_subject"
    | "plan_completion"
    | "wrong_answer"
    | "condition_control";
  instruction: string;
};

// App.tsx:1114-1138 원문 그대로 이식.
export const PLAN_MODES: PlanMode[] = [
  {
    key: "time_allocation",
    instruction:
      "내일 목표 시간을 기준으로 과목과 과제를 나누어 배치하고, 시작 순서와 마무리 기준을 함께 제시해라.",
  },
  {
    key: "weak_subject",
    instruction:
      "약점 과목을 먼저 보완하고, 개념 확인 후 기본 문제와 오답 확인으로 이어지는 흐름을 제시해라.",
  },
  {
    key: "plan_completion",
    instruction:
      "내일 계획표에 적힌 항목을 하나씩 완료하는 것을 목표로, 우선순위와 완료 기준을 분명히 제시해라.",
  },
  {
    key: "wrong_answer",
    instruction:
      "오답과 기출 문제를 중심으로 틀린 이유를 확인하고, 비슷한 유형을 다시 풀어보는 흐름을 제시해라.",
  },
  {
    key: "condition_control",
    instruction:
      "오늘 컨디션과 집중도를 고려하여 고난도 학습과 가벼운 복습의 순서를 조절하는 방향으로 제시해라.",
  },
];

export const MAJOR_THEMES = [
  "전공 핵심 과목",
  "졸업 후 진출 분야",
  "학과 관련 추천 활동",
  "학과에서 요구하는 역량",
] as const;

export type MajorTheme = (typeof MAJOR_THEMES)[number];

/** submitCount(goal_daily_records 누적 제출 수) 기준 결정적 로테이션. */
export function pickAdviceTheme(submitCount: number): AdviceTheme {
  const idx = Math.max(0, Math.trunc(submitCount)) % ADVICE_THEMES.length;
  return ADVICE_THEMES[idx] as AdviceTheme;
}

/** submitCount 기준 결정적 로테이션(관점과 같은 나머지 연산이지만 독립 인덱스다 — 원본 동일). */
export function pickPlanMode(submitCount: number): PlanMode {
  const idx = Math.max(0, Math.trunc(submitCount)) % PLAN_MODES.length;
  return PLAN_MODES[idx] as PlanMode;
}

/**
 * 학과 테마는 원본이 `Math.floor(Math.random()*4)`로 뽑는 유일한 비결정 로테이션이다.
 * 테스트에서 결정적으로 검증할 수 있도록 rand(0~1 난수 생성기)를 주입받는다.
 */
export function pickMajorTheme(rand: () => number = Math.random): MajorTheme {
  const idx = Math.min(
    MAJOR_THEMES.length - 1,
    Math.floor(Math.max(0, Math.min(1, rand())) * MAJOR_THEMES.length),
  );
  return MAJOR_THEMES[idx] as MajorTheme;
}

// ---------------------------------------------------------------------------
// 프롬프트 입력 — api/goal/advice.ts 가 DB 행을 이 모양으로 정규화해 넘긴다.
// ---------------------------------------------------------------------------

export type AdviceStudentContext = {
  schoolType: string;
  grade: string;
  currentScore: number | null;
  currentMogo: number | null;
  convertedGrade: number | null;
  idealName: string;
  minName: string;
  idealSusi: number | null;
  idealJungsi: number | null;
  minSusi: number | null;
  minJungsi: number | null;
  jungsiAvailable: boolean;
  /** 학습방향 요약(있으면) — api/goal/advice.ts 가 buildNaesinSubjectMetrics 등으로 best-effort 산출. */
  studentType: { title: string; summary: string; weakSubjects: string } | null;
};

/** source='daily' 전용 — 오늘 기록 참고 데이터. */
export type AdviceTodayContext = {
  studyHours: number;
  /** 이상 목표 시간 대비 달성률(%), 목표 시간이 0이면 null. */
  achievementRate: number | null;
  /** CONDITION_LABELS 한글 라벨, 미제출이면 ''. */
  condition: string;
  /** TASK_LABELS 한글 라벨 배열. */
  tasks: string[];
  /** REASON_LABELS 한글 라벨 배열. */
  reasons: string[];
  memo: string;
};

export type AdviceTomorrowContext = {
  dayNameKr: string;
  idealHours: number;
  minHours: number;
  /** buildTomorrowPlan()과 동일한 과목별 배분(빈 배열 허용). */
  planItems: { subject: string; duration: string }[];
};

export type AdvicePromptInput = {
  source: "intake" | "daily";
  student: AdviceStudentContext;
  /** source='daily'일 때만 채운다. */
  today: AdviceTodayContext | null;
  tomorrow: AdviceTomorrowContext;
  /** 최근 3일(오늘 제외) 기록 요약 — 표현 반복 방지용. 자료 없으면 ''. */
  recentUsedText: string;
  adviceTheme: AdviceTheme;
  planMode: PlanMode;
  majorTheme: MajorTheme;
};

const naOr = (value: unknown, unit = ""): string =>
  value === null || value === undefined || value === ""
    ? "미입력"
    : `${value}${unit}`;

/**
 * 내신 등급(1~9, 낮을수록 우세) 전용 표기 — 단위·방향을 문장에 명시한다. 2026-09-02
 * 로컬 E2E에서 모델이 백분위(currentMogo)를 "%"로 오기했다(단위 없이 숫자만 주면
 * 모델이 임의로 단위를 추측한다) — 같은 문제를 막기 위해 등급도 동일하게 명시한다.
 */
const formatGradeValue = (value: number | null): string =>
  value === null ? "미입력" : `${value}등급(9등급제, 1이 최상)`;

/**
 * 정시 백분위(0~100, 높을수록 우세) 전용 표기. "%"를 붙이지 않는다 — 백분위는
 * 퍼센트가 아니다(모델이 "모의고사 29.67%"처럼 오기했던 원인).
 */
const formatPercentileValue = (value: number | null): string =>
  value === null ? "미입력" : `종합 백분위 ${value}(100이 최상)`;

/**
 * "확인 필요" 표기 — 원본이 참고 데이터 없을 때 쓰던 자리표시자(App.tsx `?? '확인 필요'`)
 * 그대로다. 프롬프트 안에서만 쓰는 문구라 no-fallback-constants 대상이 아니다(화면에
 * 노출되는 문자열이 아니라 모델 입력이다).
 */
const checkNeeded = (value: string | null | undefined): string =>
  value?.trim() ? value : "확인 필요";

/**
 * Gemini 프롬프트 전문 조립. App.tsx:1143-1253 이식 — 학생명 삭제, 확률 요약은
 * 코드가 별도 필드로 붙이므로(§3.16 ①) 모델에게 만들지 말라고 명시한다(원본 동일
 * 지시 "[확률 요약]은 코드에서 따로 붙이므로 절대 쓰지 마라").
 *
 * source='daily'와 'intake'는 참고 데이터 절만 다르다 — intake는 오늘 기록이 없으므로
 * "최초 진단" 맥락 문장으로 대체한다(설계 §6 트리거 2종).
 */
export function buildAdvicePrompt(input: AdvicePromptInput): string {
  const { source, student, today, tomorrow, recentUsedText } = input;

  const todayDataBlock =
    source === "daily" && today
      ? `오늘의 조언 참고 데이터
오늘 학습시간 ${today.studyHours}시간
오늘 성취도 ${today.achievementRate != null ? `${today.achievementRate}% (이상 목표 대비)` : "확인 필요"}
오늘 컨디션 ${checkNeeded(today.condition)}
오늘 학습 항목 ${today.tasks.length ? today.tasks.join(", ") : "확인 필요"}
오늘 방해 요인 ${today.reasons.length ? today.reasons.join(", ") : "없음"}
오늘 메모 ${today.memo ? today.memo : "사용하지 않음"}`
      : `오늘의 조언 참고 데이터
상황 온보딩(최초 진단) 직후이며 아직 학습 기록이 없다
학교구분 ${naOr(student.schoolType)}
학년 ${naOr(student.grade)}`;

  const planItemsText = tomorrow.planItems.length
    ? tomorrow.planItems
        .map((item) => `${item.subject} ${item.duration}`)
        .join(", ")
    : "확인 필요";

  return `
너는 입시 컨설턴트다. 허구의 사실을 만들지 말고, 확실하지 않은 최신 수치나 사례는 쓰지 마라.
출력은 반드시 아래 순서로만 작성해라.

[오늘의 조언]
문장

[내일 계획 제시]
문장

---SEP---

[학과명]
문장

[학과명]
문장

---SEP---는 전체 답변에서 반드시 한 번만 사용해라.
---SEP---는 [내일 계획 제시]가 끝난 뒤, 학과 이슈가 시작되기 직전에만 넣어라.
[오늘의 조언]과 [내일 계획 제시] 사이에는 ---SEP---를 절대 넣지 마라.
마크다운 기호(#, *, -), 콜론(:)은 쓰지 마라.

요청1 입시 조언
학년 ${naOr(student.grade)}
학교구분 ${naOr(student.schoolType)}
현재 내신 ${formatGradeValue(student.currentScore)}
현재 모의고사 ${formatPercentileValue(student.currentMogo)}
변환등급 ${formatGradeValue(student.convertedGrade)}

이상목표 ${student.idealName || "미입력"}
이상목표 수시 ${naOr(student.idealSusi, "%")}
이상목표 정시 ${student.jungsiAvailable ? naOr(student.idealJungsi, "%") : "미산출"}
최소목표 ${student.minName || "미입력"}
최소목표 수시 ${naOr(student.minSusi, "%")}
최소목표 정시 ${student.jungsiAvailable ? naOr(student.minJungsi, "%") : "미산출"}

조언 관점 ${input.adviceTheme}
내일 계획 방향 ${input.planMode.instruction}

학생유형 ${student.studentType?.title || "확인 필요"}
학생유형 설명 ${student.studentType?.summary || "확인 필요"}
약점 또는 우선관리 과목 ${student.studentType?.weakSubjects || "확인 필요"}

${todayDataBlock}

내일 계획 참고 데이터
내일 요일 ${tomorrow.dayNameKr}
내일 최소 목표 시간 ${tomorrow.minHours}시간
내일 이상 목표 시간 ${tomorrow.idealHours}시간
내일 계획표 ${planItemsText}
내일 보완 참고 ${student.studentType?.weakSubjects || "확인 필요"}

최근 사용한 데이터와 표현
${recentUsedText || "없음"}

출력 형식
[오늘의 조언]
문장

[내일 계획 제시]
문장

조건
[확률 요약]은 코드에서 따로 붙이므로 절대 쓰지 마라
[오늘의 조언]에서는 조언 관점 ${input.adviceTheme}을 반드시 반영해라
[오늘의 조언]에서는 이상목표와 최소목표의 현재 위치를 비교해라
[오늘의 조언]에서는 성적데이터나 학생유형 중 하나 이상을 자연스럽게 반영해라
[내일 계획 제시]에서는 내일 계획 방향을 자연스럽게 반영해라
[내일 계획 제시]에서는 시간배치형, 약점보완형, 계획완료형, 오답정리형, 컨디션관리형 같은 내부 분류명을 절대 쓰지 마라
[내일 계획 제시]에서는 학습 방식, 방식을 바탕으로 같은 표현을 쓰지 말고 학생이 실제로 해야 할 행동 중심으로 말해라
[오늘의 조언]에서는 오늘의 조언 참고 데이터만 사용해라
[오늘의 조언]에서는 내일 계획표, 내일 목표 시간, 내일 보완 참고를 언급하지 마라
[오늘의 조언]에서는 같은 취약 과목명을 반복하기보다 성적 위치, 학습 태도, 집중도, 목표 간 차이 중 하나를 중심으로 말해라

[내일 계획 제시]에서는 내일 계획 참고 데이터만 사용해라
[내일 계획 제시]에서는 오늘 학습내용, 오늘 메모, 오늘 방해요인을 언급하지 마라
[내일 계획 제시]에서는 내일 목표 시간과 내일 계획표를 우선 활용해라
[내일 계획 제시]에서는 최근 사용한 데이터와 표현에 포함된 과목명, 완료 기준, 문장 구조를 가능한 한 반복하지 마라
[내일 계획 제시]에서는 시간배치형, 약점보완형, 계획완료형, 오답정리형, 컨디션관리형 같은 내부 분류명을 절대 쓰지 마라
[내일 계획 제시]에서는 학습 방식, 방식을 바탕으로 같은 표현을 쓰지 말고 학생이 실제로 해야 할 행동 중심으로 말해라

한국사류, 과학류, 국어류, 수학류, 영어류라는 표현을 쓰지 마라
과목이라는 단어를 불필요하게 붙이지 마라
각 항목은 1문장씩만 작성해라
모든 문장은 반드시 완결된 문장으로 끝내라
문장을 중간에서 끊지 마라
존댓말로 작성해라. 학생 이름을 언급하지 마라(이름을 알지 못한다).
요청2 학과 이슈는 [학과명] 형식으로 시작해라.

요청2 학과 이슈
테마 ${input.majorTheme}
대상 학과
1 ${student.idealName || "미입력"}
2 ${student.minName || "미입력"}
조건
각 학과는 반드시 [학과명] 형식으로 시작
각 학과 2문장 이내
총 500자 이내
불확실한 수치 금지
일반적으로 확인 가능한 내용만 작성
`.trim();
}

/**
 * Gemini `responseSchema` — App.tsx의 평문 `---SEP---` 파싱(splitAIResponseSafely)을
 * 구조화 출력으로 대체한다(설계 §6). majorTips는 이상/최소 목표 학과 2개 고정.
 */
export const ADVICE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    todayAdvice: { type: "string" },
    tomorrowPlan: { type: "string" },
    majorTips: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          department: { type: "string" },
          text: { type: "string" },
        },
        required: ["department", "text"],
        propertyOrdering: ["department", "text"],
      },
    },
  },
  required: ["todayAdvice", "tomorrowPlan", "majorTips"],
  propertyOrdering: ["todayAdvice", "tomorrowPlan", "majorTips"],
};

export type AdviceModelResult = {
  todayAdvice: string;
  tomorrowPlan: string;
  majorTips: { department: string; text: string }[];
};

// ---------------------------------------------------------------------------
// 후처리 — App.tsx:1323-1348 이식 + 고객사 컴플라이언스 필터(Dashboard.tsx:44-52 주석 반영)
// ---------------------------------------------------------------------------

/** 내부 분류명 → 자연어 치환. App.tsx cleanedAdvice 정규식 그대로 이식. */
const CLASSIFICATION_REPLACEMENTS: [RegExp, string][] = [
  [/시간배치형\s*학습\s*방식을\s*바탕으로/g, "목표 시간을 과목별로 나누어"],
  [/약점보완형\s*학습\s*방식을\s*바탕으로/g, "약점 과목 보완을 중심으로"],
  [/계획완료형\s*학습\s*방식을\s*바탕으로/g, "계획 완료를 목표로"],
  [/오답정리형\s*학습\s*방식을\s*바탕으로/g, "오답 정리를 중심으로"],
  [/컨디션관리형\s*학습\s*방식을\s*바탕으로/g, "컨디션을 고려해"],
  [/시간배치형/g, "목표 시간 배치"],
  [/약점보완형/g, "약점 보완"],
  [/계획완료형/g, "계획 완료"],
  [/오답정리형/g, "오답 정리"],
  [/컨디션관리형/g, "컨디션 관리"],
  [/학습\s*방식/g, "학습 방향"],
  [/방식을\s*바탕으로/g, "방향으로"],
];

/**
 * 백분위 단위 오기 교정 — 2026-09-02 로컬 E2E에서 모델이 정시 백분위(currentMogo,
 * 100이 최상, %가 아니다)를 "모의고사 29.67%"처럼 퍼센트로 오기했다. 프롬프트에
 * 단위·방향을 명시(formatPercentileValue)했지만 모델이 여전히 "%"를 붙일 수 있어
 * 마지막 방어선을 둔다 — "백분위"/"모의고사" 뒤 10자 이내에 나온 숫자+%의 "%"만
 * 제거한다(다른 문맥의 정상적인 퍼센트 표현, 예: 이상목표 수시 40% 는 건드리지 않는다).
 */
const PERCENTILE_UNIT_FIX: [RegExp, string][] = [
  [/(백분위|모의고사)([^%\n]{0,10}?)(\d+(?:\.\d+)?)\s*%/g, "$1$2$3"],
];

/**
 * 고객사 컴플라이언스 필터(Dashboard.tsx:44-52 확정 문구 — "반드시/100%/보장" 같은 확정
 * 단정, "늦었다/돌이킬 수 없다" 같은 공포 소구, "의지가 약하다" 같은 낙인 문구 금지).
 * 모델이 지시를 어기고 이런 표현을 냈을 때의 마지막 방어선이다 — 프롬프트 지시만으로는
 * 100% 보장되지 않는다.
 */
const COMPLIANCE_REPLACEMENTS: [RegExp, string][] = [
  // 확정 단정
  [
    /반드시\s*(합격|성공|달성)(합니다|해요|한다|할 수 있습니다)?/g,
    "꾸준히 노력하면 좋은 결과로 이어질 수 있습니다",
  ],
  [/100\s*%\s*(합격|성공)?/g, "높은 가능성"],
  [/(을|를)?\s*보장(합니다|해요|한다|드립니다)/g, "도움이 됩니다"],
  // 공포 소구
  [/이미\s*늦었(습니다|어요|다)/g, "지금부터 시작해도 늦지 않았습니다"],
  [/더\s*늦기\s*전에/g, "지금부터"],
  [/돌이킬\s*수\s*없(습니다|어요|다)/g, "지금부터 방향을 바꿀 수 있습니다"],
  // 낙인 문구
  [/의지가\s*약하(다|습니다|네요|고)/g, "조금 더 습관을 다지면"],
  [/노력이\s*부족하(다|습니다|네요|고)/g, "조금 더 시간을 투자하면"],
];

/**
 * 조언 본문 후처리 — 제목 줄 정리는 하지 않는다(구조화 출력이라 원본의 `[오늘의 조언]`
 * 헤더 재삽입(App.tsx:1339-1340) 단계가 필요 없다 — 헤더는 buildAdvicePayload가
 * sections.label로 별도로 붙인다). 분류명 치환 → 컴플라이언스 필터 → 공백 정리 순.
 */
export function postprocessAdviceText(raw: string): string {
  let text = String(raw ?? "");

  for (const [pattern, replacement] of CLASSIFICATION_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of PERCENTILE_UNIT_FIX) {
    text = text.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of COMPLIANCE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/\[확률 요약\]/g, "")
    .replace(/확률 요약/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// 규칙 기반 폴백 — Gemini 실패/GEMINI_API_KEY 미설정 시 같은 shape을 반환한다(origin:'rule').
// 문자열 상수 폴백 금지([[no-fallback-constants]]) — 입력값으로 매번 새로 조립한다.
// ---------------------------------------------------------------------------

function formatHoursLabel(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}분`;
  if (m <= 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

/** source='daily' 규칙 기반 "오늘의 조언". */
function buildRuleTodayAdviceDaily(
  student: AdviceStudentContext,
  today: AdviceTodayContext,
): string {
  const parts: string[] = [];

  if (today.achievementRate != null) {
    parts.push(`오늘 이상 목표 대비 ${today.achievementRate}%를 채웠습니다.`);
  } else {
    parts.push(`오늘 ${formatHoursLabel(today.studyHours)}을 기록했습니다.`);
  }

  if (student.studentType?.weakSubjects) {
    parts.push(`${student.studentType.weakSubjects} 위주로 보완하면 좋습니다.`);
  } else if (student.idealName && student.minName) {
    // "은(는)" 조사 병기 대신 받침 유무와 무관한 "에"를 쓴다(2026-09-02 로컬 E2E
    // 발견, 팀장 지시로 수정 — buildRuleMajorTips와 같은 조치).
    parts.push(
      `최소 목표 ${student.minName}에 가까워지고 있으니 이상 목표 ${student.idealName}까지 이 페이스를 유지해 보세요.`,
    );
  }

  if (today.condition === "피곤함" || today.condition === "힘듦") {
    parts.push("컨디션이 좋지 않았던 만큼 충분한 휴식도 함께 챙기세요.");
  }

  return parts.join(" ");
}

/** source='intake' 규칙 기반 "AI 입시조언"(최초 진단 직후). */
function buildRuleTodayAdviceIntake(student: AdviceStudentContext): string {
  const parts = ["온보딩 진단이 완료되어 목표까지의 현재 위치를 확인했습니다."];
  if (student.idealName && student.minName) {
    // "과(와)" 조사 병기 대신 쉼표로 나열한다(buildRuleTodayAdviceDaily와 동일 조치).
    parts.push(
      `이상 목표 ${student.idealName}, 최소 목표 ${student.minName} 사이의 격차를 오늘부터 하나씩 좁혀가 보세요.`,
    );
  }
  return parts.join(" ");
}

function buildRuleTomorrowPlan(tomorrow: AdviceTomorrowContext): string {
  if (tomorrow.idealHours <= 0) {
    return "내일 목표 시간이 아직 설정되지 않았습니다. 요일별 학습 계획을 먼저 등록해 보세요.";
  }
  const planText = tomorrow.planItems.length
    ? tomorrow.planItems
        .map((item) => `${item.subject} ${item.duration}`)
        .join(", ")
    : null;
  const base = `${tomorrow.dayNameKr}에는 이상 목표 ${formatHoursLabel(tomorrow.idealHours)}(최소 ${formatHoursLabel(tomorrow.minHours)})을 목표로 학습을 이어가 보세요.`;
  return planText ? `${base} ${planText} 순서로 배분하면 좋습니다.` : base;
}

function buildRuleMajorTips(
  student: AdviceStudentContext,
): { department: string; text: string }[] {
  // "은(는)" 처럼 두 조사를 병기하면 부자연스럽다(2026-09-02 로컬 E2E 발견, 팀장 지시로
  // 수정) — 어간에 받침 유무를 판정해 조사를 고르는 대신, 학과명 뒤에 조사가 아예
  // 필요 없는 문형(콜론)으로 바꿔 조사 자체를 없앤다.
  const tips: { department: string; text: string }[] = [];
  if (student.idealName) {
    tips.push({
      department: student.idealName,
      text: `${student.idealName}: 관련 교과 성취와 전공 연계 활동을 꾸준히 쌓아가면 좋습니다.`,
    });
  }
  if (student.minName) {
    tips.push({
      department: student.minName,
      text: `${student.minName}: 기본 개념 학습과 함께 관련 진로 정보를 틈틈이 살펴보면 도움이 됩니다.`,
    });
  }
  return tips;
}

/** Gemini 실패/키 미설정 시 사용하는 규칙 기반 폴백. origin:'rule'로 표시된다. */
export function buildRuleFallback(input: AdvicePromptInput): AdviceModelResult {
  const todayAdvice =
    input.source === "daily" && input.today
      ? buildRuleTodayAdviceDaily(input.student, input.today)
      : buildRuleTodayAdviceIntake(input.student);

  return {
    todayAdvice,
    tomorrowPlan: buildRuleTomorrowPlan(input.tomorrow),
    majorTips: buildRuleMajorTips(input.student),
  };
}

// ---------------------------------------------------------------------------
// 최종 payload 조립 — api/goal/advice.ts가 캐시에 저장하고 클라이언트에 돌려주는 shape.
// ---------------------------------------------------------------------------

export type AdvicePayload = {
  source: "intake" | "daily";
  origin: "ai" | "rule";
  probabilitySummary: string;
  sections: { label: string; body: string }[];
  majorTips: { department: string; text: string }[];
};

const SECTION_LABELS: Record<
  "intake" | "daily",
  { today: string; tomorrow: string }
> = {
  intake: { today: "[AI 입시조언]", tomorrow: "[다음 계획 제시]" },
  daily: { today: "[오늘의 조언]", tomorrow: "[내일 계획 제시]" },
};

/**
 * 확률 요약(§3.16 ①) — AI가 만들지 않고 코드가 조립한다(App.tsx probabilitySummaryBlock
 * 이식, 원본은 조언 본문 앞에 텍스트로 붙였지만 여기서는 구조화 출력이라 별도 필드다).
 */
export function buildProbabilitySummary(student: AdviceStudentContext): string {
  const jeongsiLabel = (value: number | null) =>
    student.jungsiAvailable && value != null ? `${value}%` : "미산출";
  return (
    `이상목표: ${student.idealName || "미입력"} 수시 ${naOr(student.idealSusi, "%")}  정시 ${jeongsiLabel(student.idealJungsi)}` +
    ` / 최소목표: ${student.minName || "미입력"} 수시 ${naOr(student.minSusi, "%")}  정시 ${jeongsiLabel(student.minJungsi)}`
  );
}

/**
 * Gemini 응답(구조화 JSON)과 규칙 폴백을 같은 shape의 최종 payload로 만든다.
 * origin은 호출부(api/goal/advice.ts)가 결정한다 — 이 함수는 조립만 한다.
 */
export function buildAdvicePayload(
  input: AdvicePromptInput,
  result: AdviceModelResult,
  origin: "ai" | "rule",
): AdvicePayload {
  const labels = SECTION_LABELS[input.source];
  return {
    source: input.source,
    origin,
    probabilitySummary: buildProbabilitySummary(input.student),
    sections: [
      { label: labels.today, body: postprocessAdviceText(result.todayAdvice) },
      {
        label: labels.tomorrow,
        body: postprocessAdviceText(result.tomorrowPlan),
      },
    ],
    majorTips: result.majorTips.map((tip) => ({
      department: tip.department,
      text: postprocessAdviceText(tip.text),
    })),
  };
}
