// 자기평가서(selfeval) 공유 계약. 순수 타입과 상수만 둔다. 엔진, API, UI 가 같은 모양을 쓰도록
// 여기가 정본이다. jsonb 컬럼(selfeval_sessions.growth_snapshot, step_state, reply_pending,
// selfeval_session_activities.analysis, fit_reasons, selfeval_reports.sections, score,
// mandatory_fixes, char_count)의 키는 전부 이 파일의 타입과 같다.
//
// 단계(명세 No.83 current_step): 0 생성됨 / 1 기본 입력 저장 / 2 활동 선택 확정 / 3 분석 완료 /
// 4 생성 성공 / 5 검증 완료 / 6 최종 저장. 모델 호출 단계는 analyze, write, verify 셋이다.

import type { Axis, HighGrade } from "../growth/types.js";

export type { Axis, HighGrade };

// ---------------------------------------------------------------------------
// 세션
// ---------------------------------------------------------------------------

export type SessionStatus = "draft" | "in_progress" | "completed" | "archived";

export type SessionStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 작성 영역(명세 No.20). subject 는 교과, 나머지는 창의적 체험활동 영역. */
export type Area = "subject" | "autonomy" | "club" | "career";

export const AREA_LABELS: Record<Area, string> = {
  subject: "교과",
  autonomy: "자율",
  club: "동아리",
  career: "진로",
};

export type TargetCharsMode = "with_space" | "without_space";

export type ModelStepKey = "link" | "analyze" | "write" | "verify";

export const MODEL_STEP_KEYS: readonly ModelStepKey[] = [
  "link",
  "analyze",
  "write",
  "verify",
];

export type StepStatus = "pending" | "running" | "ok" | "failed";

export type StepIssue = {
  code: string;
  message: string;
  path?: string;
};

export type StepRecord = {
  status: StepStatus;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  issues: StepIssue[];
};

export type StepTerminal = {
  reason: string;
  at: string;
  step: ModelStepKey | null;
};

export type StepState = {
  steps: Partial<Record<ModelStepKey, StepRecord>>;
  terminal?: StepTerminal;
};

/** 진로 정보(명세 No.25). student_profiles 의 career, department, universities 와 같은 뜻. */
export type CareerInfo = {
  career: string | null;
  department: string | null;
  universities: string[];
};

/** 성장설계 회신 실패 기록(명세 No.75). 다음 진입 때 서버가 다시 보낸다. */
export type ReplyPending = {
  itemId: string;
  refId: string;
  failedAt: string;
  lastError: string;
};

// ---------------------------------------------------------------------------
// 성장설계 수신 8종(명세 No.68). 세션 생성 때 growth_snapshot 에 고정한다.
// ---------------------------------------------------------------------------

export type GrowthStage = "seed" | "flower" | "bloom";

export const GROWTH_STAGE_LABELS: Record<GrowthStage, string> = {
  seed: "씨앗",
  flower: "개화",
  bloom: "만개",
};

export type GrowthWeakAxis = {
  axis: Axis;
  name: string;
  count: number;
  required: number;
  guideline: string;
};

export type GrowthPlanItemRef = {
  id: string;
  title: string;
  description: string | null;
  axis: Axis | null;
  category: string | null;
};

export type GrowthSnapshot = {
  reportId: string;
  issuedAt: string;
  narrativeTheme: string | null;
  gradeSubthemes: { grade: HighGrade; stage: GrowthStage; text: string }[];
  stage: GrowthStage | null;
  weakAxes: GrowthWeakAxis[];
  alignedSignals: string[];
  conflictingSignals: string[];
  planItems: GrowthPlanItemRef[];
};

// ---------------------------------------------------------------------------
// 활동 기록과 선택(명세 No.26~36, No.84)
// ---------------------------------------------------------------------------

export type ActivityRole = "core" | "support";

/** activity_records 행에서 엔진이 읽는 모양. DB 컬럼명을 camelCase 로 옮긴 것. */
export type ActivityRecordLike = {
  id: string;
  sourceProgram: "performance" | "deep" | "self" | "manual" | "upload";
  status: "planned" | "draft" | "confirmed" | "final";
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  subjectGroup: string | null;
  subject: string | null;
  topic: string | null;
  concept: string | null;
  method: string | null;
  result: string | null;
  limitation: string | null;
  numbers: unknown;
  sources: unknown;
  createdAt: string;
  /** 제출일(No.141). 없으면 createdAt 으로 읽는다. */
  submittedAt?: string | null;
  /** 기록 상태(No.141). 없으면 status 에서 파생한다(planned 면 plan, 그 밖은 completed). */
  recordStatus?: RecordStatus | null;
  summary?: string | null;
  reflection?: string | null;
  parentRecordId?: string | null;
  courseName?: string | null;
  entryKind?: "performance" | "deep" | "activity" | null;
};

