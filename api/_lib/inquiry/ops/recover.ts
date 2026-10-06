// 관리자 실패 세션 복구(POST /api/admin/inquiry-recover)의 순수 규칙.
//
// 복구는 새 세션을 만든다. 종결된 원본(archived + generation_state.terminal)은 건드리지 않고
// generation_state.recoveredTo 에 새 세션 id 만 남긴다. 새 세션은 draft, current_step 1 이다.
// 정보 입력 값(학년, 학기, 진로, 과목, 성장설계 연결)과 자산만 복사하고 주제, 설계, 작성본은
// 복사하지 않는다(주제 추천부터 다시).
//
// 차감: 원본은 종결 때 차감이 되돌려졌다. 새 세션은 ledger_id 가 없는 draft 라 첫 주제 추천
// 성공 시점에 다시 차감된다. 복구 자체는 차감하지 않는다.

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
  grade_label: string | null;
  semester: number | null;
  career: string | null;
  subject: string;
  growth_report_id: string | null;
  plan_item_id: string | null;
  generation_state: unknown;
};

export type RecoverAssetRow = {
  kind: string;
  reliability: string;
  position: number;
  activity_record_id: string | null;
  interview_answers: unknown;
  gaps: string[] | null;
  oneline_text: string | null;
};

export type NewSessionRow = {
  profile_id: string;
  status: "draft";
  current_step: 1;
  grade_label: string | null;
  semester: number | null;
  career: string | null;
  subject: string;
  growth_report_id: string | null;
  plan_item_id: string | null;
  last_activity_at: string;
};

/** session_id 는 새 세션 insert 뒤 핸들러가 채운다. */
export type NewAssetRow = RecoverAssetRow & { profile_id: string };

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export function planRecovery(
  row: RecoverSourceRow,
  assets: RecoverAssetRow[],
  nowIso: string,
):
  | { ok: true; session: NewSessionRow; assets: NewAssetRow[] }
  | { ok: false; code: "NOT_RECOVERABLE" | "ALREADY_RECOVERED" } {
  const state = asObject(row.generation_state);
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

  return {
    ok: true,
    session: {
      profile_id: row.profile_id,
      status: "draft",
      current_step: 1,
      grade_label: row.grade_label,
      semester: row.semester,
      career: row.career,
      subject: row.subject,
      growth_report_id: row.growth_report_id,
      plan_item_id: row.plan_item_id,
      last_activity_at: nowIso,
    },
    assets: assets.map((a) => ({
      profile_id: row.profile_id,
      kind: a.kind,
      reliability: a.reliability,
      position: a.position,
      activity_record_id: a.activity_record_id,
      interview_answers: a.interview_answers,
      gaps: a.gaps ? [...a.gaps] : null,
      oneline_text: a.oneline_text,
    })),
  };
}
