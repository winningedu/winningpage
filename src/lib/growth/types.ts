// 성장설계 API 응답과 요청 타입, 서버 핸들러 머리 주석과 api/_lib/growth 의 순수 모듈 반환형을
// 그대로 옮겼다(api/growth/survey.ts, collect.ts, report.ts, reports.ts, plan.ts, plan/item.ts).
// 서버 계약이 바뀌면 이 파일만 고친다. 서버 주석에 모양이 없는 큰 jsonb 필드(sections, signals 등)는
// 화면 담당이 쓰는 시점에 좁히도록 unknown 으로 둔다.
//
// 모든 성공 본문은 `ok: true` 를 달고 온다. 실패 본문은 apiResult.ts 가 error 로 정규화한다.

// ── 공통 ──────────────────────────────────────────────────────────────
export type Track = "고1" | "고2" | "고3" | "졸업" | "N수";
export type HighGrade = "고1" | "고2" | "고3";
export type SemesterKey =
  | "고1-1"
  | "고1-2"
  | "고2-1"
  | "고2-2"
  | "고3-1"
  | "고3-2";
export type GradeSystem = "five" | "nine";
export type Sufficiency = "enough" | "insufficient" | "none";

// ── 설문 ──────────────────────────────────────────────────────────────
export type SurveyKind =
  | "text"
  | "choice"
  | "multi"
  | "department"
  | "universities";

export type SurveyQuestion = {
  key: string;
  group: string;
  kind: SurveyKind;
  options?: readonly string[];
};

export type SurveyPick = {
  name: string;
  source?: "diagnosis" | "activity" | "manual" | "search";
  custom?: boolean;
};

export type SurveyValue = string | string[] | SurveyPick | SurveyPick[];
/** null 값은 해당 문항 비우기를 뜻한다. */
export type SurveyAnswers = Record<string, SurveyValue | null>;

export type SurveyEntitlement = {
  hasAccess: boolean;
  quotaTotal: number | null;
  quotaRemaining: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
};

/** goal_students 에서 만든 학생 프로필 초기값. 진로는 목표관리에 없어 채우지 않는다. */
export type ProfileInitial = {
  department?: string;
  universities?: string[];
  grade?: HighGrade;
  schoolType?: string;
  source: "goal";
};

export type ResumePhase =
  | "survey"
  | "collect"
  | "generating"
  | "report"
  | "plan";

export type OpenReportCard = {
  startedAt: string;
  lastSavedAt: string;
  stepLabel: string;
};

/** 미완(draft, in_progress) 회차 요약. 시작 화면, 사이드바, 학생 조사 복원이 함께 쓴다. */
export type OpenReport = {
  id: string;
  status: "draft" | "in_progress";
  /** 0 이면 4단계(리포트 생성) 전, 0 보다 크면 생성이 시작돼 설문이 잠긴다. */
  currentStep: number;
  track: string | null;
  answered: number;
  total: number;
  /** 저장된 설문 답 본문. 학생 조사 화면 복원용. */
  answers: Record<string, unknown>;
  lastActivityAt: string;
  startedAt: string;
  resume: { resumeStep: number; phase: ResumePhase };
  card: OpenReportCard;
};

export type SourceCounts = {
  performance: number;
  self: number;
  deep: number;
  manual: number;
  upload: number;
  total: number;
};

export type GroupCounts = {
  curricular: number;
  extracurricular: number;
  unclassified: number;
};

export type FirstYearSufficiency = {
  count: number;
  level: Sufficiency;
  label: string;
};

/** 시작 화면용 활동 개요. */
export type ActivityOverview = {
  total: number;
  bySource: SourceCounts;
  byGroup: GroupCounts;
  firstYear: FirstYearSufficiency;
};

export type SurveyPrefill = Partial<
  Record<"q5" | "q10" | "q11" | "q24", unknown>
> & { filledFrom: "diagnosis" };

export type SurveyBootstrap = {
  ok: true;
  questions: readonly SurveyQuestion[];
  entitlement: SurveyEntitlement;
  /** student_profiles 행. 없으면 null. */
  profile: Record<string, unknown> | null;
  profileInitial: ProfileInitial | null;
  openReport: OpenReport | null;
  activityOverview: ActivityOverview;
  reports: { id: string; issuedAt: string; track: string | null }[];
  archivedCount: number;
  prefill: {
    survey: SurveyPrefill | null;
    autoFilled: { favoriteSubjects: string[]; books: string[] };
    previousAnswers: unknown;
  };
  promotion: {
    propose: boolean;
    next: { grade: 2 | 3; semester: 1 } | null;
  } | null;
};

