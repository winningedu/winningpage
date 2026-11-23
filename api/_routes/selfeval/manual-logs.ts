// POST /api/selfeval/manual-logs
// Authorization: Bearer <access_token>
//
// 수기 수행보고 업로드와 확인(명세 No.77, 158~161, 90, 91, 140). body.action 으로 가른다.
//   list          메모 목록.
//   upload        { text } 또는 { file:{mimeType, data(base64)} } 하나. 글자를 읽어 메모로 나눠 저장한다.
//   update        { memoId, writtenAt?, text?, confirmed? } 메모 하나를 고치거나 확인한다.
//   set-included  { memoId, included } 근거 포함 여부.
//   delete        { memoId }
//
//   200 { ok, memos[MemoView] | memo, personNameDetected? }
//   400 INVALID_BODY / UPLOAD_INPUT / TEXT_TOO_LONG / TEXT_REQUIRED / FILE_TYPE / FILE_INVALID
//       / FILE_TOO_LARGE / DATE_REQUIRED / DATE_OUT_OF_YEAR / NO_ACADEMIC_YEAR
//   403 NO_ENTITLEMENT
//   404 SESSION_NOT_FOUND / MEMO_NOT_FOUND
//   409 SESSION_NOT_OPEN
//   422 RECORD_BOOK_DETECTED / NO_TEXT
//   429 UPLOAD_LIMIT
//   502 MODEL_FAILED
//
// 이용 횟수는 쓰지 않는다. 서비스 유형과 관계없이 세션 주인이고 이용권이 있으면 쓴다(명세 No.160).
// 원본 파일은 메모리에서만 다루고 저장하지 않는다. 메모 글은 로그에 남기지 않는다.
// 업로드 호출 횟수는 DB 함수(fn_selfeval_claim_upload)가 세션당 10번까지 센다.

import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { fail, readSelfevalAccess } from "../../_lib/selfeval/access.js";
import { loadSession } from "../../_lib/selfeval/db.js";
import { validateManualLogsBody } from "../../_lib/selfeval/manualLogs.js";
import {
  claimUploadAttempt,
  manualLogsStore,
} from "../../_lib/selfeval/manualLogsDb.js";
import {
  extractFromFile,
  extractFromText,
} from "../../_lib/selfeval/manualLogsModel.js";
import {
  runManualLogs,
  UPLOAD_ATTEMPT_CAP,
} from "../../_lib/selfeval/manualLogsRun.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "수기 메모 처리에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/manual-logs",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;
    const parsed = validateManualLogsBody(req.body);
    if (!parsed.ok) {
      fail(res, 400, parsed.code, parsed.message);
      return;
    }
    const access = await readSelfevalAccess(db, userId);
    if (!access.allowed) {
      fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "이용권이 없어요. 자기평가서는 이용권 1회로 하나를 만들어요.",
        tenantReasonExtra(access.tenantReason),
      );
      return;
    }
    const { body } = parsed;
    const session = await loadSession(db, userId, body.sessionId);
    if (!session) {
      fail(res, 404, "SESSION_NOT_FOUND", "자기평가서 세션을 찾을 수 없어요.");
      return;
    }
    if (session.status !== "draft" && session.status !== "in_progress") {
      fail(res, 409, "SESSION_NOT_OPEN", "이미 닫힌 세션이에요.");
      return;
    }
    const result = await runManualLogs(body, session, {
      store: manualLogsStore(db),
      extractFile: extractFromFile,
      extractText: extractFromText,
      attempts: {
        claim: (sessionId) =>
          claimUploadAttempt(db, userId, sessionId, UPLOAD_ATTEMPT_CAP),
      },
    });
    res.status(result.status).json(result.body);
  },
});

export const config = { runtime: "nodejs", maxDuration: 60 };
