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
}
