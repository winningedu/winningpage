// 자기평가서 리포트 데이터 계약(명세 No.133~173). 서버(api/_lib/selfeval/report)가 만들고
// 이후 화면과 PDF 가 같은 모양으로 읽는다. 학생 이름은 담지 않는다(No.90, 134).
// 숫자, 목록, 꼬리표, 문장 번호, 반영률, 라벨은 코드가 정하고 모델 문장만 explanation, summary 류 칸에 들어간다.

type ReportTagKind = "P" | "D" | "A" | "H";

/** 꼬리표 문자열. 예: P1, D2, A1, H3. */
export type ReportTag = string;

export type ReportStepKey =
  | "diagnosis"
  | "goal"
  | "growth"
  | "performance"
  | "inquiry"
  | "selfeval";

export type ReportCover = {
  /** 표시형 학년. 예: 고등학교 1학년. 값이 없으면 null. */
  gradeLabel: string | null;
  /** 최종 저장 시각. yyyy. mm. dd */
  savedAt: string;
  /** 예: 수학 자기평가서 */
  subjectTitle: string;
  academicYear: number;
  /** 서비스별 완료 기록 1건 이상 여부(No.136). */
  steps: Record<ReportStepKey, boolean>;
};

export type ReportSentence = {
  /** 1부터 시작하는 문장 번호. */
  n: number;
  text: string;
  /** 근거 꼬리표. 같은 꼬리표는 한 번만, 주요 근거가 먼저. */
  tags: ReportTag[];
  /** 근거가 0개라 학생 확인이 필요한 문장(No.199). */
  needsConfirm: boolean;
};

type ReportParagraph = {
  sentences: ReportSentence[];
};

export type ReportCh01 = {
  paragraphs: ReportParagraph[];
  charCount: { withSpace: number; withoutSpace: number };
  targetChars: number | null;
  targetCharsMode: "with_space" | "without_space";
  /** 목표 대비 차이(%) 소수 첫째 자리. 목표가 없으면 null. */
  diffPercent: number | null;
  paragraphCount: number;
  sentenceCount: number;
};

export type ReportRecordKind = "performance" | "deep" | "activity";

export type ReportRole =
  | "core"
  | "main"
  | "reflection"
  | "support"
  | "indirect"
  | "in_progress"
  | "unreflected";

export type ReportUnreflectedReason =
  | "unrelated"
  | "other_subject"
  | "deselected"
  | "plan";

export type ReportCh02Row = {
  tag: ReportTag;
  recordId: string;
  kind: ReportRecordKind;
  title: string | null;
  /** 제출일 yyyy.mm.dd. 완료되지 않은 기록은 null. */
  submittedOn: string | null;
  inProgress: boolean;
  /** 기록 요약 또는 모델이 만든 요약. 없으면 null. */
  summary: string | null;
  sentenceNumbers: number[];
  role: ReportRole;
  roleLabel: string;
  /** 0~5 */
  dots: number;
  /** 미반영 기록만. */
  reasonCode: ReportUnreflectedReason | null;
  reasonLabel: string | null;
  /** 미반영 기록의 이유 문장(모델). */
  reasonText: string | null;
  /** 그 과목의 자기평가서가 아직 없을 때만. 예: 국어 자기평가 추천 */
  recommendation: string | null;
};

export type ReportCh02Subject = {
  subject: string;
  /** 예: 수학 (공통수학1) */
  label: string;
  writing: boolean;
  counts: { performance: number; deep: number; activity: number };
  inProgress: { performance: number; deep: number; activity: number };
  reflectedSentenceCount: number;
  rows: ReportCh02Row[];
};

export type ReportCh02 = { subjects: ReportCh02Subject[] };

export type ReportRelation = "inherit" | "deepen" | "complement";

export type ReportCh03Row = {
  tag: ReportTag;
  recordId: string;
  kind: ReportRecordKind;
  title: string | null;
  /** 작성 과목과 다른 기록이면 그 과목명. */
  subject: string | null;
  submittedOn: string | null;
  role: ReportRole;
  relation: ReportRelation;
  relationLabel: string;
  /** 기록에 명시, 학생 확인. 연계 판정이 없으면 null. */
  strengthLabel: string | null;
  sentenceNumbers: number[];
  explanation: string | null;
};

