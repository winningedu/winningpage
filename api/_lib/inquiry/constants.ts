// 심화탐구 고정값. 명세 v7.1 이 정한 숫자와 문구를 한곳에 둔다.
// 학생에게 보이는 문구는 마크다운 기호와 금지 산출 표현을 쓰지 않는다(검증기가 같은 검사를 한다).
import type {
  CoreErrorId,
  Fit,
  GradeLabel,
  InterviewEnding,
  InterviewSourceType,
  InterviewTaskType,
  LinkKind,
  RubricItemId,
  SectionGroup,
  SectionId,
  Stage,
  SubmissionLabel,
} from "./types.js";

// ── 한도와 기간 ─────────────────────────────────────────────────────────────

/** 미완 세션 만료(No.26, 기본안 90일). */
export const SESSION_EXPIRY_DAYS = 90;
/** 성장설계 발행일 오래됨 판정(No.107, 기본안 6개월). */
export const HANDOFF_STALE_MONTHS = 6;
/** 주제 추천 라운드 상한(No.53): 최초 1 + 재추천 3. */
export const TOPIC_MAX_ROUNDS = 4;
/** 평가 성공 횟수 상한(No.22): 최초 평가 1 + 재평가 3. */
export const MAX_EVALUATIONS = 4;
/** mode 별 모델 호출 시도 상한(No.22). SQL fn_inquiry_claim_generation 의 c_max_attempts 와 같은 값. */
export const MAX_MODEL_ATTEMPTS_PER_MODE = 10;
/** 생성 선점 stale 판정(초). SQL 기본값과 같다. */
export const CLAIM_STALE_SECONDS = 120;
/** 평가 실행 최소 분량(No.77): Ⅰ~Ⅶ 합계. */
export const MIN_SUBMISSION_CHARS = 300;
/** 출발 활동 후보 최대 건수(No.36). */
export const MAX_RECORD_CANDIDATES = 20;
/** 주제 한 줄 입력 길이(No.32). */
export const ONELINE_MAX_CHARS = 200;
/** 먼저 고칠 것 최대 개수(No.95). */
export const MAX_FIX_FIRST = 3;
/** 7항목 추출 중 수치 문장 상한(§6 10). */
export const MAX_EXTRACTED_NUMBERS = 10;

// ── 8절(No.6, 60) ───────────────────────────────────────────────────────────

export type SectionMeta = {
  id: SectionId;
  numeral: string;
  title: string;
  group: SectionGroup;
  /** 권장 분량(자). null 은 제한 없음. */
  recommendedChars: number | null;
  /** 입력란 아래 안내 한 줄. */
  hint: string;
};

export const SECTIONS: readonly SectionMeta[] = [
  {
    id: "I",
    numeral: "Ⅰ",
    title: "탐구 동기",
    group: "intro",
    recommendedChars: 300,
    hint: "출발 활동, 무엇이 걸렸는가, 왜 지금 이 질문인가",
  },
  {
    id: "II",
    numeral: "Ⅱ",
    title: "탐구 질문과 가설",
    group: "intro",
    recommendedChars: 150,
    hint: "질문 한 문장, 가설 1, 가설 2",
  },
  {
    id: "III",
    numeral: "Ⅲ",
    title: "탐구 방법",
    group: "body",
    recommendedChars: 300,
    hint: "자료 출처표, 자료 처리, 분석 도구",
  },
  {
    id: "IV",
    numeral: "Ⅳ",
    title: "탐구 결과",
    group: "body",
    recommendedChars: 300,
    hint: "확인한 값, 눈에 띄는 반례",
  },
  {
    id: "V",
    numeral: "Ⅴ",
    title: "해석",
    group: "body",
    recommendedChars: 400,
    hint: "가설 판정, 왜 그런가, 한 문장 정리, 처음 질문으로, 진로 연결",
  },
  {
    id: "VI",
    numeral: "Ⅵ",
    title: "한계",
    group: "conclusion",
    recommendedChars: 150,
    hint: "표본과 대표성, 상관과 인과, 자료 신뢰도",
  },
  {
    id: "VII",
    numeral: "Ⅶ",
    title: "후속 탐구",
    group: "conclusion",
    recommendedChars: 150,
    hint: "남은 질문, 다음에 할 것, 어느 활동에서 할지",
  },
  {
    id: "VIII",
    numeral: "Ⅷ",
    title: "참고 자료",
    group: "conclusion",
    recommendedChars: null,
    hint: "기관, 자료명, 기준 시점, 링크",
  },
];

