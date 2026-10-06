// 심화탐구 클라이언트 타입. api/_lib/inquiry/types.ts 의 유니온과 값 타입을 글자 그대로 미러하고
// (types.test.ts 가 서버 파일과 비교한다), 서버 views.ts 의 뷰와 부록 A 의 요청, 응답 타입을 더한다.
// src 에서 api/ 를 직접 import 하지 않는다. 계약 정본은 docs/deep-inquiry-dev-plan.md 부록 A.

/** 세션 상태(No.23). API 응답 status 와 다른 값이다. */
export type SessionStatus = "draft" | "in_progress" | "completed" | "archived";

/** 화면 단계 1~6(정보 입력, 주제 추천, 설계 리포트, 보고서 작성, 평가 리포트, 확정과 적립). */
export type ScreenStep = 1 | 2 | 3 | 4 | 5 | 6;

/** 고등학교 학년(No.27). */
export type GradeLabel = "고1" | "고2" | "고3";

export type Semester = 1 | 2;

/** 학년 단계(No.44). 씨앗, 꽃, 만개. growth_reports.stage 와 같은 값. */
export type Stage = "seed" | "flower" | "bloom";

/** 연계 유형 4종(No.5). 후속, 전이, 비판, 확장. */
export type LinkKind = "followup" | "transfer" | "critique" | "extension";

/** 연계 허용값(No.123). 간접(indirect)은 이번 범위에 없다. */
export type LinkageType = "direct" | "interest_based_provisional";

/** 학년 단계 적합도(No.110). 맞음, 보통, 어긋남. */
export type Fit = "match" | "neutral" | "off";

/** 자산 신뢰도(No.38). A 원문 확보, B 회상 복원, C 주제만. */
export type Reliability = "A" | "B" | "C";

/** 자산 확보 경로(No.31). */
export type AssetKind = "record" | "interview" | "oneline";

/** 생성 모드(No.122). */
export type GenerationMode =
  | "topic_recommendation"
  | "design_report"
  | "evaluation_report";

/** 생성 응답 status 허용값(No.122). */
export type ResponseStatus =
  | "ok"
  | "provisional"
  | "needs_selection"
  | "needs_evidence";

/** 보고서 8절 식별자(No.6). */
export type SectionId = "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII";

export type SectionGroup = "intro" | "body" | "conclusion";

/** 루브릭 6항목(No.82). */
export type RubricItemId =
  | "linkage"
  | "question"
  | "method"
  | "evidence"
  | "conclusion"
  | "structure";

/** 수준 0~4(No.83). */
export type Level = 0 | 1 | 2 | 3 | 4;

/** 핵심 오류 6종(No.85). */
export type CoreErrorId =
  | "variable_mismatch"
  | "proxy_undeclared"
  | "correlation_as_cause"
  | "overclaim"
  | "unsourced_number"
  | "placeholder_left";

/** 제출 상태 라벨 4종(No.92). */
export type SubmissionLabel =
  | "ready_with_minor_edits"
  | "revision_needed"
  | "major_revision_needed"
  | "not_evaluable";

/** 출처 상태 3종(No.96). 확인 완료는 조회 기록이 있을 때만 쓸 수 있다(1차 미도달). */
export type SourceStatus =
  | "retrieved_verified"
  | "supplied_unverified"
  | "search_target";

/** 회상 인터뷰 2번 과제 유형(No.33). */
export type InterviewTaskType =
  | "survey"
  | "experiment"
  | "analysis"
  | "review"
  | "presentation"
  | "making";

/** 회상 인터뷰 3번 자료 출처(No.33, 다중 선택). */
export type InterviewSourceType =
  | "textbook"
  | "internet"
  | "paper"
  | "measurement"
  | "statistics";

/** 회상 인터뷰 5번 마무리 방식(No.33). */
export type InterviewEnding = "summary" | "claim";

/** 회상 인터뷰 답(No.33). q1 은 필수, 나머지는 선택. */
export type InterviewAnswers = {
  q1: string;
  q2?: InterviewTaskType | null;
  q3?: InterviewSourceType[];
  q4?: string | null;
  q5?: InterviewEnding | null;
  q6?: string | null;
  q7?: string | null;
};

/** 빈틈 후보(No.34, 35). source 는 어느 답변에서 나온 추정인지. */
export type GapCandidate = {
  id: string;
  text: string;
  /** 근거 문항 번호 1~7. */
  source: number;
};