export type ReportCh03 = { rows: ReportCh03Row[] };

export type ReportCh04Row = {
  tag: ReportTag;
  logId: string;
  /** yyyy.mm.dd */
  writtenOn: string;
  /** 고치지 않은 원문. */
  text: string;
  sentenceNumbers: number[];
  reflected: boolean;
  explanation: string | null;
  reasonLabel: string | null;
};

export type ReportCh04 = {
  rows: ReportCh04Row[];
  reflectedCount: number;
  totalCount: number;
  sentenceTotal: number;
  sentenceNumbers: number[];
  /** 코드 틀 문장 뒤에 모델 한 문장을 붙인 요약. 모델 문장이 없으면 틀만. */
  summary: string;
};

type ReportCounts = {
  completedReports: number;
  subjectCount: number;
  reflectedReports: number;
  reflectedMemos: number;
  linkedSubjects: string[];
};

type ReportCardState = "ok" | "none" | "error";

export type ReportTextCard = {
  state: ReportCardState;
  text: string | null;
  /** yyyy.mm.dd. 학습진단 카드만. */
  date: string | null;
};

export type ReportTagCard = {
  items: { tag: ReportTag; subject: string }[];
  /** 진행 중이라 반영하지 않은 기록의 꼬리표. */
  inProgressTags: ReportTag[];
};

type ReportSelfevalCard = {
  total: number;
  linked: number;
  allLinked: boolean;
  text: string;
};

export type ReportNextStepKey =
  | "memo_detail"
  | "finish_in_progress"
  | "verify_action"
  | "use_elsewhere"
  | "verification_fix";

export type ReportNextStep = {
  key: ReportNextStepKey;
  /** 근거 꼬리표. 항상 있다(No.169). */
  tag: ReportTag;
  /** 모델 문장. 모델 호출이 비었으면 null. */
  text: string | null;
};

export type ReportCh05 = {
  counts: ReportCounts;
  cards: {
    diagnosis: ReportTextCard;
    goal: ReportTextCard;
    growth: ReportTextCard;
    performance: ReportTagCard;
    inquiry: ReportTagCard;
    selfeval: ReportSelfevalCard;
  };
  nextSteps: ReportNextStep[];
};

export type ReportPayload = {
  version: 1;
  cover: ReportCover;
  ch01: ReportCh01;
  ch02: ReportCh02;
  ch03: ReportCh03;
  /** 확인한 수기 메모가 없으면 null. 목차에 해당 없음을 표시한다(No.162). */
  ch04: ReportCh04 | null;
  ch05: ReportCh05;
  /** true 면 모델 문장이 비었다. 화면이 다시 만들기를 제안한다(No.138, 201). */
  composeMissing: boolean;
  /** true 면 일부 항목의 모델 문장만 비었다. 화면이 다시 만들기를 제안한다(No.138). */
  composePartial: boolean;
};

/** 태그 번호를 첫 생성 때 고정한 맵(No.146). 값은 기록 id 또는 수기 로그 id. */
export type ReportTagMap = Record<ReportTag, string>;

/** building 은 저장되지 않고, 선점이 진행 중일 때 읽기가 돌려준다. */
export type ReportViewStatus = "ready" | "failed" | "building";

/** GET /api/selfeval/report 응답 본문. */
export type ReportView = {
  sessionId: string;
  finalRevision: number;
  status: ReportViewStatus;
  attempts: number;
  builtAt: string;
  payload: ReportPayload | null;
};

/** GET, POST /api/selfeval/report 성공 본문. 서버 계약은 shared/selfeval/report.ts 다. */
export type ReportResponse = {
  /** POST 에서만. 같은 리비전의 완성본을 다시 만들지 않고 돌려줬는지. */
  reused?: boolean | undefined;
  report: ReportView;
};
