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
//   404 SESSION_NOT_FOUND / MEMO_NOT_FOUND
//   409 SESSION_NOT_OPEN
//   422 RECORD_BOOK_DETECTED / NO_TEXT
//   429 UPLOAD_LIMIT
//   502 MODEL_FAILED
//
// 이용 횟수는 쓰지 않는다. 서비스 유형과 관계없이 세션 주인이면 쓴다(명세 No.160).
// 원본 파일은 메모리에서만 다루고 저장하지 않는다. 메모 글은 로그에 남기지 않는다.
// 업로드 호출 횟수는 인스턴스 메모리로 센다(세션당 10번). 서버리스 인스턴스가 바뀌면 다시 센다.

import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { fail } from "../../_lib/selfeval/access.js";
import { loadSession } from "../../_lib/selfeval/db.js";
import { validateManualLogsBody } from "../../_lib/selfeval/manualLogs.js";
import { manualLogsStore } from "../../_lib/selfeval/manualLogsDb.js";
import {
  extractFromFile,
  extractFromText,
} from "../../_lib/selfeval/manualLogsModel.js";
import { runManualLogs } from "../../_lib/selfeval/manualLogsRun.js";

const attemptCounts = new Map<string, number>();
const attempts = {
  count: (sessionId: string) => attemptCounts.get(sessionId) ?? 0,
  add: (sessionId: string) =>
    attemptCounts.set(sessionId, (attemptCounts.get(sessionId) ?? 0) + 1),
};

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
      attempts,
    });
    res.status(result.status).json(result.body);
  },
});

export const config = { runtime: "nodejs", maxDuration: 60 };
