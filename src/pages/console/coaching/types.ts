// GET /api/console/coaching, /api/console/coaching/students 응답. 서버 라우트와 같은 모양이다.

export type ServiceKey =
  | "diagnosis"
  | "goal"
  | "growth"
  | "performance"
  | "selfeval"
  | "inquiry";

export type VerdictLevel = "good" | "caution" | "risk" | "no_data";
export type Signal = "focus" | "caution" | "insufficient" | "stable";

export interface PickerStudent {
  studentId: string;
  name: string;
  grade: string | null;
  groupName: string | null;
  classId: string | null;
  className: string | null;
  number: number | null;
  usesDiagnosis: boolean;
  usesGoal: boolean;
}

export interface StudentList {
  students: PickerStudent[];
  defaultStudentId: string | null;
}

export interface Axis {
  key: string;
  name: string;
  score: number | null;
  status: "scored" | "not_used" | "before_eval";
  missingServices: string[];
}

export interface Competency {
  key: string;
  name: string;
  score: number | null;
  basisUsed: number;
  basisTotal: number;
  evidence: string[];
  fallback?: string;
}

export interface Target {
  university: string;
  department: string;
  /** 수시 확률(정수 %). 산출 전이면 null. */
  probability?: number | null;
}

export interface Coaching {
  student: {
    id: string;
    name: string;
    grade: string | null;
    groupName: string | null;
    className: string | null;
    number: number | null;
    homeroomName: string | null;
    lastSeenAt: string | null;
    servicesUsed: number;
    services: Record<ServiceKey, "using" | "not_joined">;
    targets: { ideal: Target | null; min: Target | null } | null;
  };
  verdicts: Record<
    "execution" | "learning" | "linkage",
    { level: VerdictLevel; reason?: string }
  >;
  signal: Signal;
  signalSubLine: string;
  coachingType: { code: string; name: string };
  summary: string;
  axes: Axis[];
  highlights: {
    strongest: { name: string; score: number } | null;
    weakest: { name: string; score: number } | null;
  };
  competencies: Competency[];
  text: CoachingText;
  serviceCards: ServiceCard[];
}

export interface GoalOpinion {
  summary: string;
  details: {
    recordFlow: string;
    weekdayPattern: string;
    distractions: string;
    questions: string[];
  } | null;
}

export interface CoachingText {
  priorityTask: string | null;
  points: string[];
  gradeInputCheck: string | null;
  competencyGap: string | null;
  strengths: string[];
  weaknesses: string[];
  careerPlan: { label: string; items: string[] }[] | null;
  studyMethods: string[];
  goalOpinion: GoalOpinion | null;
}

export interface ServiceCard {
  service: ServiceKey;
  name: string;
  state: "using" | "not_joined" | "no_goal";
  chip: string;
  tone: "neutral" | "success" | "warning";
  value: string;
  detail: string;
}

export interface ServiceDetailTable {
  heading: string;
  columns: string[];
  rows: string[][];
}

export interface DiagnosisBar {
  group: "execution" | "readiness";
  name: string;
  score: number;
  status: string;
  firstStep: string;
  /** 목표선(75점). 학습 실행 역량 줄에만 있다. */
  target?: number;
}

export interface ServiceDetail {
  service: ServiceKey;
  title: string;
  metrics: { label: string; value: string; sub?: string }[];
  table: ServiceDetailTable | null;
  points: string[];
  /** 학습진단 창: 요약 문장, 12개 영역 줄, 우선순위 표. */
  summary?: string;
  bars?: DiagnosisBar[];
  secondTable?: ServiceDetailTable;
  /** 목표관리 창: 목표대학 확률은 상담 참고 지표라는 안내. */
  notice?: string;
}

export interface ReportView {
  title: string;
  summary: string;
  sections: { title: string; text: string }[];
}