export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((s) => s.id);

export const SECTION_GROUP_LABELS: Record<SectionGroup, string> = {
  intro: "서론",
  body: "본론",
  conclusion: "결론",
};

/** 최소 분량 합계에 들어가는 절(No.77): Ⅰ~Ⅶ. */
export const MIN_CHARS_SECTION_IDS: readonly SectionId[] = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
];

// ── 연계 유형(No.5) ─────────────────────────────────────────────────────────

export const LINK_KINDS: readonly LinkKind[] = [
  "followup",
  "transfer",
  "critique",
  "extension",
];

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  followup: "후속형",
  transfer: "전이형",
  critique: "비판형",
  extension: "확장형",
};

export const LINK_KIND_DEFINITIONS: Record<LinkKind, string> = {
  followup: "앞 활동이 남긴 한계를 그대로 이어받아 해결한다",
  transfer: "앞 활동에서 쓴 방법을 다른 대상에 적용한다",
  critique: "앞 활동에서 쓴 도구나 결론의 전제를 다시 검증한다",
  extension: "앞 활동의 문제의식을 공동체나 사회 범위로 넓힌다",
};

// ── 학년 단계(No.44~47, 110) ────────────────────────────────────────────────

export const STAGE_BY_GRADE: Record<GradeLabel, Stage> = {
  고1: "seed",
  고2: "flower",
  고3: "bloom",
};

export const STAGE_LABELS: Record<Stage, string> = {
  seed: "씨앗",
  flower: "꽃",
  bloom: "만개",
};

/** 학년별 연계 방향(No.44). */
export const STAGE_DIRECTIONS: Record<GradeLabel, string> = {
  고1: "과목에서 과목으로",
  고2: "과목에서 진로로",
  고3: "진로에서 심화로",
};

/** 권장과 비권장 연계 유형(No.45). 표에 없는 유형은 보통. */
export const STAGE_LINK_RULES: Record<
  GradeLabel,
  { recommended: readonly LinkKind[]; discouraged: readonly LinkKind[] }
> = {
  고1: { recommended: ["followup", "transfer"], discouraged: ["extension"] },
  고2: { recommended: ["critique", "transfer", "extension"], discouraged: [] },
  고3: {
    recommended: ["followup", "critique"],
    discouraged: ["transfer", "extension"],
  },
};

export const FIT_LABELS: Record<Fit, string> = {
  match: "맞음",
  neutral: "보통",
  off: "어긋남",
};

/** 학년별 정적 안내 문구(No.46, 47). 고2 는 없다. */
export const GRADE_NOTES: Partial<Record<GradeLabel, string>> = {
  고1: "1학년에는 진로 연계를 권하지 않아요. 진로가 과하게 드러나면 2학년과 3학년에 쓸 것이 없어져요.",
  고3: "3학년에는 새로운 축을 여는 주제를 권하지 않아요. 기록이 수시 시기에 일찍 마감되어 완성할 시간이 없어요.",
};

// ── 회상 인터뷰(No.33) ──────────────────────────────────────────────────────

export const INTERVIEW_TASK_TYPE_LABELS: Record<InterviewTaskType, string> = {
  survey: "조사와 정리",
  experiment: "실험과 측정",
  analysis: "자료 분석과 계산",
  review: "감상과 비평",
  presentation: "발표와 토론",
  making: "제작과 설계",
};

export const INTERVIEW_SOURCE_LABELS: Record<InterviewSourceType, string> = {
  textbook: "교과서",
  internet: "인터넷 검색",
  paper: "논문",
  measurement: "직접 측정",
  statistics: "기관 통계",
};

export const INTERVIEW_ENDING_LABELS: Record<InterviewEnding, string> = {
  summary: "정리하고 끝냄",
  claim: "주장을 세움",
};

export const INTERVIEW_QUESTIONS: readonly { no: number; text: string }[] = [
  { no: 1, text: "어떤 활동이었나요 (주제 한 줄, 필수)" },
  { no: 2, text: "무엇을 하라는 과제였나요" },
  { no: 3, text: "자료는 주로 어디서 가져왔나요 (여러 개 선택)" },
  {
    no: 4,
    text: "남이 만든 기준, 지표, 공식, 데이터를 그대로 가져다 쓴 것이 있나요",
  },
  { no: 5, text: "마무리를 어떻게 했나요" },
  { no: 6, text: "시간이 더 있었으면 무엇을 더 했을 것 같나요" },
  { no: 7, text: "선생님 피드백이나 아쉬웠던 점이 있나요" },
];

