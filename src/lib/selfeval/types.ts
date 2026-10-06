// 자기평가서 공유 타입과 상수. 서버 정본은 api/_lib/selfeval/types.ts 이고 여기는 UI 가 쓰는 모양만
// 옮긴 사본이다. src 는 api 를 import 하지 않는다(성장설계 lib/growth/types.ts 와 같은 이유).
// 서버 타입이 바뀌면 이 파일도 같이 고친다.
//
// 단계(current_step): 0 생성됨 / 1 기본 입력 저장 / 2 활동 선택 확정 / 3 분석 완료 /
// 4 생성 성공 / 5 검증 완료 / 6 최종 저장.

import type { Axis, HighGrade } from "@/lib/growth/types";

export type { Axis, HighGrade };

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

export type ModelStepKey = "analyze" | "write" | "verify";

export const MODEL_STEP_KEYS: readonly ModelStepKey[] = [
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
  flower: "꽃",
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
};

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
  process: "과정과 역할",
  judgment: "결과와 판단",
  wrap: "정리와 다음 단계",
};

export type Paragraph = {
  role: ParagraphRole;
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
};

export type FormatCheckKey =
  | "target_range"
  | "cliche_density"
  | "min_length"
  | "min_sentences"
  | "no_university"
  | "no_pending_feelings";

export type FormatCheck = {
  key: FormatCheckKey;
  label: string;
  pass: boolean;
  detail: string;
  /** 목표 글자 수가 비어 target_range 를 끈 경우 true. */
  skipped: boolean;
};

export type MandatoryFixKey = "pending_feelings" | "cliche" | "judgment_low";

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

// ---------------------------------------------------------------------------
// API 계약(api/_lib/selfeval/view.ts, sessionBody.ts, pickBody.ts, manual.ts)
// ---------------------------------------------------------------------------

export type QuotaSnapshot = {
  quotaTotal: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
};

export type SessionRoute =
  | "new"
  | "activities"
  | "analysis"
  | "result"
  | "verify"
  | "done";

export type OpenSessionSummary = {
  id: string;
  status: SessionStatus;
  currentStep: SessionStep;
  route: SessionRoute;
  area: Area | null;
  subject: string | null;
  activityName: string | null;
  lastActivityAt: string;
};

export type GrowthBanner = {
  theme: string | null;
  stageLabel: string | null;
  currentSubtheme: string | null;
  weakAxisNames: string[];
  issuedAt: string;
};

export type EntryGrowth = {
  reportId: string;
  issuedAt: string;
  stale: boolean;
  banner: GrowthBanner;
  planItems: GrowthPlanItemRef[];
};

export type EntryProfile = {
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  career: string | null;
  department: string | null;
  universities: string[];
};

export type SessionListItem = {
  id: string;
  status: SessionStatus;
  currentStep: SessionStep;
  academicYear: number | null;
  semester: 1 | 2 | null;
  area: Area | null;
  subject: string | null;
  activityName: string | null;
  score: number | null;
  completedAt: string | null;
  lastActivityAt: string;
  expired: boolean;
  discarded: boolean;
  terminal: { reason: string; at: string } | null;
};

export type EntryResponse = {
  ok: true;
  entry: {
    quota: QuotaSnapshot | null;
    allowed: boolean;
    activityCount: number;
    openSession: OpenSessionSummary | null;
    growth: EntryGrowth | null;
    profile: EntryProfile | null;
    replyResent: number;
    academicYearDefault: number;
  };
  sessions: SessionListItem[];
};

export type SessionView = {
  id: string;
  status: SessionStatus;
  currentStep: SessionStep;
  progress: unknown;
  academicYear: number | null;
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  area: Area | null;
  subject: string | null;
  activityName: string | null;
  schoolPrompt: string | null;
  teacherNote: string | null;
  targetChars: number | null;
  targetCharsMode: TargetCharsMode;
  career: CareerInfo;
  growthApplied: boolean;
  growthSnapshot: GrowthSnapshot | null;
  planItemId: string | null;
  replyPending: ReplyPending | null;
  regenerateCount: number;
  terminal: StepTerminal | null;
  lastActivityAt: string;
  completedAt: string | null;
};

export type SessionActivityView = {
  activityRecordId: string;
  role: ActivityRole;
  fitScore: number | null;
  fitReasons: unknown;
  analysis: Analysis | null;
  analysisSource: AnalysisSource | null;
  record: ActivityRecordLike;
};

export type ReportView = {
  id: string;
  revision: number;
  sections: unknown;
  charCount: CharCount | null;
  score: number | null;
  mandatoryFixes: unknown;
  createdAt: string;
};

export type SessionDetailResponse = {
  ok: true;
  session: SessionView;
  activities: SessionActivityView[];
  reports: {
    generation: ReportView | null;
    edited: ReportView | null;
    verification: ReportView | null;
    final: ReportView | null;
  };
  regenerationsLeft: number;
  current: ReportView | null;
};

/** 세션 생성과 수정 바디(api/_lib/selfeval/sessionBody.ts SessionInput). */
export type SessionInput = {
  academicYear: number;
  gradeLabel: HighGrade;
  semester: 1 | 2;
  area: Area;
  subject: string | null;
  activityName: string | null;
  schoolPrompt: string;
  teacherNote: string | null;
  targetChars: number | null;
  targetCharsMode: TargetCharsMode;
  career: CareerInfo;
  growthApplied: boolean;
  planItemId: string | null;
};

export type SessionResponse = { ok: true; session: SessionView };

export type ManualInput = {
  activityName: string;
  subjectOrArea: string;
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  motive: string;
  concept: string;
  action: string;
  method: string;
  result: string;
  role: string;
  limitation: string;
  next: string;
};

export type PickSelection = { coreId: string; supportIds: string[] };

export type PickAuto = {
  coreId: string | null;
  supportIds: string[];
  coreMismatch: boolean;
  noneAboveThreshold: boolean;
};

export type SourceCounts = {
  performance: number;
  deep: number;
  manual: number;
  total: number;
};

export type PickListResponse = {
  ok: true;
  candidates: CandidateRow[];
  selection: PickSelection | null;
  auto: PickAuto | null;
  sourceCounts: SourceCounts;
  direction: { mismatch: boolean } | null;
  planCandidates: GrowthPlanItemRef[];
  planItem: GrowthPlanItemRef | null;
  growthApplied: boolean;
  currentStep: SessionStep;
};

export type PickSelectResponse = {
  ok: true;
  selection: PickSelection;
  coreMismatch: boolean;
  warnings: string[];
  currentStep: 2;
};

export type PickManualResponse = {
  ok: true;
  activityRecordId: string;
  selection: PickSelection;
  currentStep: 2;
};