export type SaveSurveyRequest = {
  /** 생략하면 미완 회차를 쓰고, 없으면 첫 저장 때 만든다. */
  reportId?: string;
  answers: SurveyAnswers;
};

export type SaveSurveyResponse = {
  ok: true;
  reportId: string;
  answered: number;
  total: number;
  savedAt: string;
};

// ── 자료 수집(collect) ────────────────────────────────────────────────
export type CurrentSemester = { grade: 1 | 2 | 3; semester: 1 | 2 };

/** summary 와 commit 이 공유하는 집계 입력. */
export type CollectAggregateRequest = {
  track: Track;
  directGrades?: Partial<Record<SemesterKey, number | null>> | null;
  current?: CurrentSemester;
};

export type UploadRequest = {
  fileName: string;
  mimeType: string;
  byteSize: number;
  gradeLabel: HighGrade;
  semester: 1 | 2;
  /** 개인정보 수집 동의. 항상 true 여야 한다. */
  consent: true;
};

export type SemesterRow = {
  key: SemesterKey;
  count: number;
  sufficiency: Sufficiency;
  label: string;
  notice: string | null;
};

export type UploadStatus = "pending" | "processing" | "ok" | "failed";

export type CollectUpload = {
  id: string;
  fileName: string;
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  status: UploadStatus;
};

export type GradeInputSemester = {
  key: SemesterKey;
  average: number | null;
  source: "direct" | "goal" | null;
};

export type CollectSummary = {
  range: { semesters: SemesterKey[]; description: string };
  omitted: { ids: string[]; reasons: string[] };
  bySource: SourceCounts;
  byGroup: GroupCounts;
  semesters: SemesterRow[];
  firstYear: FirstYearSufficiency;
  uploadsPending: number;
  uploads: CollectUpload[];
  uploadQuotaBySemester: Partial<Record<SemesterKey, number>>;
  analysisActivityIds: string[];
  gradeInputs: {
    system: GradeSystem | null;
    semesters: GradeInputSemester[];
    note: string | null;
  };
  monthlyPlan: boolean;
  warnings: string[];
};

/** 활동 선택 화면용 활동 행(planned 제외). */
export type ActivityView = {
  id: string;
  source: "performance" | "deep" | "self" | "manual" | "upload";
  status: "planned" | "draft" | "confirmed" | "final";
  gradeLabel: HighGrade | null;
  semester: 1 | 2 | null;
  subjectGroup: string | null;
  subject: string | null;
  topic: string | null;
};

export type CollectSummaryResponse = {
  ok: true;
  reportId: string;
  summary: CollectSummary;
  activities: ActivityView[];
};

export type CollectCommitResponse = {
  ok: true;
  reportId: string;
  summary: CollectSummary;
  committed: true;
};

export type UploadUrlResult = {
  ok: true;
  uploadId: string;
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
};

export type ExtractField = "topic" | "concept" | "result" | "limitation";
export type Extracted = Record<ExtractField, string | null>;

export type ExtractResult = {
  ok: true;
  uploadId: string;
  /** failed 도 HTTP 200 이다. 사유는 error 에 있다. */
  status: "ok" | "failed";
  extracted?: Extracted;
  error?: string;
  activityId?: string;
};

// ── 리포트 생성(report) ───────────────────────────────────────────────
export type StepProgress = {
  step: number;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
};

export type ReportStepRequest = {
  reportId: string;
  /** 1~8. */
  step: number;
};

export type ReportStepResponse = {
  ok: true;
  reportId: string;
  step: number;
  /** done 은 이미 성공한 단계를 다시 요청한 멱등 응답이다. */
  result: "ok" | "done";
  attempts: number;
  /** 8단계 성공이면 null(모든 단계 완료). */
  nextStep: number | null;
  progress: StepProgress[];
  /** 1단계 성공 직후 차감을 시도했을 때만 실린다. false 면 차감하지 못한 것. */
  charged?: boolean;
  /** 8단계 성공 시. */
  completion?: { issuedAt: string; planItemCount: number };
};

/** 실패 응답의 extra 에 실리는 필드(attempts, issues, progress, terminal). */
export type ReportStepFailureExtra = {
  attempts?: number;
  issues?: unknown;
  progress?: StepProgress[];
  /** true 면 회차가 종결된 것이다. */
  terminal?: true;
};

// ── 저장 리포트(reports) ──────────────────────────────────────────────
export type ReportStatus = "draft" | "in_progress" | "completed" | "archived";