/** 세션 자산(No.40). position 0 이 기본 출발 활동. */
export type AssetInput =
  | { kind: "record"; activityRecordId: string }
  | { kind: "interview"; answers: InterviewAnswers; gaps: string[] }
  | { kind: "oneline"; text: string };

/** 출발 활동 후보 한 건(activity_records 요약, No.36). */
export type RecordCandidate = {
  id: string;
  sourceProgram: string;
  status: string;
  gradeLabel: string | null;
  semester: number | null;
  subjectGroup: string | null;
  subject: string | null;
  topic: string | null;
  concept: string | null;
  limitation: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

/** 8절 작성본(No.129). 키는 SectionId. */
export type SubmissionSections = Record<SectionId, string>;

/** 주제 12항목(No.49)과 서버 고정값. */
export type TopicDetail = {
  title: string;
  subtitle: string;
  question: string;
  hypothesis1: string;
  hypothesis2: string;
  verifiability: string;
  concepts: string[];
  methodSteps: string[];
  sourceCandidates: string[];
  reason: string;
  careerLink: string;
  nextDirection: string;
  /** 경로 도식(No.50): 출발 활동, 연계 유형, 이번 탐구 질문. */
  path: { from: string; via: string; to: string };
  /** 비권장 유형일 때 어긋나는 이유(No.110, 154). */
  fitReason: string | null;
  /** 예비 주제일 때 이전 활동 확인 질문 3개(No.146). */
  followUpQuestions: string[];
};

export type Topic = {
  idx: 1 | 2 | 3;
  linkKind: LinkKind;
  linkageType: LinkageType;
  fit: Fit;
  detail: TopicDetail;
};

/** 설계 리포트 절별 설계(No.60). */
export type SectionPlan = {
  id: SectionId;
  role: string;
  must: string[];
  avoid: string[];
  tip: string;
};

/** 자료 출처표 한 행(No.10). 1차는 source, asOf 가 항상 "확인 필요". */
export type SourceTableRow = {
  item: string;
  source: string;
  asOf: string;
};

/** 검색 계획 한 행(No.64). */
export type SearchPlanRow = {
  keyword: string;
  institution: string;
  item: string;
};

/** 설계 리포트 본문(No.57~70). 상수 부분(루브릭, 체크리스트, 금지)은 저장하지 않고 조회 때 붙인다. */
export type DesignReport = {
  verifiability: string;
  sections: SectionPlan[];
  sourceTable: SourceTableRow[];
  searchPlan: SearchPlanRow[];
  interpretQuestions: { same: string; different: string; insufficient: string };
  scope: { minimum: string[]; optional: string[] };
};

/** 평가 항목 하나의 판정(No.83, 94). */
export type RubricItemResult = {
  id: RubricItemId;
  level: Level;
  score: number;
  met: string[];
  unmet: string[];
  evidence: string;
  /** 핵심 오류로 상한이 걸렸을 때의 사유. */
  capReason: string | null;
};

export type CoreErrorResult = {
  id: CoreErrorId;
  location: SectionId;
  detail: string;
  /** 어느 항목의 수준을 몇으로 제한했는지. */
  effect: string;
};

/** 먼저 고칠 것 한 건(No.95). */
export type FixItem = {
  location: SectionId;
  problem: string;
  impact: string;
  action: string;
  check: string;
};

export type SourceCheck = {
  text: string;
  status: SourceStatus;
};

/** 평가 리포트 본문(No.81~102). */
export type EvaluationReport = {
  total: number;
  label: SubmissionLabel;
  items: RubricItemResult[];
  coreErrors: CoreErrorResult[];
  fixFirst: FixItem[];
  mustFix: FixItem[];
  /** 체크리스트 13 충족 여부(No.66). */
  checklist: { id: string; met: boolean }[];
  sources: SourceCheck[];
  /** 절별 대괄호 자리표시자 개수(No.78). */
  placeholders: Partial<Record<SectionId, number>>;
};

/** 확정 적립 7항목(No.104). */
export type ActivityFields = {
  topic: string;
  concept: string;
  method: string;
  result: string;
  limitation: string;
  numbers: string[];
  sources: string[];
};

/** 성장설계 수신 8종(No.107). */
export type GrowthHandoff = {
  reportId: string;
  issuedAt: string;
  theme: string | null;
  subthemes: { grade: GradeLabel; stage: Stage; text: string }[];
  stage: Stage | null;
  weakAxes: string[];
  signals: unknown;
  planItems: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    axis: string | null;
  }[];
  /** 발행일이 오래됨(No.107, 181). */
  stale: boolean;
  /** 세션 학년 단계와 리포트 단계가 다름(No.109, 178). */
  stageMismatch: boolean;
};

