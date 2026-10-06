// selfeval 테이블 행의 읽기 모양. db.ts 가 읽어 온 snake_case 행을 순수 모듈(view, sessionBody 등)이
// 같은 타입으로 받도록 모아 둔다. 타입만 있고 런타임 코드는 없다.

import type {
  CareerInfo,
  GrowthSnapshot,
  ReplyPending,
  ReportType,
} from "./types.js";

export type SessionRow = {
  id: string;
  profile_id: string;
  status: "draft" | "in_progress" | "completed" | "archived";
  current_step: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  academic_year: number | null;
  grade_label: "고1" | "고2" | "고3" | null;
  semester: 1 | 2 | null;
  area: "subject" | "autonomy" | "club" | "career" | null;
  subject: string | null;
  activity_name: string | null;
  school_prompt: string | null;
  teacher_note: string | null;
  target_chars: number | null;
  target_chars_mode: "with_space" | "without_space";
  career: CareerInfo | Record<string, never>;
  growth_report_id: string | null;
  growth_applied: boolean;
  growth_snapshot: GrowthSnapshot | null;
  plan_item_id: string | null;
  reply_pending: ReplyPending | null;
  regenerate_count: number;
  step_state: unknown;
  ledger_id: string | null;
  ledger_reversed_at: string | null;
  last_activity_at: string;
  completed_at: string | null;
  created_at: string;
};

/** 목록용. 큰 jsonb(growth_snapshot, career, school_prompt 등)를 읽지 않는다. */
export type SessionListRow = Pick<
  SessionRow,
  | "id"
  | "status"
  | "current_step"
  | "academic_year"
  | "semester"
  | "area"
  | "subject"
  | "activity_name"
  | "step_state"
  | "last_activity_at"
  | "completed_at"
>;

export type SessionActivityRow = {
  activity_record_id: string;
  role: "core" | "support";
  fit_score: number | null;
  fit_reasons: unknown;
  analysis: unknown;
  analysis_source: "model" | "student" | null;
};

/** activity_records 에서 읽는 7항목과 식별 컬럼. */
export type ActivityRecordRow = {
  id: string;
  source_program: "performance" | "deep" | "self" | "manual" | "upload";
  status: "planned" | "draft" | "confirmed" | "final";
  grade_label: "고1" | "고2" | "고3" | null;
  semester: 1 | 2 | null;
  subject_group: string | null;
  subject: string | null;
  topic: string | null;
  concept: string | null;
  method: string | null;
  result: string | null;
  limitation: string | null;
  numbers: unknown;
  sources: unknown;
  created_at: string;
};

export type ReportRow = {
  id: string;
  session_id: string;
  report_type: ReportType;
  revision: number;
  sections: unknown;
  char_count: unknown;
  score: number | null;
  mandatory_fixes: unknown;
  created_at: string;
};

export type StudentProfileRow = {
  grade: string | null;
  semester: number | null;
  career: string | null;
  department: string | null;
  universities: string[];
};