export type RecordStatus = "completed" | "in_progress" | "plan";

export type FitSignalKey =
  | "same_subject"
  | "has_judgment"
  | "has_limitation"
  | "numbers_two_plus"
  | "self_made"
  | "too_short"
  | "repeated_topic"
  | "year_gap"
  | "aligned_signal"
  | "conflicting_signal"
  | "fills_weak_axis";

export type FitSignal = {
  key: FitSignalKey;
  hit: boolean;
  delta: number;
};

export type FitResult = {
  activityId: string;
  /** 0~100. 연동 신호가 있으면 정규화하지 않고 클램프만 한다. */
  score: number;
  signals: FitSignal[];
  /** 학생이 읽는 선정 이유 문장(명세 No.32). */
  reasons: string[];
};

// ---------------------------------------------------------------------------
// 활동 기록 연계(명세 No.174~196)
// ---------------------------------------------------------------------------

export const LINK_TYPES = [
  "inherit",
  "deepen",
  "borrow_method",
  "complement",
  "background",
  "area_extend",
  "grade_continue",
] as const;

export type LinkType = (typeof LINK_TYPES)[number];

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  inherit: "이어받음",
  deepen: "같은 질문 심화",
  borrow_method: "방법 빌림",
  complement: "관점 보완",
  background: "배경 개념",
  area_extend: "영역 확장",
  grade_continue: "학년 이어짐",
};

/** 창체 영역 자기평가에서 교과 기록이 쓸 수 있는 유형(명세 No.187). */
export const CREATIVE_SUBJECT_LINK_TYPES: readonly LinkType[] = [
  "borrow_method",
  "background",
  "area_extend",
];

export type LinkStrength = "explicit" | "implicit";
export type LinkSource = "model" | "student";

/** selfeval_record_links 한 줄의 앱 모양. */
export type RecordLink = {
  fromId: string;
  toId: string;
  type: LinkType;
  strength: LinkStrength;
  source: LinkSource;
  confirmed: boolean;
  deleted: boolean;
  note: string | null;
  quoteFrom: string | null;
  quoteTo: string | null;
};

/** 후보 목록 한 줄(pick-records list 응답). */
export type CandidateRow = {
  activity: ActivityRecordLike;
  fit: FitResult | null;
  unavailableReason: string | null;
  alreadyUsed: boolean;
  role: ActivityRole | null;
};

// ---------------------------------------------------------------------------
// 11항목 분석(명세 No.37~43)
// ---------------------------------------------------------------------------

export const ANALYSIS_FIELDS = [
  "motive",
  "concept",
  "action",
  "method",
  "result",
  "role",
  "collaboration",
  "learning",
  "career",
  "limitation",
  "next",
] as const;

export type AnalysisField = (typeof ANALYSIS_FIELDS)[number];

/**
 * 본문 생성 입력과 문장 근거로 쓸 수 있는 항목. 다음 단계(next)는 분석에 저장해 두었다가
 * 리포트의 다음 단계 제안에만 쓰므로 본문에는 쓰지 않는다(명세 No.37).
 */
export const BODY_EVIDENCE_FIELDS: readonly AnalysisField[] =
  ANALYSIS_FIELDS.filter((f) => f !== "next");

export const ANALYSIS_FIELD_LABELS: Record<AnalysisField, string> = {
  motive: "계기",
  concept: "교과 개념",
  action: "한 일",
  method: "방법",
  result: "결과와 근거",
  role: "역할",
  collaboration: "협업",
  learning: "배운 점",
  career: "진로 연결",
  limitation: "한계",
  next: "다음 단계",
};

/** 항목 값의 출처. record 는 기록에서, student 는 학생 입력, empty 는 비움. */
export type FieldSource = "record" | "student" | "empty";

export type ConflictRow = {
  kind: "numbers" | "period";
  a: { activityId: string; text: string };
  b: { activityId: string; text: string };
  /** 학생이 고른 쪽의 text. 없으면 미해결. */
  resolved: string | null;
};

export type Analysis = {
  values: Record<AnalysisField, string>;
  sources: Record<AnalysisField, FieldSource>;
  conflicts: ConflictRow[];
};

export type AnalysisSource = "model" | "student";

// ---------------------------------------------------------------------------
// 생성 본문(명세 No.44~52, No.85)
// ---------------------------------------------------------------------------

export type SentenceEvidence =
  | { activityId: string; field: AnalysisField }
  | { student: true };

export type Sentence = {
  id: string;
  text: string;
  evidence: SentenceEvidence | null;
  /** 자료로 확인되지 않는 느낌이나 판단 문장(노란 표시). */
  feeling: boolean;
  /** 학생이 느낌 문장을 확인했는지(명세 No.49, No.57). */
  confirmed: boolean;
};