// ── 루브릭(No.82, 86~91, 128) ───────────────────────────────────────────────

export type RubricRequirement = {
  id: string;
  text: string;
  /**
   * 앱이 판정해 모델 판정을 덮어쓰는 결정적 요건(§2 19). 키는 scoring 모듈이 해석한다.
   * null 이면 모델 판정을 그대로 쓴다.
   */
  deterministic:
    | "intro_min_chars"
    | "question_single_sentence"
    | "both_hypotheses"
    | "source_table_filled"
    | "no_placeholders"
    | "sections_filled"
    | null;
};

export type RubricItem = {
  id: RubricItemId;
  label: string;
  maxScore: number;
  requirements: readonly RubricRequirement[];
};

export const RUBRIC: readonly RubricItem[] = [
  {
    id: "linkage",
    label: "기존 활동과의 연계 및 탐구 동기",
    maxScore: 20,
    requirements: [
      {
        id: "linkage-1",
        text: "출발 활동을 실제로 언급한다",
        deterministic: null,
      },
      {
        id: "linkage-2",
        text: "출발 활동에서 무엇이 남았는지 밝힌다",
        deterministic: null,
      },
      {
        id: "linkage-3",
        text: "이번 탐구로 이어진 이유가 있다",
        deterministic: null,
      },
      {
        id: "linkage-4",
        text: "서론이 최소 분량을 채운다",
        deterministic: "intro_min_chars",
      },
    ],
  },
  {
    id: "question",
    label: "질문의 구체성과 심화성",
    maxScore: 20,
    requirements: [
      {
        id: "question-1",
        text: "탐구 질문이 물음표로 끝나는 한 문장이다",
        deterministic: "question_single_sentence",
      },
      {
        id: "question-2",
        text: "기존 활동과 다른 분석 초점이 있다",
        deterministic: null,
      },
      {
        id: "question-3",
        text: "범위가 한 편의 탐구로 감당할 수 있는 크기다",
        deterministic: null,
      },
      {
        id: "question-4",
        text: "가설 1과 가설 2가 모두 제시된다",
        deterministic: "both_hypotheses",
      },
    ],
  },
  {
    id: "method",
    label: "탐구 방법과 학생의 분석",
    maxScore: 25,
    requirements: [
      {
        id: "method-1",
        text: "방법이 탐구 질문에 맞는다",
        deterministic: null,
      },
      {
        id: "method-2",
        text: "비교, 계산, 해석 중 실제로 수행한 것이 제시된다",
        deterministic: null,
      },
      {
        id: "method-3",
        text: "자료 출처표가 채워지거나 확인 필요로 표시된다",
        deterministic: "source_table_filled",
      },
      {
        id: "method-4",
        text: "핵심 오류 중 질문과 측정변수 불일치, 대리 지표 미명시가 없다",
        deterministic: null,
      },
    ],
  },
  {
    id: "evidence",
    label: "근거와 내용의 정확성",
    maxScore: 15,
    requirements: [
      {
        id: "evidence-1",
        text: "핵심 주장에 출처가 대응한다",
        deterministic: null,
      },
      {
        id: "evidence-2",
        text: "해석이 자료 범위를 넘지 않는다",
        deterministic: null,
      },
      {
        id: "evidence-3",
        text: "수치 인용에 참고 자료가 있다",
        deterministic: null,
      },
      {
        id: "evidence-4",
        text: "출처 상태가 사실대로 표시된다",
        deterministic: null,
      },
    ],
  },
  {
    id: "conclusion",
    label: "결론과 한계 인식",
    maxScore: 10,
    requirements: [
      { id: "conclusion-1", text: "탐구 질문에 답한다", deterministic: null },
      {
        id: "conclusion-2",
        text: "증거를 넘어선 단정이 없다",
        deterministic: null,
      },
      {
        id: "conclusion-3",
        text: "상관과 인과를 구분한다",
        deterministic: null,
      },
      {
        id: "conclusion-4",
        text: "표본과 대표성의 한계를 밝힌다",
        deterministic: null,
      },
    ],
  },
  {
    id: "structure",
    label: "구성과 표현",
    maxScore: 10,
    requirements: [
      {
        id: "structure-1",
        text: "논리가 절 사이에서 연결된다",
        deterministic: null,
      },
      {
        id: "structure-2",
        text: "표와 인용이 이해 가능하게 정리된다",
        deterministic: null,
      },
      {
        id: "structure-3",
        text: "대괄호 자리표시자가 남아 있지 않다",
        deterministic: "no_placeholders",
      },
      {
        id: "structure-4",
        text: "Ⅰ부터 Ⅶ절이 모두 채워진다",
        deterministic: "sections_filled",
      },
    ],
  },
];

