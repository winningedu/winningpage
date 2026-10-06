// POST /api/inquiry/assets
// Authorization: Bearer <access_token>
//
// 심화탐구 출발 자산 저장 엔드포인트(명세 No.31, 36~43, 개발계획 부록 A 2번).
//   요청  { sessionId, items: AssetInput[], planItemId: string|null }
//         AssetInput = { kind:"record", activityRecordId }
//                    | { kind:"interview", answers, gaps }
//                    | { kind:"oneline", text }
//   응답 200 { ok, assets: AssetView[], warnings: string[], planItemId }
//
// 계약:
//   - 기존 자산을 전부 지우고 items 순서(position 0 이 기본 출발 활동)대로 다시 넣는다.
//     빈 items 도 허용한다(활동 0건). 신뢰도는 자산 종류에서 서버가 정한다.
//   - warnings 는 NO_SUBJECT_ASSET, LINK_MATERIAL_LACKING 중 해당하는 코드다.
//   - planItemId 는 본인의 성장설계 심화탐구 과제(program deep, status pending)여야 한다.
//
// 오류: INVALID_BODY 400 (자산 검증 실패면 extra { code, index }), NO_ENTITLEMENT 403,
//       RECORD_NOT_FOUND 404, PLAN_ITEM_NOT_FOUND 404, SESSION_NOT_FOUND 404,
//       SESSION_NOT_OPEN 409, SESSION_LOCKED 409, METHOD_NOT_ALLOWED 405, INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 판단은 _lib/inquiry/requests.ts, assets.ts,
// session.ts, views.ts 의 순수 함수로 검증한다.

import { defineHandler, requireUserId } from "../_lib/handler.js";
import { assetWarnings, validateAssetInputs } from "../_lib/inquiry/assets.js";
import {
  fail,
  hasInquiryAccess,
  NO_ENTITLEMENT_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
} from "../_lib/inquiry/compose.js";
import {
  loadPlanItem,
  loadRecordsByIds,
  loadSession,
  replaceAssets,
  updatePlanItem,
} from "../_lib/inquiry/db.js";
import { toAssetRows, validateAssetsBody } from "../_lib/inquiry/requests.js";
import { gateFor } from "../_lib/inquiry/session.js";
import type { SessionStatus } from "../_lib/inquiry/types.js";
import { toAssetView, toRecordCandidate } from "../_lib/inquiry/views.js";

const GATE_MESSAGES = {
  SESSION_NOT_OPEN: "이미 닫힌 세션이에요.",
  SESSION_LOCKED: "설계 리포트가 만들어진 뒤에는 출발 활동을 바꿀 수 없어요.",
  STEP_ORDER: "이전 단계를 먼저 끝내 주세요.",
} as const;

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "출발 활동을 저장하지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/assets",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const parsed = validateAssetsBody(req.body);
    if (!parsed.ok) {
      fail(res, 400, "INVALID_BODY", parsed.reason);
      return;
    }
    const { sessionId, items, planItemId } = parsed.body;
    if (!(await hasInquiryAccess(db, userId))) {
      fail(res, 403, "NO_ENTITLEMENT", NO_ENTITLEMENT_MESSAGE);
      return;
    }

    const session = await loadSession(db, userId, sessionId);
    if (!session) {
      fail(res, 404, "SESSION_NOT_FOUND", SESSION_NOT_FOUND_MESSAGE);
      return;
    }
    const gate = gateFor(
      {
        selectedTopicId: session.selected_topic_id,
        designReportId: session.design_report_id,
        latestEvaluationId: session.latest_evaluation_id,
        status: session.status as SessionStatus,
      },
      "assets",
    );
    if (!gate.ok) {
      fail(res, 409, gate.code, GATE_MESSAGES[gate.code]);
      return;
    }

    const validation = validateAssetInputs(items);
    if (!validation.ok) {
      fail(res, 400, "INVALID_BODY", "출발 활동 입력이 올바르지 않아요.", {
        code: validation.code,
        index: validation.index,
      });
      return;
    }

    const recordIds = items.flatMap((i) =>
      i.kind === "record" ? [i.activityRecordId] : [],
    );
    const recordRows = await loadRecordsByIds(db, userId, recordIds);
    const usable = new Map(
      recordRows.filter((r) => r.status !== "planned").map((r) => [r.id, r]),
    );
    if (recordIds.some((id) => !usable.has(id))) {
      fail(res, 404, "RECORD_NOT_FOUND", "활동 기록을 찾을 수 없어요.");
      return;
    }

    if (planItemId !== null) {
      const item = await loadPlanItem(db, userId, planItemId);
      if (item?.program !== "deep" || item.status !== "pending") {
        fail(res, 404, "PLAN_ITEM_NOT_FOUND", "과제를 찾을 수 없어요.");
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const saved = await replaceAssets(
      db,
      userId,
      sessionId,
      toAssetRows(items),
    );
    await updatePlanItem(db, userId, sessionId, planItemId, nowIso);

    const topicById = new Map([...usable.values()].map((r) => [r.id, r.topic]));
    res.status(200).json({
      ok: true,
      assets: saved.map((row) => toAssetView(row, topicById)),
      warnings: assetWarnings(
        items,
        [...usable.values()].map(toRecordCandidate),
      ),
      planItemId,
    });
  },
});

export const config = { runtime: "nodejs" };
