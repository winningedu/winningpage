// 심화탐구 핸들러 4종이 같이 쓰는 DB 묶음 조회와 응답 보조. 핸들러와 같은 이유로 단위 테스트하지 않고,
// 판단은 bootstrap, views, assets 의 순수 함수에 둔다.

import type { VercelResponse } from "@vercel/node";
import { sendError } from "../httpResponse.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  type QuotaSnapshot,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../serviceAccess.js";
import {
  asGradeLabel,
  buildHandoffForSession,
  type HandoffView,
} from "./bootstrap.js";
import {
  type Db,
  loadAssets,
  loadDraftSubmission,
  loadGrowthReports,
  loadLatestRoundTopics,
  loadPendingDeepPlanItems,
  loadRecordsByIds,
} from "./db.js";
import { pickLatestCompleted } from "./growthHandoff.js";
import {
  type AssetView,
  type SessionRow,
  type SessionView,
  type SubmissionRow,
  type TopicView,
  toAssetView,
  toSessionView,
  toTopicView,
} from "./views.js";

export function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  sendError(res, "coded", status, message, code, { ok: false, ...extra });
}

export const NO_ENTITLEMENT_MESSAGE =
  "이용권이 없어요. 심화탐구는 이용권 1회로 세션 하나를 진행해요.";
export const SESSION_NOT_FOUND_MESSAGE = "세션을 찾을 수 없어요.";

function inquiryConfig() {
  const config = SERVICE_CONFIGS.inquiry;
  if (!config) throw new Error("SERVICE_CONFIGS.inquiry 가 없습니다.");
  return config;
}

export async function hasInquiryAccess(
  db: Db,
  userId: string,
): Promise<boolean> {
  const { allowed } = await hasPaidServiceAccess(db, userId, inquiryConfig());
  return allowed;
}

/** 회차 정보는 안내용이라 못 읽어도 진입을 막지 않는다(growth/survey 와 같은 취급). */
export async function readInquiryQuota(
  db: Db,
  userId: string,
): Promise<QuotaSnapshot> {
  let quota = await readQuotaSnapshot(db, userId, null);
  try {
    quota = await readQuotaSnapshot(
      db,
      userId,
      await findProgramAccessRow(db, userId, inquiryConfig()),
    );
  } catch (quotaError) {
    console.error("inquiry quota 조회 실패(무시):", quotaError);
  }
  return quota;
}

/** 최신 완료 성장설계 회차의 수신 8종. 완료 회차나 학년이 없으면 null. */
export async function loadHandoffView(
  db: Db,
  userId: string,
  input: { grade: string | null; subject: string; nowIso: string },
): Promise<HandoffView | null> {
  const reports = await loadGrowthReports(db, userId);
  const latest = pickLatestCompleted(reports);
  if (!latest) return null;
  return buildHandoffForSession({
    reports,
    planItems: await loadPendingDeepPlanItems(db, userId, latest.id),
    sessionGrade: asGradeLabel(input.grade),
    subject: input.subject,
    nowIso: input.nowIso,
  });
}

export async function loadAssetViews(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<AssetView[]> {
  const rows = await loadAssets(db, userId, sessionId);
  const recordIds = rows.flatMap((r) =>
    r.activity_record_id ? [r.activity_record_id] : [],
  );
  const records = await loadRecordsByIds(db, userId, recordIds);
  const topicById = new Map(records.map((r) => [r.id, r.topic]));
  return rows.map((r) => toAssetView(r, topicById));
}

export type SessionParts = {
  session: SessionView;
  assets: AssetView[];
  topics: TopicView[];
  draft: SubmissionRow | null;
};

/** 세션 행 하나에 딸린 자산, 최신 라운드 주제, 작성본 초안을 읽어 뷰로 묶는다. */
export async function loadSessionParts(
  db: Db,
  userId: string,
  row: SessionRow,
): Promise<SessionParts> {
  const [assets, topicRows, draft] = await Promise.all([
    loadAssetViews(db, userId, row.id),
    loadLatestRoundTopics(db, userId, row.id),
    loadDraftSubmission(db, userId, row.id),
  ]);
  return {
    session: toSessionView(row, {
      hasTopics: topicRows.length > 0,
      hasSubmissionDraft: draft !== null,
    }),
    assets,
    topics: topicRows.map(toTopicView),
    draft,
  };
}
