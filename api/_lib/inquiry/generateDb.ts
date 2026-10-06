// 심화탐구 생성 단계(추천, 설계, 평가)가 쓰는 RPC 래퍼와 결과 저장.
// 판단은 generate.ts, recommendFlow.ts, designFlow.ts 의 순수 함수에 있고 여기엔 두지 않는다.
// RPC 는 마이그레이션 20261006111506(차감, 되돌림), 20261006111507(선점, 종료, 종결)의 시그니처를 따른다.

import { type Db, must, mustHave } from "./db.js";
import { type ClaimResult, interpretClaim } from "./session.js";
import type { ReportRow, TopicRow } from "./views.js";
import type {
  DesignReport,
  Fit,
  GenerationMode,
  LinkageType,
  LinkKind,
  TopicDetail,
  ValidationIssue,
} from "./types.js";

/** inquiry_topics 에 넣을 행. link_kind, linkage_type, fit 은 서버 계산값이다(No.124). */
export type NewTopicRow = {
  session_id: string;
  profile_id: string;
  round: number;
  idx: number;
  link_kind: LinkKind;
  linkage_type: LinkageType;
  fit: Fit;
  detail: TopicDetail;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** fn_inquiry_claim_generation. 반환 jsonb 는 session.ts interpretClaim 이 해석한다. */
export async function claimGeneration(
  db: Db,
  sessionId: string,
  userId: string,
  mode: GenerationMode,
): Promise<ClaimResult> {
  return interpretClaim(
    must(
      await db.rpc("fn_inquiry_claim_generation", {
        p_session_id: sessionId,
        p_profile_id: userId,
        p_mode: mode,
      }),
      "fn_inquiry_claim_generation 실패",
    ),
  );
}

/** 선점한 mode 를 닫는다. 다른 요청이 가져갔거나 이미 닫혔으면 false. */
export async function finishGeneration(
  db: Db,
  sessionId: string,
  userId: string,
  mode: GenerationMode,
  ok: boolean,
  issues: ValidationIssue[],
  extraAttempts: number,
): Promise<boolean> {
  const result = must(
    await db.rpc("fn_inquiry_finish_generation", {
      p_session_id: sessionId,
      p_profile_id: userId,
      p_mode: mode,
      p_ok: ok,
      p_issues: issues,
      p_extra_attempts: extraAttempts,
    }),
    "fn_inquiry_finish_generation 실패",
  );
  return result === true;
}

/**
 * 세션을 archived 로 닫고 terminal 을 남긴다. 되돌릴지는 RPC 가 잠금 안에서 판단한
 * needsReverse 만 믿는다. ok 가 아니면(locked, not_found) 되돌릴 것이 없다.
 */
export async function terminateSession(
  db: Db,
  sessionId: string,
  userId: string,
  mode: GenerationMode,
  reason: string,
): Promise<{ needsReverse: boolean }> {
  const raw = mustHave(
    must(
      await db.rpc("fn_inquiry_terminate_session", {
        p_session_id: sessionId,
        p_profile_id: userId,
        p_mode: mode,
        p_reason: reason,
      }),
      "fn_inquiry_terminate_session 실패",
    ),
    "fn_inquiry_terminate_session",
  );
  return {
    needsReverse: isRecord(raw) && raw.ok === true && raw.needsReverse === true,
  };
}

/** consume_inquiry_credit. status 어휘는 마이그레이션 comment 참고(charged, already_charged, 거절류). */
export async function consumeCredit(
  db: Db,
  sessionId: string,
  userId: string,
): Promise<{ status: string; charged: boolean }> {
  const raw = mustHave(
    must(
      await db.rpc("consume_inquiry_credit", {
        p_session_id: sessionId,
        p_profile_id: userId,
      }),
      "consume_inquiry_credit 실패",
    ),
    "consume_inquiry_credit",
  );
  const rec = isRecord(raw) ? raw : {};
  return {
    status: typeof rec.status === "string" ? rec.status : "unknown",
    charged: rec.charged === true,
  };
}

/** reverse_inquiry_credit. */
export async function reverseCredit(
  db: Db,
  sessionId: string,
  userId: string,
): Promise<{ status: string; reversed: boolean }> {
  const raw = mustHave(
    must(
      await db.rpc("reverse_inquiry_credit", {
        p_session_id: sessionId,
        p_profile_id: userId,
      }),
      "reverse_inquiry_credit 실패",
    ),
    "reverse_inquiry_credit",
  );
  const rec = isRecord(raw) ? raw : {};
  return {
    status: typeof rec.status === "string" ? rec.status : "unknown",
    reversed: rec.reversed === true,
  };
}

// ── 결과 저장 ───────────────────────────────────────────────────────────────
// service_role 로 쓰므로 모든 쿼리에 profile_id 를 건다. 여러 문장으로 이루어진 저장은
// 중간에 실패하면 앞 단계를 되돌려(best-effort) 다음 시도가 유니크에 걸리지 않게 한다.

const TOPIC_COLUMNS =
  "id, round, idx, link_kind, linkage_type, fit, selected, detail";
const REPORT_COLUMNS =
  "id, report_type, topic_id, submission_id, sections, score, label, created_at";

/** 리포트 재현용 프롬프트 버전. 프롬프트 문구를 바꾸면 올린다. */
export const INQUIRY_PROMPT_VERSION = "inquiry-v1";

/** inquiry_reports(design) 에 넣을 행. */
export type NewDesignReportRow = {
  session_id: string;
  profile_id: string;
  report_type: "design";
  topic_id: string;
  sections: DesignReport;
  model: string;
  prompt_version: string;
};

/** 세션의 모든 라운드 주제(제외 목록용). round, idx 순. */
export async function loadAllTopics(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<TopicRow[]> {
  return must(
    await db
      .from("inquiry_topics")
      .select(TOPIC_COLUMNS)
      .eq("session_id", sessionId)
      .eq("profile_id", userId)
      .order("round", { ascending: true })
      .order("idx", { ascending: true }),
    "inquiry_topics 조회 실패",
  ) as TopicRow[];
}

export async function insertTopics(
  db: Db,
  rows: NewTopicRow[],
): Promise<TopicRow[]> {
  return must(
    await db
      .from("inquiry_topics")
      .insert(rows)
      .select(TOPIC_COLUMNS)
      .order("idx", { ascending: true }),
    "inquiry_topics 저장 실패",
  ) as TopicRow[];
}

export async function insertDesignReport(
  db: Db,
  row: NewDesignReportRow,
): Promise<ReportRow> {
  return mustHave(
    must(
      await db
        .from("inquiry_reports")
        .insert(row)
        .select(REPORT_COLUMNS)
        .single(),
      "inquiry_reports 저장 실패",
    ),
    "inquiry_reports 저장",
  ) as ReportRow;
}

/** 추천 결과 저장: 주제 3개 insert 뒤 세션의 라운드 수와 단계를 갱신한다. 갱신 실패 시 주제를 지운다. */
export async function saveTopicRound(
  db: Db,
  userId: string,
  sessionId: string,
  round: number,
  rows: NewTopicRow[],
  nowIso: string,
): Promise<TopicRow[]> {
  const topics = await insertTopics(db, rows);
  try {
    must(
      await db
        .from("inquiry_sessions")
        .update({
          topic_round_count: round,
          current_step: 2,
          last_activity_at: nowIso,
        })
        .eq("id", sessionId)
        .eq("profile_id", userId),
      "inquiry_sessions 라운드 갱신 실패",
    );
  } catch (e) {
    try {
      await db
        .from("inquiry_topics")
        .delete()
        .eq("session_id", sessionId)
        .eq("profile_id", userId)
        .eq("round", round);
    } catch (inner) {
      console.error("inquiry 주제 되돌리기 실패(무시):", inner);
    }
    throw e;
  }
  return topics;
}

/** 첫 추천 차감에 성공한 draft 세션을 in_progress 로 올린다. 이미 올라간 세션은 건드리지 않는다. */
export async function markSessionInProgress(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<void> {
  must(
    await db
      .from("inquiry_sessions")
      .update({ status: "in_progress" })
      .eq("id", sessionId)
      .eq("profile_id", userId)
      .eq("status", "draft"),
    "inquiry_sessions 상태 갱신 실패",
  );
}

/**
 * 설계 결과 저장: 리포트 insert, 주제 선택 표시, 세션 포인터와 단계 갱신.
 * 뒤 단계가 실패하면 리포트를 지우고 선택을 풀어 같은 주제로 다시 시도할 수 있게 한다.
 */
export async function saveDesign(
  db: Db,
  userId: string,
  sessionId: string,
  topicId: string,
  row: NewDesignReportRow,
  nowIso: string,
): Promise<ReportRow> {
  const report = await insertDesignReport(db, row);
  try {
    must(
      await db
        .from("inquiry_topics")
        .update({ selected: true })
        .eq("id", topicId)
        .eq("profile_id", userId),
      "inquiry_topics 선택 갱신 실패",
    );
    must(
      await db
        .from("inquiry_sessions")
        .update({
          selected_topic_id: topicId,
          design_report_id: report.id,
          current_step: 3,
          last_activity_at: nowIso,
        })
        .eq("id", sessionId)
        .eq("profile_id", userId),
      "inquiry_sessions 설계 갱신 실패",
    );
  } catch (e) {
    try {
      await db
        .from("inquiry_reports")
        .delete()
        .eq("id", report.id)
        .eq("profile_id", userId);
      await db
        .from("inquiry_topics")
        .update({ selected: false })
        .eq("id", topicId)
        .eq("profile_id", userId);
    } catch (inner) {
      console.error("inquiry 설계 되돌리기 실패(무시):", inner);
    }
    throw e;
  }
  return report;
}
