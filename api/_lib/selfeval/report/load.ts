// 리포트 입력 읽기(명세 No.133~173). service_role 로 읽으므로 모든 쿼리에 profile_id 나 세션 id 조건을 건다.
// DB 에 묶인 얇은 계층이라 단위 테스트는 두지 않고, 변환 규칙은 rows.ts 와 stages.ts 에서 검증한다.

import type { ReportStepKey } from "../../../../src/lib/selfeval/reportTypes.js";
import { type Db, must } from "../../growth/intake/collectDb.js";
import type { SessionRow } from "../rows.js";
import type { Improvement } from "../types.js";
import type {
  BuildInput,
  ReportMemo,
  StageInputs,
  StageSource,
} from "./inputs.js";
import {
  ACTIVITY_COLUMNS,
  type ActivityRow,
  keepRecord,
  LINK_COLUMNS,
  type LinkRow,
  memoInWindow,
  toReportLink,
  toReportRecord,
} from "./rows.js";
import type { LoadedInput } from "./run.js";
import { diagnosisSource, goalSource, growthSource } from "./stages.js";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

async function countOf(
  db: Db,
  table: string,
  userId: string,
  status?: string,
): Promise<boolean> {
  let q = db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("profile_id", userId);
  if (status !== undefined) q = q.eq("status", status);
  const { count, error } = await q;
  if (error) throw new Error(`${table} 건수 조회 실패: ${error.message}`);
  return (count ?? 0) > 0;
}

/** 표지 6단계(No.136): 서비스별 완료 기록 1건 이상. 읽기에 실패한 단계는 채우지 않는다. */
async function loadSteps(
  db: Db,
  userId: string,
): Promise<Record<ReportStepKey, boolean>> {
  const read = async (fn: () => Promise<boolean>) => {
    try {
      return await fn();
    } catch (e) {
      console.error("selfeval 리포트 단계 판정 실패(무시):", e);
      return false;
    }
  };
  const [diagnosis, goal, growth, performance, inquiry] = await Promise.all([
    read(() => countOf(db, "diagnosis_reports", userId)),
    read(() => countOf(db, "goal_students", userId)),
    read(() => countOf(db, "growth_reports", userId, "completed")),
    read(() => countOf(db, "performance_sessions", userId, "completed")),
    read(() => countOf(db, "inquiry_sessions", userId, "completed")),
  ]);
  return { diagnosis, goal, growth, performance, inquiry, selfeval: true };
}