/** 모델 응답 검증 이슈. */
export type ValidationIssue = { code: string; message: string; path?: string };

// ── 뷰 타입(서버 views.ts 미러, 부록 A) ─────────────────────────────────────

/** 생성 mode 하나의 진행 상태. 서버 session.ts ModeState 와 같다. */
export type ModeState = {
  status: "pending" | "running" | "ok" | "failed";
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  issues: unknown[];
};

/** 세션 생성 상태. 서버 session.ts parseGenerationState 결과와 같다. */
export type GenerationState = {
  modes: Record<GenerationMode, ModeState>;
  terminal: { reason: string; at: string; mode: string } | null;
};

export type SessionView = {
  id: string;
  status: SessionStatus;
  /** 화면 단계 1~6. */
  currentStep: ScreenStep;
  gradeLabel: GradeLabel | null;
  semester: Semester | null;
  career: string | null;
  subject: string | null;
  growthReportId: string | null;
  planItemId: string | null;
  replyPending: boolean;
  selectedTopicId: string | null;
  designReportId: string | null;
  latestEvaluationId: string | null;
  finalReportId: string | null;
  topicRoundCount: number;
  evaluationCount: number;
  generation: GenerationState;
  lastActivityAt: string;
  completedAt: string | null;
};

export type AssetView = {
  id: string;
  kind: AssetKind;
  reliability: Reliability;
  position: number;
  activityRecordId: string | null;
  interviewAnswers: InterviewAnswers | null;
  gaps: string[];
  onelineText: string | null;
  /** 기록은 topic, 인터뷰는 q1, 한 줄은 text. */
  summary: string;
};

export type TopicView = {
  id: string;
  round: number;
  idx: 1 | 2 | 3;
  linkKind: LinkKind;
  linkageType: LinkageType;
  fit: Fit;
  selected: boolean;
  detail: TopicDetail;
};

/** serviceAccess readQuotaSnapshot 그대로. null 은 정보 없음(0 이 아니다). */
export type QuotaView = {
  quotaTotal: number | null;
  quotaUsed: number | null;
  quotaRemaining: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
};

export type HandoffView = GrowthHandoff & {
  autoSelectedPlanItemId: string | null;
};

export type DesignView = DesignReport & {
  overview: {
    topicTitle: string;
    subtitle: string;
    linkKindLabel: string;
    startActivity: string;
    startGap: string;
    question: string;
    hypothesis1: string;
    hypothesis2: string;
    fit: Fit;
    fitLabel: string;
    fitReason: string | null;
    stageLabel: string;
    planItemTitle: string | null;
  };
  reliability: Reliability;
  reliabilityNotice: string | null;
  /** SECTIONS 상수(서버가 조회 때 붙인다). */
  lengths: {
    id: SectionId;
    numeral: string;
    title: string;
    group: SectionGroup;
    recommendedChars: number | null;
    hint: string;
  }[];
  /** CHECKLIST 상수. */
  checklist: {
    id: string;
    text: string;
    rubric: RubricItemId | null;
    section: SectionId;
    guidanceOnly: boolean;
  }[];
  rubricPreview: { id: RubricItemId; label: string; maxScore: number }[];
  /** DESIGN_FORBIDDEN 상수. */
  forbidden: string[];
};

export type SubmissionView = {
  id: string;
  revision: number;
  sections: SubmissionSections;
  counts: Record<SectionId, number>;
  strippedCounts: Record<SectionId, number>;
  placeholders: Partial<Record<SectionId, number>>;
  isDraft: boolean;
  updatedAt: string;
};

export type EvaluationView = EvaluationReport & {
  id: string;
  revision: number;
  createdAt: string;
};

export type FinalizePreview = {
  summary: {
    topic: string;
    subject: string;
    /** 출발 활동 요약과 연계 유형 라벨. */
    linkage: string;
    concepts: string[];
    limitation: string;
    score: number;
    label: SubmissionLabel;
    planItemTitle: string | null;
  };
  fields: ActivityFields;
  missing: string[];
};

