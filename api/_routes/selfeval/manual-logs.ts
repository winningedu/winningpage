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
//   200 { memos[MemoView] } / { memos, personNameDetected } / { memo } / {}  (요청, 응답 계약은 shared/selfeval/manual-logs.ts 다)
//   400 VALIDATION_FAILED (모양) / UPLOAD_INPUT / TEXT_TOO_LONG / TEXT_REQUIRED / FILE_TYPE / FILE_INVALID
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

import { SELFEVAL_ERROR } from "../../../shared/selfeval/contract.js";
import { manualLogsBody } from "../../../shared/selfeval/manual-logs.js";
import { userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  readSelfevalAccess,
  selfevalProblem,
} from "../../_lib/selfeval/access.js";
import { loadSession } from "../../_lib/selfeval/db.js";
import { checkManualLogsBody } from "../../_lib/selfeval/manualLogs.js";
import {
  claimUploadAttempt,
  manualLogsStore,
  SessionNotOpenError,
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

const NOT_OPEN = "이미 닫힌 세션이에요.";

const guard = user({
  unhandledMessage: "수기 메모 처리에 실패했습니다.",
  logLabel: "selfeval/manual-logs",
  headers: { "Cache-Control": "no-store" },
});

export const manualLogs = userFactory
  .createApp()
  .post("/", guard, validate("json", manualLogsBody), async (c) => {
    const { supabaseAdmin: db, user: me } = c.var;
    // 글 길이와 파일 규칙은 학생에게 보이는 코드가 있어 모양 검사 다음에, 이용권보다 먼저 본다.
    const parsed = checkManualLogsBody(c.req.valid("json"));
    if (!parsed.ok) throw selfevalProblem(400, parsed.code, parsed.message);
    const access = await readSelfevalAccess(db, me.id);
    if (!access.allowed) {
      throw selfevalProblem(
        403,
        "NO_ENTITLEMENT",
        "이용권이 없어요. 자기평가서는 이용권 1회로 하나를 만들어요.",
        tenantReasonExtra(access.tenantReason),
      );
    }
    const { body } = parsed;
    const session = await loadSession(db, me.id, body.sessionId);
    if (!session) {
      throw selfevalProblem(
        404,
        "SESSION_NOT_FOUND",
        "자기평가서 세션을 찾을 수 없어요.",
      );
    }
    if (session.status !== "draft" && session.status !== "in_progress") {
      throw selfevalProblem(409, SELFEVAL_ERROR.SESSION_NOT_OPEN, NOT_OPEN);
    }
    let result: Awaited<ReturnType<typeof runManualLogs>>;
    try {
      result = await runManualLogs(body, session, {
        store: manualLogsStore(db),
        extractFile: extractFromFile,
        extractText: extractFromText,
        attempts: {
          claim: (sessionId) =>
            claimUploadAttempt(db, me.id, sessionId, UPLOAD_ATTEMPT_CAP),
        },
      });
    } catch (e) {
      if (!(e instanceof SessionNotOpenError)) throw e;
      throw selfevalProblem(409, SELFEVAL_ERROR.SESSION_NOT_OPEN, NOT_OPEN);
    }
    // runManualLogs 는 실패를 { ok: false, code, message } 본문으로 돌려준다. problem 으로 바꿔 던지고 성공 본문에서는 ok 를 뺀다.
    if (result.status !== 200) {
      const { code, message } = result.body as {
        code: string;
        message: string;
      };
      throw selfevalProblem(result.status, code, message);
    }
    const { ok: _ok, ...rest } = result.body;
    return c.json(rest);
  })
  .all("/", methodNotAllowed("POST"));
