// 관리자 실패 회차 복구(POST /api/admin/growth-recover)의 순수 규칙.
//
// 복구는 새 회차를 만든다. 종결된 원본(archived)은 건드리지 않고 step_state.recoveredTo 에
// 새 회차 id 만 남긴다. 새 회차는 생성 전 상태(current_step 0, step_state 비어 있음,
// ledger_id 없음)라 학생이 생성 화면에서 바로 다시 만들 수 있다.
//
// 차감: 원본은 종결(fn_growth_terminate_report) 때 차감이 되돌려졌다. 새 회차는 ledger_id 가
// 없으므로 1단계 성공 시점에 consume_growth_credit 으로 다시 차감된다. 복구 자체는 차감하지 않는다.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateRecoverBody(
  raw: unknown,
): { ok: true; reportId: string } | { ok: false; reason: string } {
  const id =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).reportId
      : undefined;
  if (typeof id !== "string" || !UUID_RE.test(id.trim()))
    return { ok: false, reason: "reportId 가 올바르지 않습니다." };
  return { ok: true, reportId: id.trim() };
}

export type RecoverSourceRow = {
  id: string;
  profile_id: string;
  status: string;
  track: string | null;
  survey_answers: unknown;
  activity_ids: string[];
  grade_inputs: unknown;
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

export type RecoveryInsert = {
  profile_id: string;
  track: string | null;
  survey_answers: unknown;
  activity_ids: string[];
  grade_inputs: unknown;
  status: "in_progress";
  current_step: 0;
  step_state: Record<string, never>;
  last_activity_at: string;
};

export function cloneForRecovery(
  row: RecoverSourceRow,
  nowIso: string,
): RecoveryInsert {
  return {
    profile_id: row.profile_id,
    track: row.track,
    survey_answers: row.survey_answers,
    activity_ids: [...row.activity_ids],
    grade_inputs: row.grade_inputs,
    status: "in_progress",
    current_step: 0,
    step_state: {},
    last_activity_at: nowIso,
  };
}