// ── 요청과 응답(부록 A) ─────────────────────────────────────────────────────

/** 1. POST /api/inquiry/session */
export type SessionInfo = {
  gradeLabel: GradeLabel;
  semester: Semester;
  career: string;
  subject: string;
};

export type SessionRequest =
  | { action: "resume" }
  | { action: "create"; info: SessionInfo };

export type SessionResponse = {
  ok: true;
  session: SessionView | null;
  /** student_profiles 의 학년, 학기, 진로. 없으면 null. */
  profile: {
    gradeLabel: GradeLabel | null;
    semester: Semester | null;
    career: string | null;
  } | null;
  quota: QuotaView;
  handoff: HandoffView | null;
  records: RecordCandidate[];
  subjectCounts: { subject: string; count: number }[];
  assets: AssetView[];
  topics: TopicView[];
  gradeNote: string | null;
  replyResent: boolean;
};

/** 2. POST /api/inquiry/assets */
export type AssetsRequest = {
  sessionId: string;
  items: AssetInput[];
  planItemId: string | null;
};

export type AssetsResponse = {
  ok: true;
  assets: AssetView[];
  warnings: string[];
  planItemId: string | null;
};

/** 3. POST /api/inquiry/submission */
export type SubmissionRequest = {
  sessionId: string;
  sections: SubmissionSections;
};

export type SubmissionResponse = {
  ok: true;
  submission: SubmissionView;
};

/** 4. GET /api/inquiry/reports 목록 */
export type ReportsList = {
  ok: true;
  items: {
    sessionId: string;
    completedAt: string;
    subject: string;
    topicTitle: string;
    linkKind: LinkKind;
    score: number;
    label: SubmissionLabel;
  }[];
  open: {
    sessionId: string;
    currentStep: ScreenStep;
    subject: string;
    topicTitle: string | null;
    lastActivityAt: string;
  } | null;
  archived: {
    sessionId: string;
    subject: string;
    topicTitle: string | null;
    lastActivityAt: string;
    terminal: { reason: string; mode: string } | null;
  }[];
};

/** 4. GET /api/inquiry/reports?sessionId= 상세 */
export type SessionDetail = {
  ok: true;
  session: SessionView;
  assets: AssetView[];
  topics: TopicView[];
  topic: TopicView | null;
  design: DesignView | null;
  submission: SubmissionView | null;
  evaluation: EvaluationView | null;
  finalizePreview: FinalizePreview | null;
  final: ActivityFields | null;
  handoff: HandoffView | null;
};

// ── P4 생성 엔드포인트 계약(부록 B) ─────────────────────────────────────────────────

/** 생성 실패 응답의 공통 extra(ApiResult error 의 extra 로 온다). */
export type GenerationFailureExtra = {
  attempts?: number;
  issues?: ValidationIssue[];
  terminal?: boolean;
  generation?: GenerationState;
};

export type RecommendRequest = {
  sessionId: string;
  seedTopic?: string | null;
};

export type RecommendResponse = {
  ok: true;
  round: number;
  topics: TopicView[];
  charged?: boolean;
  quota: QuotaView | null;
  attempts: number;
  gradeNote: string | null;
  /** 라운드 수와 상태가 갱신된 세션. applyBootstrap({ session }) 으로 그대로 반영한다. */
  session: SessionView;
};

export type PlanReportRequest = {
  sessionId: string;
  topicId: string;
};

export type PlanReportResponse = {
  ok: true;
  design: DesignView;
  topic: TopicView;
  attempts: number;
  /** done 은 이미 만들어 둔 설계를 돌려준 멱등 응답. */
  result: "ok" | "done";
  designReportId: string;
  /** 주제 선택과 설계 id 가 반영된 세션. */
  session: SessionView;
};

export type EvaluateRequest = {
  sessionId: string;
};

export type EvaluateResponse = {
  ok: true;
  evaluation: EvaluationView;
  submission: SubmissionView;
  session: SessionView;
  attempts: number;
};

export type FinalizeRequest = {
  sessionId: string;
  fields: ActivityFields;
};

export type FinalizeResponse = {
  ok: true;
  status: "completed" | "already_completed";
  activityRecordId: string;
  finalReportId: string;
  replySent: boolean | null;
};
