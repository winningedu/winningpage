// selfeval_report_views 읽기와 쓰기(명세 No.133, 173). 세션당 1행이고 service_role 만 쓴다.
// 동시 요청은 built_at 조건부 갱신으로 가린다(확인 뒤 쓰기 경쟁을 두지 않는다).

import type { ReportPayload } from "../../../../src/lib/selfeval/reportTypes.js";
import { type Db, must } from "../../growth/intake/collectDb.js";
import type { ReportStore, StoredReport } from "./run.js";

const PG_UNIQUE_VIOLATION = "23505";
const COLUMNS =
  "session_id, final_revision, payload, tag_map, status, attempts, built_at";

type ViewRow = {
  session_id: string;
  final_revision: number;
  payload: unknown;
  tag_map: unknown;
  status: "ready" | "failed";
  attempts: number;
  built_at: string;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function toStored(row: ViewRow): StoredReport {
  return {
    sessionId: row.session_id,
    finalRevision: row.final_revision,
    // 자리표시 행의 빈 객체는 payload 없음으로 읽는다.
    payload:
      isRecord(row.payload) && row.payload.version === 1
        ? (row.payload as unknown as ReportPayload)
        : null,
    tagMap: isRecord(row.tag_map)
      ? (row.tag_map as Record<string, string>)
      : {},
    status: row.status,
    attempts: row.attempts,
    builtAt: row.built_at,
  };
}

const placeholder = (
  sessionId: string,
  finalRevision: number,
  claimedAt: string,
) => ({
  session_id: sessionId,
  final_revision: finalRevision,
  payload: {},
  tag_map: {},
  status: "failed",
  attempts: 0,
  built_at: claimedAt,
});

export function createReportStore(db: Db, sessionId: string): ReportStore {
  return {
    async read() {
      const row = must(
        await db
          .from("selfeval_report_views")
          .select(COLUMNS)
          .eq("session_id", sessionId)
          .maybeSingle(),
        "selfeval_report_views 조회 실패",
      ) as ViewRow | null;
      return row === null ? null : toStored(row);
    },

    async claim({ finalRevision, existing, claimedAt }) {
      if (existing === null) {
        const { error } = await db
          .from("selfeval_report_views")
          .insert(placeholder(sessionId, finalRevision, claimedAt));
        if (error?.code === PG_UNIQUE_VIOLATION) return false;
        if (error) {
          throw new Error(`selfeval_report_views 선점 실패: ${error.message}`);
        }
        return true;
      }
      // 같은 리비전은 저장본을 지키고 built_at 만 바꾼다. 다른 리비전은 자리표시로 바꾼다.
      const patch =
        existing.finalRevision === finalRevision
          ? { built_at: claimedAt }
          : (({ session_id: _id, ...rest }) => rest)(
              placeholder(sessionId, finalRevision, claimedAt),
            );
      const rows = must(
        await db
          .from("selfeval_report_views")
          .update(patch)
          .eq("session_id", sessionId)
          .eq("built_at", existing.builtAt)
          .select("session_id"),
        "selfeval_report_views 선점 실패",
      ) as unknown[];
      return rows.length > 0;
    },

    async finish(claimedAt, row) {
      const rows = must(
        await db
          .from("selfeval_report_views")
          .update({
            final_revision: row.finalRevision,
            payload: row.payload ?? {},
            tag_map: row.tagMap,
            status: row.status,
            attempts: row.attempts,
            built_at: row.builtAt,
          })
          .eq("session_id", sessionId)
          .eq("built_at", claimedAt)
          .select("session_id"),
        "selfeval_report_views 저장 실패",
      ) as unknown[];
      return rows.length > 0;
    },
  };
}