async function loadStages(
  db: Db,
  userId: string,
  session: SessionRow,
  tz: string,
): Promise<StageInputs> {
  const guard = async <T>(
    read: () => Promise<StageSource<T>>,
  ): Promise<StageSource<T>> => {
    try {
      return await read();
    } catch (e) {
      console.error("selfeval 리포트 단계 카드 읽기 실패:", e);
      return { state: "error" as const };
    }
  };
  const [diagnosis, goal] = await Promise.all([
    guard(async () =>
      diagnosisSource(
        must(
          await db
            .from("diagnosis_reports")
            .select("diagnosed_at, payload")
            .eq("profile_id", userId)
            .order("diagnosed_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          "diagnosis_reports 조회 실패",
        ) as { diagnosed_at: string; payload: unknown } | null,
        tz,
      ),
    ),
    guard(async () =>
      goalSource(
        must(
          await db
            .from("goal_students")
            .select(
              "ideal_university, ideal_department, min_university, min_department",
            )
            .eq("profile_id", userId)
            .maybeSingle(),
          "goal_students 조회 실패",
        ) as Parameters<typeof goalSource>[0],
      ),
    ),
  ]);
  const growth = await guard(async () =>
    growthSource(session.growth_snapshot, session.grade_label),
  );
  return { diagnosis, goal, growth };
}

/** 검증 리포트의 고치면 좋은 곳 상위 1건 문장(No.169 ⑤). */
async function loadTopImprovement(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<string | null> {
  const row = must(
    await db
      .from("selfeval_reports")
      .select("sections")
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .eq("report_type", "verification")
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "selfeval_reports 검증 조회 실패",
  ) as { sections: unknown } | null;
  if (row === null || !isRecord(row.sections)) return null;
  const list = row.sections.improvements;
  const first = Array.isArray(list)
    ? (list[0] as Improvement | undefined)
    : undefined;
  return typeof first?.message === "string" && first.message.trim() !== ""
    ? first.message
    : null;
}

export async function loadReportInput(
  db: Db,
  userId: string,
  session: SessionRow,
  tz: string,
): Promise<LoadedInput | null> {
  const final = must(
    await db
      .from("selfeval_reports")
      .select("revision, sections, char_count, created_at")
      .eq("session_id", session.id)
      .eq("profile_id", userId)
      .eq("report_type", "final")
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "selfeval_reports 최종본 조회 실패",
  ) as {
    revision: number;
    sections: unknown;
    char_count: { withSpace: number; withoutSpace: number } | null;
    created_at: string;
  } | null;
  if (final === null) return null;
  if (session.academic_year === null || final.char_count === null) {
    throw new Error("리포트에 필요한 학년도나 글자 수가 없습니다.");
  }
  const year = session.academic_year;

  const [
    selected,
    activityRows,
    memoRows,
    linkRows,
    completed,
    profile,
    steps,
    stages,
    topImprovement,
  ] = await Promise.all([
    must(
      await db
        .from("selfeval_session_activities")
        .select("activity_record_id, role")
        .eq("session_id", session.id)
        .eq("profile_id", userId),
      "selfeval_session_activities 조회 실패",
    ) as { activity_record_id: string; role: "core" | "support" }[],
    must(
      await db
        .from("activity_records")
        .select(ACTIVITY_COLUMNS)
        .eq("profile_id", userId)
        .in("source_program", ["performance", "deep", "manual"]),
      "activity_records 조회 실패",
    ) as ActivityRow[],
    must(
      await db
        .from("selfeval_manual_logs")
        .select("id, written_at, text")
        .eq("session_id", session.id)
        .eq("confirmed", true)
        .eq("included", true),
      "selfeval_manual_logs 조회 실패",
    ) as { id: string; written_at: string | null; text: string }[],
    must(
      await db
        .from("selfeval_record_links")
        .select(LINK_COLUMNS)
        .eq("session_id", session.id),
      "selfeval_record_links 조회 실패",
    ) as LinkRow[],
    must(
      await db
        .from("selfeval_sessions")
        .select("subject")
        .eq("profile_id", userId)
        .eq("status", "completed")
        .eq("area", "subject"),
      "selfeval_sessions 완료 과목 조회 실패",
    ) as { subject: string | null }[],
    must(
      await db
        .from("student_profiles")
        .select("grade")
        .eq("profile_id", userId)
        .maybeSingle(),
      "student_profiles 조회 실패",
    ) as { grade: string | null } | null,
    loadSteps(db, userId),
    loadStages(db, userId, session, tz),
    loadTopImprovement(db, userId, session.id),
  ]);

  const roleOf = new Map(selected.map((s) => [s.activity_record_id, s.role]));
  // 고른 기록은 기간 밖이어도 본문 근거가 될 수 있어 함께 읽는다.
  const records = activityRows
    .filter((r) => keepRecord(r, year, tz) || roleOf.has(r.id))
    .map((r) => toReportRecord(r, roleOf.get(r.id) ?? null));
  const memos: ReportMemo[] = memoRows.flatMap((m) =>
    memoInWindow(m.written_at, year) && m.written_at !== null
      ? [{ id: m.id, writtenAt: m.written_at.slice(0, 10), text: m.text }]
      : [],
  );

  const input: Omit<BuildInput, "tagMap"> = {
    timeZone: tz,
    session: {
      academicYear: year,
      area: session.area,
      subject: session.subject,
      activityName: session.activity_name,
      gradeLabel: session.grade_label,
      targetChars: session.target_chars,
      targetCharsMode: session.target_chars_mode,
    },
    bodySections: final.sections,
    charCount: final.char_count,
    savedAt: session.completed_at ?? final.created_at,
    profileGrade: session.grade_label ?? profile?.grade ?? null,
    records,
    memos,
    links: linkRows.flatMap((l) => toReportLink(l) ?? []),
    completedSubjects: [
      ...new Set(
        completed.flatMap((c) => (c.subject === null ? [] : [c.subject])),
      ),
    ],
    steps,
    stages,
    topImprovement,
  };
  return { input, finalRevision: final.revision };
}
