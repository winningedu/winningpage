// POST /api/inquiry/submission
// Authorization: Bearer <access_token>
//
// 심화탐구 보고서 작성본 저장 엔드포인트(명세 No.71, 72, 77, 78, 129, 개발계획 부록 A 3번).
//   요청  { sessionId, sections: SubmissionSections }   sections 키는 I~VIII, 빠진 절은 빈 문자열
//   응답 200 { ok, submission: SubmissionView }
//
// 계약:
//   - 설계 리포트가 있는 열린 세션에서만 저장한다. 각 절은 20000자에서 자른다.
//   - 초안(is_draft)이 있으면 덮어쓰고 없으면 revision = 최대값 + 1 로 새 초안을 만든다.
//   - 글자 수(char_counts)는 서버가 다시 센다. 클라이언트가 보낸 값은 받지 않는다.
//
// 오류: INVALID_BODY 400, NO_ENTITLEMENT 403, SESSION_NOT_FOUND 404,
//       SESSION_NOT_OPEN 409, STEP_ORDER 409, METHOD_NOT_ALLOWED 405, INTERNAL 500.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 판단은 _lib/inquiry/requests.ts, submission.ts,
// session.ts, views.ts 의 순수 함수로 검증한다.

import { defineHandler, requireUserId } from "../_lib/handler.js";
import {
  fail,
  hasInquiryAccess,
  NO_ENTITLEMENT_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
} from "../_lib/inquiry/compose.js";
import {
  loadSession,
  touchSession,
  upsertDraftSubmission,
} from "../_lib/inquiry/db.js";
import { validateSubmissionBody } from "../_lib/inquiry/requests.js";
import { gateFor } from "../_lib/inquiry/session.js";
import { countChars } from "../_lib/inquiry/submission.js";
import type { SessionStatus } from "../_lib/inquiry/types.js";
import { toSubmissionView } from "../_lib/inquiry/views.js";

const GATE_MESSAGES = {
  SESSION_NOT_OPEN: "이미 닫힌 세션이에요.",
  SESSION_LOCKED: "이미 확정된 세션이에요.",
  STEP_ORDER: "설계 리포트를 먼저 만들어 주세요.",
} as const;

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "작성본을 저장하지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "inquiry/submission",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const parsed = validateSubmissionBody(req.body);
    if (!parsed.ok) {
      fail(res, 400, "INVALID_BODY", parsed.reason);
      return;
    }
    const { sessionId, sections } = parsed.body;
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
      "submission",
    );
    if (!gate.ok) {
      fail(res, 409, gate.code, GATE_MESSAGES[gate.code]);
      return;
    }

    const row = await upsertDraftSubmission(
      db,
      userId,
      sessionId,
      sections,
      countChars(sections),
    );
    await touchSession(db, userId, sessionId, new Date().toISOString());
    res.status(200).json({ ok: true, submission: toSubmissionView(row) });
  },
});

export const config = { runtime: "nodejs" };
