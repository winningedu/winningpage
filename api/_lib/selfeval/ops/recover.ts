// 관리자 실패 세션 복구(POST /api/admin/selfeval-recover)의 순수 규칙.
//
// 복구는 새 draft 세션을 만든다. 종결된 원본(archived + step_state.terminal, 학생 파기
// discarded 포함)은 건드리지 않고 step_state.recoveredTo 에 새 세션 id 만 남긴다.
// 기본 입력과 선택 활동(분석 포함)만 복사한다. 생성, 검증 리포트와 차감 이력은 가져오지 않는다.
// 분석을 같이 가져가므로 활동 선택을 확정한 세션(current_step 2 이상)은 2단계에서 다시 시작한다.
// 차감은 종결 때 이미 되돌려졌고 새 세션은 ledger_id 가 없어 다음 모델 호출 단계에서 다시 차감된다.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRecoverBody(
  raw: unknown,
): { ok: true; sessionId: string } | { ok: false; reason: string } {
  const id =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).sessionId
      : undefined;
  if (typeof id !== "string" || !UUID_RE.test(id.trim()))
    return { ok: false, reason: "sessionId 가 올바르지 않습니다." };
  return { ok: true, sessionId: id.trim() };
}

export type RecoverSourceRow = {
  id: string;
  profile_id: string;
  status: string;
  current_step: number;
  academic_year: number | null;
  grade_label: string | null;
  semester: number | null;
  area: string | null;
  subject: string | null;
  activity_name: string | null;
  school_prompt: string | null;
  teacher_note: string | null;
  target_chars: number | null;
  target_chars_mode: string;
  career: unknown;
  growth_report_id: string | null;
  growth_applied: boolean;
  growth_snapshot: unknown;
  plan_item_id: string | null;
  step_state: unknown;
};

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function canRecover(
  row: Pick<RecoverSourceRow, "status" | "step_state">,
): { ok: true } | { ok: false; code: "NOT_RECOVERABLE" | "ALREADY_RECOVERED" } {
  const state = asObject(row.step_state);
  const terminal = state.terminal;
  if (
    row.status !== "archived" ||
    !terminal ||
    typeof terminal !== "object" ||
    Array.isArray(terminal)
  )
    return { ok: false, code: "NOT_RECOVERABLE" };
  if (typeof state.recoveredTo === "string" && state.recoveredTo)
    return { ok: false, code: "ALREADY_RECOVERED" };
  return { ok: true };
}

export function cloneSessionForRecovery(row: RecoverSourceRow, nowIso: string) {
  return {
    profile_id: row.profile_id,
    status: "draft" as const,
    current_step: row.current_step >= 2 ? 2 : 1,
    academic_year: row.academic_year,
    grade_label: row.grade_label,
    semester: row.semester,
    area: row.area,
    subject: row.subject,
    activity_name: row.activity_name,
    school_prompt: row.school_prompt,
    teacher_note: row.teacher_note,
    target_chars: row.target_chars,
    target_chars_mode: row.target_chars_mode,
    career: row.career,
    growth_report_id: row.growth_report_id,
    growth_applied: row.growth_applied,
    growth_snapshot: row.growth_snapshot,
    plan_item_id: row.plan_item_id,
    step_state: {},
    last_activity_at: nowIso,
  };
}

export type RecoverActivityRow = {
  activity_record_id: string;
  role: string;
  fit_score: number | null;
  fit_reasons: unknown;
  analysis: unknown;
  analysis_source: string | null;
};

export function cloneActivitiesForRecovery(
  rows: RecoverActivityRow[],
  newSessionId: string,
  profileId: string,
) {
  return rows.map((a) => ({
    session_id: newSessionId,
    profile_id: profileId,
    activity_record_id: a.activity_record_id,
    role: a.role,
    fit_score: a.fit_score,
    fit_reasons: a.fit_reasons,
    analysis: a.analysis,
    analysis_source: a.analysis_source,
  }));
}
