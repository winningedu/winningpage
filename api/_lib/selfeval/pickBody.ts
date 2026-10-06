// 활동 선택 API(pick-records)의 바디 검증과 행 조립(명세 No.26~36, 계획서 §2 5).
// 순수 모듈이다. DB 접근은 db.ts 와 핸들러가 한다.

import { type ManualInput, validateManualInput } from "./manual.js";
import type { PickContext } from "./pick.js";
import type { SessionRow } from "./rows.js";
import type {
  Analysis,
  CandidateRow,
  HighGrade,
  SessionStep,
} from "./types.js";

export type PickBody =
  | { sessionId: string; action: "list" }
  | {
      sessionId: string;
      action: "select";
      coreId: string;
      supportIds: string[];
    }
  | { sessionId: string; action: "manual"; input: ManualInput };

export type PickBodyValidation =
  | { ok: true; body: PickBody }
  | {
      ok: false;
      code: "INVALID_BODY" | "ACTIVITY_NAME_REQUIRED" | "SUBJECT_REQUIRED";
      message: string;
    };

const GRADES: readonly HighGrade[] = ["고1", "고2", "고3"];
const MANUAL_TEXT_KEYS = [
  "activityName",
  "subjectOrArea",
  "motive",
  "concept",
  "action",
  "method",
  "result",
  "role",
  "limitation",
  "next",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const invalid = (message: string): PickBodyValidation => ({
  ok: false,
  code: "INVALID_BODY",
  message,
});

function parseManualInput(raw: unknown): ManualInput | null {
  if (!isRecord(raw)) return null;
  const text = {} as Record<(typeof MANUAL_TEXT_KEYS)[number], string>;
  for (const key of MANUAL_TEXT_KEYS) {
    const v = raw[key];
    // 비워 둔 항목은 키가 없거나 null 로 온다. 비어 있다는 사실만 빈 문자열로 옮긴다.
    if (v === undefined || v === null) text[key] = "";
    else if (typeof v === "string") text[key] = v;
    else return null;
  }
  const grade = raw.gradeLabel ?? null;
  if (grade !== null && !GRADES.includes(grade as HighGrade)) return null;
  const semester = raw.semester ?? null;
  if (semester !== null && semester !== 1 && semester !== 2) return null;
  return {
    ...text,
    gradeLabel: grade as HighGrade | null,
    semester: semester as 1 | 2 | null,
  };
}

export function validatePickBody(body: unknown): PickBodyValidation {
  if (!isRecord(body)) return invalid("요청 형식이 올바르지 않아요.");
  const { sessionId, action } = body;
  if (typeof sessionId !== "string" || sessionId === "") {
    return invalid("sessionId 가 필요해요.");
  }
  if (action === "list") return { ok: true, body: { sessionId, action } };
  if (action === "select") {
    const { coreId } = body;
    const supportIds = body.supportIds ?? [];
    if (
      typeof coreId !== "string" ||
      !Array.isArray(supportIds) ||
      supportIds.some((id) => typeof id !== "string")
    ) {
      return invalid("coreId 와 supportIds 형식이 올바르지 않아요.");
    }
    return {
      ok: true,
      body: { sessionId, action, coreId, supportIds: supportIds as string[] },
    };
  }
  if (action === "manual") {
    const input = parseManualInput(body.input);
    if (input === null) return invalid("직접 입력 형식이 올바르지 않아요.");
    const checked = validateManualInput(input);
    if (!checked.ok) return checked;
    return { ok: true, body: { sessionId, action, input } };
  }
  return invalid("action 은 list, select, manual 중 하나여야 해요.");
}

/** 후보 계산에 쓰는 컨텍스트. 연동은 스냅샷이 있고 학생이 켠 때만 적용한다. */
export function pickContextFrom(
  session: SessionRow,
  usedActivityIds: Set<string>,
): Omit<PickContext, "others"> {
  const growth = session.growth_snapshot;
  // 단계 1 이상의 세션은 영역이 항상 있다. 없으면 데이터가 깨진 것이라 추측하지 않고 던진다.
  if (session.area === null) throw new Error("세션에 영역이 없습니다.");
  return {
    area: session.area,
    subject: session.subject,
    activityName: session.activity_name,
    growth,
    growthApplied: growth !== null && session.growth_applied,
    usedActivityIds,
  };
}

/** 선택을 selfeval_session_activities insert 행으로 바꾼다. 분석은 다음 단계가 채운다. */
export function selectionRows(
  sessionId: string,
  userId: string,
  rows: CandidateRow[],
  coreId: string,
  supportIds: string[],
) {
  const byId = new Map(rows.map((r) => [r.activity.id, r]));
  return [
    { id: coreId, role: "core" as const },
    ...supportIds.map((id) => ({ id, role: "support" as const })),
  ].map(({ id, role }) => {
    const fit = byId.get(id)?.fit ?? null;
    return {
      session_id: sessionId,
      profile_id: userId,
      activity_record_id: id,
      role,
      fit_score: fit?.score ?? null,
      fit_reasons: fit ? { signals: fit.signals, reasons: fit.reasons } : null,
      analysis: null,
      analysis_source: null,
    };
  });
}

/** 직접 입력 활동은 계산할 적합도가 없고, 폼 값이 곧 분석이라 학생 출처로 저장한다. */
export function manualSelectionRow(
  sessionId: string,
  userId: string,
  activityRecordId: string,
  analysis: Analysis,
) {
  return {
    session_id: sessionId,
    profile_id: userId,
    activity_record_id: activityRecordId,
    role: "core" as const,
    fit_score: null,
    fit_reasons: null,
    analysis,
    analysis_source: "student" as const,
  };
}

/** 분석이 시작되면(단계 3 이상) 선택을 잠근다. 바꾸려면 파기하고 새로 시작한다(계획서 §2 5). */
export function canChangeSelection(
  session: Pick<SessionRow, "status" | "current_step">,
): boolean {
  return (
    (session.status === "draft" || session.status === "in_progress") &&
    session.current_step <= 2
  );
}

export function nextStepAfterPick(current: SessionStep): SessionStep {
  return current < 2 ? 2 : current;
}