export const RUBRIC_TOTAL = 100;

/** 수준 설명(No.83, 초안 126). */
export const LEVEL_DESCRIPTIONS: Record<0 | 1 | 2 | 3 | 4, string> = {
  4: "요건을 모두 충족",
  3: "대체로 충족하나 일부 보완 필요",
  2: "일부만 충족하고 중요한 부분이 빠짐",
  1: "언급만 있고 실제 수행이 없음",
  0: "해당 요소가 없음",
};

// ── 핵심 오류(No.85) ────────────────────────────────────────────────────────

export type CoreErrorMeta = {
  id: CoreErrorId;
  label: string;
  capItem: RubricItemId;
  capLevel: 1 | 2;
  /** 서버가 판정하는 오류(⑤, ⑥). 나머지는 모델 판정을 받는다. */
  appJudged: boolean;
};

export const CORE_ERRORS: readonly CoreErrorMeta[] = [
  {
    id: "variable_mismatch",
    label: "질문과 측정변수가 맞지 않아요",
    capItem: "method",
    capLevel: 2,
    appJudged: false,
  },
  {
    id: "proxy_undeclared",
    label: "대리 지표를 쓰면서 밝히지 않았어요",
    capItem: "method",
    capLevel: 2,
    appJudged: false,
  },
  {
    id: "correlation_as_cause",
    label: "상관을 인과로 단정했어요",
    capItem: "conclusion",
    capLevel: 2,
    appJudged: false,
  },
  {
    id: "overclaim",
    label: "증거를 넘어선 단정이 있어요",
    capItem: "conclusion",
    capLevel: 2,
    appJudged: false,
  },
  {
    id: "unsourced_number",
    label: "출처 없는 수치 주장이 있어요",
    capItem: "evidence",
    capLevel: 1,
    appJudged: true,
  },
  {
    id: "placeholder_left",
    label: "아직 쓰지 않은 자리가 남아 있어요",
    capItem: "structure",
    capLevel: 1,
    appJudged: true,
  },
];

// ── 제출 상태 라벨(No.92) ───────────────────────────────────────────────────

export const SUBMISSION_LABELS: Record<SubmissionLabel, string> = {
  ready_with_minor_edits: "소규모 보완 후 제출 가능",
  revision_needed: "수정 필요",
  major_revision_needed: "대폭 수정 필요",
  not_evaluable: "평가 불가",
};

/** "수정 필요" 판정 총점 경계(§6 8). 핵심 오류가 없을 때 총점이 이 값 미만이면 수정 필요. */
export const REVISION_NEEDED_BELOW_TOTAL = 80;

// ── 출처 상태(No.96) ────────────────────────────────────────────────────────

export const SOURCE_STATUS_LABELS = {
  retrieved_verified: "확인 완료",
  supplied_unverified: "사용자 제공 미확인",
  search_target: "검색 예정",
} as const;

/** 자료 출처표의 출처, 기준 시점 고정값(No.10, 158). */
export const NEEDS_CHECK = "확인 필요";

// ── 체크리스트 13(No.66, §2 14) ─────────────────────────────────────────────

export type ChecklistItem = {
  id: string;
  text: string;
  rubric: RubricItemId | null;
  section: SectionId;
  /** 점수에 반영되지 않는 작성 지침(진로 연결). */
  guidanceOnly: boolean;
};

