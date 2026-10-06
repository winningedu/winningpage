// analyze, write, verify, finalize 가 함께 쓰는 순수 보조.

import { type Db, updateSession } from "../db.js";
import type { ReportRow, SessionRow } from "../rows.js";
import type {
  ActivityRecordLike,
  Analysis,
  CareerInfo,
  GrowthSnapshot,
} from "../types.js";
import type { ReportView, SessionActivityWithRecord } from "../view.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 핵심 활동 하나와 보조 활동들. 활동 선택이 끝난 세션(단계 2 이상)에는 핵심이 반드시 있다. */
export function splitActivities(rows: SessionActivityWithRecord[]): {
  core: SessionActivityWithRecord;
  supports: SessionActivityWithRecord[];
} {
  const core = rows.find((r) => r.role === "core");
  if (core === undefined) {
    throw new Error("핵심 활동이 없는 세션입니다.");
  }
  return { core, supports: rows.filter((r) => r.role === "support") };
}

/** 저장된 분석 jsonb 를 Analysis 로 읽는다. 단계가 분석 이후인데 모양이 틀리면 데이터 오류라 던진다. */
export function readAnalysis(raw: unknown): Analysis {
  if (
    !isRecord(raw) ||
    !isRecord(raw.values) ||
    !isRecord(raw.sources) ||
    !Array.isArray(raw.conflicts)
  ) {
    throw new Error("저장된 분석 모양이 올바르지 않습니다.");
  }
  return raw as unknown as Analysis;
}

/** 프롬프트에 쓰는 활동 이름. 기록 제목이 비면 세션의 활동명, 과목 순으로 쓴다. */
export function activityNameOf(
  record: Pick<ActivityRecordLike, "topic">,
  session: Pick<SessionRow, "activity_name" | "subject">,
): string {
  return (
    record.topic?.trim() ||
    session.activity_name?.trim() ||
    session.subject?.trim() ||
    ""
  );
}

export function careerOf(session: Pick<SessionRow, "career">): CareerInfo {
  const c = session.career as Partial<CareerInfo>;
  return {
    career: c.career ?? null,
    department: c.department ?? null,
    universities: c.universities ?? [],
  };
}

/** 성장설계 연동은 학생이 켰고 스냅샷이 있을 때만 적용한다. */
export function activeGrowth(
  session: Pick<SessionRow, "growth_applied" | "growth_snapshot">,
): GrowthSnapshot | null {
  return session.growth_applied ? session.growth_snapshot : null;
}

/** 응답으로 내보내는 리포트 모양. */
export function reportOut(view: ReportView) {
  return {
    id: view.id,
    revision: view.revision,
    sections: view.sections,
    charCount: view.charCount,
  };
}

/** 방금 저장한 리포트 행을 응답 모양으로 바꾼다. */
export function reportRowOut(row: ReportRow) {
  return {
    id: row.id,
    revision: row.revision,
    sections: row.sections,
    charCount: row.char_count,
  };
}

/** 학생이 직접 고친 저장도 마지막 활동이다. 편집만 이어가는 세션이 90일 만료에 걸리지 않게 한다(명세 No.19). */
export async function touchSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<void> {
  await updateSession(db, userId, sessionId, {
    last_activity_at: new Date().toISOString(),
  });
}
