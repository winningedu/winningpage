// 활동 선택 API(pick-records)의 컨텍스트와 행 조립(명세 No.26~36, 계획서 §2 5). 요청 형식 검증은 shared/selfeval/pick.ts 가 한다.
// 순수 모듈이다. DB 접근은 db.ts 와 핸들러가 한다.

import type { PickContext } from "./pick.js";
import type { SessionRow } from "./rows.js";
import type { Analysis, CandidateRow, SessionStep } from "./types.js";

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

/** 직접 입력 활동은 분석 산출물이 이미 있어 STEP4 분석 확인으로 바로 간다(명세 No.26). */
export function nextStepAfterManualPick(current: SessionStep): SessionStep {
  return current < 3 ? 3 : current;
}
