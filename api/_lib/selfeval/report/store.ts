// selfeval_report_views 읽기와 쓰기(명세 No.133, 173). 세션당 1행이고 service_role 만 쓴다.
// 동시 요청은 claimed_at 조건부 갱신으로 가린다(확인 뒤 쓰기 경쟁을 두지 않는다).
// 선점하면 claimed_at 에 시각을 넣고, 신선한 선점이 있으면 다른 요청은 잡지 못한다.
// 단계 예산보다 오래된 선점은 중단된 요청으로 보고 다시 잡을 수 있다. 끝내면 claimed_at 을 비운다.

import { reportPayloadSchema } from "../../../../shared/selfeval/report.js";
import { must } from "../../db/must.js";
import type { Db } from "../../growth/intake/collectDb.js";
import { STEP_BUDGET_MS } from "../types.js";
import type { ReportStore, StoredReport } from "./run.js";

const PG_UNIQUE_VIOLATION = "23505";
const COLUMNS =
  "session_id, final_revision, payload, tag_map, status, attempts, built_at, claimed_at";

type ViewRow = {
  session_id: string;
  final_revision: number;
  payload: unknown;
  tag_map: unknown;
  status: "ready" | "failed";
  attempts: number;
  built_at: string;
  claimed_at: string | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 신선한 선점이 있으면 만드는 중이다(자리표시 행의 failed 로 읽지 않는다). */
const isBuilding = (claimedAt: string | null, nowMs: number) =>
  claimedAt !== null && Date.parse(claimedAt) > nowMs - STEP_BUDGET_MS;

/**
 * 저장된 payload 를 계약 스키마로 읽는다. 자리표시 행의 빈 객체는 payload 없음이다.
 * 계약 모양이 아닌 payload 는 화면에 보내지 않고 없는 것으로 읽어, 같은 리비전이어도 다시 만들 수 있게 한다.
 */
function readPayload(raw: unknown) {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const parsed = reportPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "selfeval 리포트 payload 가 계약 모양이 아니다:",
      parsed.error.issues.map((i) => i.path.join(".")),
    );
    return null;
  }
  return parsed.data;
}

export function toStored(row: ViewRow, nowMs = Date.now()): StoredReport {
  return {
    sessionId: row.session_id,
    finalRevision: row.final_revision,
    payload: readPayload(row.payload),
    tagMap: isRecord(row.tag_map)
      ? (row.tag_map as Record<string, string>)
      : {},
    status: isBuilding(row.claimed_at, nowMs) ? "building" : row.status,
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
  claimed_at: claimedAt,
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
      // 같은 리비전은 저장본을 지키고 claimed_at 만 바꾼다. 다른 리비전은 자리표시로 바꾼다.
      const patch =
        existing.finalRevision === finalRevision
          ? { claimed_at: claimedAt }
          : (({ session_id: _id, ...rest }) => rest)(
              placeholder(sessionId, finalRevision, claimedAt),
            );
      const rows = must(
        await db
          .from("selfeval_report_views")
          .update(patch)
          .eq("session_id", sessionId)
          .eq("built_at", existing.builtAt)
          .or(
            `claimed_at.is.null,claimed_at.lt.${new Date(
              Date.parse(claimedAt) - STEP_BUDGET_MS,
            ).toISOString()}`,
          )
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
            claimed_at: null,
          })
          .eq("session_id", sessionId)
          .eq("claimed_at", claimedAt)
          .select("session_id"),
        "selfeval_report_views 저장 실패",
      ) as unknown[];
      return rows.length > 0;
    },
  };
}