export type ParagraphRole = "link" | "process" | "judgment" | "wrap";

export const PARAGRAPH_ROLE_LABELS: Record<ParagraphRole, string> = {
  link: "연계 발전 지점",
  process: "과정",
  judgment: "판단",
  wrap: "정리",
};

export type Paragraph = {
  /** 문단 수를 고정하지 않으므로 새 본문에는 없다. 옛 리포트를 읽을 때만 있다. */
  role?: ParagraphRole;
  sentences: Sentence[];
};

export type GenerationSections = {
  paragraphs: Paragraph[];
};

export type CharCount = {
  withSpace: number;
  withoutSpace: number;
};

export type ReportType = "generation" | "edited" | "verification" | "final";

// ---------------------------------------------------------------------------
// 검증(명세 No.53~62, No.76)
// ---------------------------------------------------------------------------

export type ScoreItemKey =
  | "judgment"
  | "limitation"
  | "link"
  | "source"
  | "numbers"
  | "start"
  | "next"
  | "prompt";

export type ScoreCheck = {
  text: string;
  pass: boolean;
};

export type ScoreItem = {
  key: ScoreItemKey;
  label: string;
  max: number;
  /** 판별력(상위 25% 와 하위 25% 보유율 차이, p). 문항 대응은 null. */
  discrimination: number | null;
  checks: ScoreCheck[];
  score: number;
  /** false 면 채점에서 뺀 항목이다(학교 문항이 없는 문항 대응). 없으면 적용으로 본다. */
  applied?: boolean;
};

export type FormatCheckKey =
  | "target_range"
  | "cliche_density"
  | "min_length"
  | "min_sentences"
  | "no_university"
  | "no_pending_feelings"
  | "no_plan_expression";

export type FormatCheck = {
  key: FormatCheckKey;
  label: string;
  pass: boolean;
  detail: string;
  /** 목표 글자 수가 비어 target_range 를 끈 경우 true. */
  skipped: boolean;
};

export type MandatoryFixKey =
  | "pending_feelings"
  | "cliche"
  | "judgment_low"
  | "plan_expression";

export type MandatoryFix = {
  key: MandatoryFixKey;
  message: string;
  detail: string | null;
};

export type Improvement = {
  key: ScoreItemKey;
  label: string;
  message: string;
  failedChecks: string[];
};

export type GrowthFit = {
  stageChecks: ScoreCheck[];
  axisChecks: {
    axis: Axis;
    name: string;
    satisfied: boolean;
    current: number;
    required: number;
    guideline: string;
  }[];
};

export type VerificationSections = {
  items: ScoreItem[];
  total: number;
  /** 학교 문항이 없어 문항 대응을 뺀 채점이면 true. 이전 리포트에는 없다. */
  promptMissing?: boolean;
  format: FormatCheck[];
  mandatoryFixes: MandatoryFix[];
  submittable: boolean;
  improvements: Improvement[];
  excluded: { label: string; note: string }[];
  growthFit: GrowthFit | null;
  charCount: CharCount;
  sentenceCount: number;
  clicheDensity: number;
  clicheHits: string[];
  numberCount: number;
};

// ---------------------------------------------------------------------------
// 7항목 승격(명세 No.43, No.63)
// ---------------------------------------------------------------------------

export type PromotedRecord = {
  topic: string;
  concept: string;
  method: string;
  result: string;
  limitation: string;
  numbers: string[];
  sources: string[];
};

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

export const SESSION_EXPIRY_DAYS = 90;
export const GROWTH_STALE_DAYS = 180;
export const FIT_AUTO_SELECT_THRESHOLD = 40;
export const CANDIDATE_LIMIT = 20;
export const MAX_SUPPORT_ACTIVITIES = 2;
export const MAX_SELECTED_ACTIVITIES = 8;
export const MIN_SELECTED_ACTIVITIES = 3;
export const CHARS_PER_ACTIVITY = 70;
/** 연계 판정 2차에 넣는 기록 수의 상한. 8건이면 쌍이 28개다(명세 No.184). */
export const MAX_PAIR_RECORDS = 8;
export const FALLBACK_SELECT_COUNT = 3;
export const MAX_REGENERATIONS = 3;
export const MAX_MODEL_ATTEMPTS_PER_STEP = 10;
export const CLAIM_STALE_SECONDS = 120;
export const STEP_BUDGET_MS = 50_000;
export const DEFAULT_TARGET_CHARS = 500;
export const TARGET_TOLERANCE = 0.05;
export const MIN_LENGTH_CHARS = 400;
export const MIN_SENTENCES = 4;
export const CLICHE_DENSITY_MAX = 2.0;
export const SHORT_TARGET_MAX = 300;