export type ReportListItem = {
  id: string;
  status: ReportStatus;
  track: string | null;
  issuedAt: string | null;
  theme: string | null;
  lastActivityAt: string;
  plan: { total: number; done: number } | null;
};

export type OpenReportSummary = {
  id: string;
  status: ReportStatus;
  currentStep: number;
  track: string | null;
  progress: StepProgress[];
  nextStep: number | null;
  terminal: unknown;
  lastActivityAt: string;
};

export type LastTerminal = {
  reportId: string;
  reason: string;
  at: string;
  step: number;
};

export type ReportsList = {
  ok: true;
  items: ReportListItem[];
  /** 미완 회차 요약 1건. 생성 화면 재진입용. */
  open: OpenReportSummary | null;
  archivedCount: number;
  lastTerminal: LastTerminal | null;
};

/** 학부모가 자녀의 완료 회차를 볼 때의 목록 응답. child.name 은 이름이 없으면 null. */
export type ChildReportsList = {
  ok: true;
  items: ReportListItem[];
  child: { id: string; name: string | null };
};

export type ReportDetailView = "parent";

export type ReportPlanItem = {
  id: string;
  [field: string]: unknown;
};

export type ReportDetail = {
  ok: true;
  report: {
    id: string;
    status: ReportStatus;
    track: string | null;
    issuedAt: string | null;
    currentStep: number;
    progress: StepProgress[];
    range: { semesters: SemesterKey[]; description: string } | null;
    omitted: { ids: string[]; reasons: string[] } | null;
    narrative: unknown;
    overview: unknown[];
    consistency: unknown;
    axes: unknown;
    sections: unknown[];
    /** view=parent 일 때 뺀 성적 민감 섹션 id. */
    excludedSectionIds: string[];
    planItems: ReportPlanItem[];
    lastActivityAt: string;
  };
};

// ── 실행계획(plan) ────────────────────────────────────────────────────
export type PlanPeriod = "course_selection" | "semester" | "vacation";
export type PlanPriority = "required" | "recommended";
export type PlanProgram = "school" | "self" | "deep";
export type PlanDoneSource = "manual" | "self" | "deep";
export type Axis = string;

export type PlanItemView = {
  id: string;
  program: PlanProgram;
  title: string;
  description: string | null;
  priority: PlanPriority;
  axis: Axis | null;
  category: string | null;
  period: PlanPeriod;
  periodLabel: string | null;
  deadline: string | null;
  dday: number | null;
  urgent: boolean;
  deadlineLabel: string | null;
  done: boolean;
  doneSource: PlanDoneSource | null;
  doneAt: string | null;
  carried: boolean;
  carriedFromReportId: string | null;
  sortOrder: number;
};

export type PlanGroup = {
  period: PlanPeriod;
  label: string;
  items: PlanItemView[];
};

export type PlanProgress = {
  total: number;
  done: number;
  remaining: number;
  percent: number;
};

export type ProgramHandoff = {
  reportId: string;
  itemId: string;
  program: PlanProgram;
  theme: string | null;
  currentGrade: HighGrade | null;
  stage: string | null;
  subtheme: string | null;
  condition: {
    title: string;
    description: string | null;
    axis: Axis | null;
    category: string | null;
  };
};

export type PlanBody = {
  reportId: string;
  issuedAt: string | null;
  track: Track | null;
  theme: string | null;
  stage: string | null;
  currentGrade: HighGrade | null;
  subtheme: string | null;
  groups: PlanGroup[];
  progress: PlanProgress;
  nextDeadline: unknown;
  carried: PlanItemView[];
  avoidRepeats: unknown[];
  /** 리포트 시점, 현재, 전부 완료 시 지표. 조회 때 계산하며 스냅샷이 깨지면 null. */
  metrics: unknown;
  /** self, deep 항목의 프로그램 이동 전달값. 키는 항목 id. */
  handoffs: Record<string, ProgramHandoff>;
};

export type PlanResponse = { ok: true; plan: PlanBody };

export type PlanItemAction =
  | { action: "check"; itemId: string; done: boolean }
  | { action: "set-deadline"; itemId: string; deadline: string | null };

export type PlanItemChangeResponse =
  | {
      ok: true;
      changed: true;
      item: PlanItemView;
      progress: PlanProgress;
      nextDeadline: unknown;
      metrics: unknown;
    }
  | {
      ok: true;
      changed: false;
      /** already_done, already_pending, same_deadline, duplicate_confirm. */
      reason: string;
      item: PlanItemView;
    };