export const CHECKLIST: readonly ChecklistItem[] = [
  {
    id: "c01",
    text: "출발 활동 이름",
    rubric: "linkage",
    section: "I",
    guidanceOnly: false,
  },
  {
    id: "c02",
    text: "확인하지 않고 넘어간 것",
    rubric: "linkage",
    section: "I",
    guidanceOnly: false,
  },
  {
    id: "c03",
    text: "이번 질문이 필요한 이유",
    rubric: "linkage",
    section: "I",
    guidanceOnly: false,
  },
  {
    id: "c04",
    text: "질문 한 문장",
    rubric: "question",
    section: "II",
    guidanceOnly: false,
  },
  {
    id: "c05",
    text: "가설 1과 2",
    rubric: "question",
    section: "II",
    guidanceOnly: false,
  },
  {
    id: "c06",
    text: "출처와 기준 시점",
    rubric: "method",
    section: "III",
    guidanceOnly: false,
  },
  {
    id: "c07",
    text: "가공 방법과 단위 통일",
    rubric: "method",
    section: "III",
    guidanceOnly: false,
  },
  {
    id: "c08",
    text: "확인한 값만",
    rubric: "method",
    section: "IV",
    guidanceOnly: false,
  },
  {
    id: "c09",
    text: "가설 판정",
    rubric: "conclusion",
    section: "V",
    guidanceOnly: false,
  },
  {
    id: "c10",
    text: "한 문장 정리",
    rubric: "structure",
    section: "V",
    guidanceOnly: false,
  },
  {
    id: "c11",
    text: "진로 연결은 직무의 성격으로",
    rubric: null,
    section: "V",
    guidanceOnly: true,
  },
  {
    id: "c12",
    text: "한계 두 가지 이상",
    rubric: "conclusion",
    section: "VI",
    guidanceOnly: false,
  },
  {
    id: "c13",
    text: "후속 탐구의 활동",
    rubric: "conclusion",
    section: "VII",
    guidanceOnly: false,
  },
];

// ── 고정 문구 ───────────────────────────────────────────────────────────────

/** 설계 리포트 금지 사항(No.67). */
export const DESIGN_FORBIDDEN: readonly string[] = [
  "하지 않은 조사나 실험을 한 것처럼 쓰기",
  "확인하지 않은 수치 인용",
  "표현만 바꾼 옮겨 적기",
  "결과를 가설에 맞춰 고치기",
  "상관을 인과로 바꿔 쓰기",
];

/** 작성 화면 금지 항목 상시 노출(No.80). */
export const WRITING_FORBIDDEN: readonly string[] = [
  "확인하지 않은 수치와 연구 결과",
  "출처 없이 옮겨 적은 문장",
  "하지 않은 실험을 한 것처럼 쓴 서술",
  "상관을 인과로 바꾼 결론",
];

/** 가설 기각 안내(No.74). */
export const HYPOTHESIS_NOTICE = {
  title: "가설이 틀려도 돼요",
  body: "왜 예상과 달랐는지를 설명하는 대목에서 사고 과정이 가장 잘 드러나요. 결과를 가설에 맞춰 고치지 마세요.",
} as const;

/** 이 도구가 하지 않는 것(No.15). */
export const NOT_PRODUCED: readonly string[] = [
  "인공지능 작성 판정",
  "합격 가능성",
  "교사 예상 점수",
  "학생부 등급",
  "생활기록부 문장 생성",
  "보고서 대필",
];

/** 전 화면 하단 고지문 3종(No.134). 셸이 한 번 그린다. */
export const NOTICES: readonly string[] = [
  "이 도구는 보고서를 대신 써 주지 않아요. 설계와 평가만 제공해요.",
  "평가는 위닝 내부 기준이에요. 학교 성적, 학생부 평가, 합격 가능성을 예측하지 않아요.",
  "생활기록부 원문은 받지 않아요(초중등교육법 제25조의2). 세특 문장도 만들지 않아요. 생성에 실패하면 차감된 이용 횟수는 자동으로 복구돼요.",
];

/** 신뢰도 C 주제 카드 문장(No.43). */
export const RELIABILITY_C_NOTE = "입력한 주제 한 줄만으로 만든 주제예요.";

/** 신뢰도 B, C 설계 리포트 확인 요청 안내(No.39). */
export const RELIABILITY_CHECK_NOTICE =
  "기억이나 주제 한 줄에서 출발한 설계예요. 출발 활동의 내용이 실제와 맞는지 먼저 확인해 주세요.";

/** 예비 주제 안내(No.4, 146). */
export const PROVISIONAL_TOPIC_NOTE =
  "고른 활동이 없어 관심 기반 예비 주제를 보여 드려요. 이전 활동과 이어지지 않아 연계 점수는 0점이에요.";

/** 설계 리포트 Ⅰ절 지시에서 신뢰도 B, C 일 때 써야 하는 표현(No.39)과 쓰면 안 되는 표현. */
export const RELIABILITY_PHRASE = {
  required: "다루지 못했다",
  forbidden: "확인하지 않았다",
} as const;
