// 분석 확인 화면의 순수 로직(시안 30~34, 명세 No.37~43).
import type {
  Analysis,
  AnalysisField,
  ConflictRow,
  FieldSource,
  SessionActivityView,
} from "@/lib/selfeval/types";

export function coreActivity(
  activities: SessionActivityView[],
): SessionActivityView | null {
  return activities.find((a) => a.role === "core") ?? null;
}

/** 핵심 활동의 분석이 아직 없으면 진입 즉시 분석한다. */
export function needsAnalysisRun(core: SessionActivityView | null): boolean {
  return core !== null && core.analysis === null;
}

/** 서버 값과 달라진 항목만 모은다(저장은 바뀐 항목만 보낸다). */
export function changedEdits(
  saved: Analysis["values"],
  draft: Partial<Record<AnalysisField, string>>,
): Partial<Record<AnalysisField, string>> {
  const out: Partial<Record<AnalysisField, string>> = {};
  for (const [field, value] of Object.entries(draft) as [
    AnalysisField,
    string,
  ][]) {
    if (value !== saved[field]) out[field] = value;
  }
  return out;
}

export function hasUnresolvedConflict(conflicts: ConflictRow[]): boolean {
  return conflicts.some((c) => c.resolved === null);
}

export type FieldNote = { badge: string | null; caption: string | null };

/** 칸 옆에 붙는 배지와 안내. 값이 없는 칸은 생성에서 쓰지 않는다는 뜻이다. */
export function fieldNote(
  field: AnalysisField,
  source: FieldSource,
): FieldNote {
  if (source === "student") return { badge: "학생 입력", caption: null };
  if (source === "empty") {
    return { badge: null, caption: "비움. 생성에서 쓰지 않아요" };
  }
  if (field === "collaboration") {
    return { badge: null, caption: "채점에 반영하지 않아요" };
  }
  return { badge: null, caption: null };
}
