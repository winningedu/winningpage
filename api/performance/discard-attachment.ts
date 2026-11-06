// POST /api/performance/discard-attachment
// Authorization: Bearer <supabase access token>
//
//   { sessionId, attachmentId }
//   → 200 { discarded: true, attachmentId }
//   → 403 { error:{code:'NOT_SESSION_OWNER'} }   (세션 없음/남의 세션)
//   → 403 { error:{code:'NOT_ATTACHMENT_OWNER'} }(첨부 없음/다른 세션의 첨부)
//   → 409 { error:{code:'ATTACHMENT_ALREADY_ANALYZED'} }
//
// ── 왜 있는가 (첨부 슬롯 회수)
//    `upload-url.js`는 **토큰 발급 시점에** `ocr_status='pending'` 행을 만들고,
//    상한 판정은 세션의 `performance_attachments` 행을 전부(삭제분·실패분 포함)
//    센다 — 그 카운트에서 행을 빼면 5장 상한을 우회할 수 있기 때문이다.
//    그런데 그 설계만 두면 자리를 되돌릴 방법이 없다: 5장을 올리다 Storage PUT이
//    한 장이라도 실패해 사용자가 다시 시도하면 화면에는 사진이 4장뿐인데
//    `409 TOO_MANY_ATTACHMENTS`("최대 5장까지 올릴 수 있어요") 또는 413이 뜨고,
//    회복 수단은 24시간 고아 스윕뿐이라 **최대 하루 동안 그 세션에서 안내문을
//    올릴 수 없다.** 이 엔드포인트가 그 자리를 즉시 비운다.
//
// ── 무엇을 막는가 (상한 우회 차단)
//    대상은 **`ocr_status='pending'`인 행뿐이다.** `done`/`failed`는 거절한다.
//      · `done`   — 분석이 끝난 첨부를 지울 수 있으면 "5장 올려 분석 → 전부 삭제 →
//                   또 5장"으로 세션당 상한과 25MB 예산이 무한해진다.
//      · `failed` — 실패 기록은 24시간/90일 잡의 판단 재료이자 포렌식 흔적이다.
//    즉 회수 가능한 것은 "아직 분석에 들어가지 않은 방금 그 업로드"뿐이다.
//
// ── 경로는 DB가 정본이다 (§8.8 BLOCK)
//    요청은 `attachmentId`(uuid)만 받는다. Storage remove에 쓰는 경로는 세션
//    소유권을 확인한 뒤 읽어온 `performance_attachments.storage_path`뿐이며,
//    클라이언트가 보낸 문자열이 Storage 호출에 들어가는 지점이 없다
//    (`analyze-guide.js`·`cleanup-attachments.js`와 같은 규율).
//
// ── 삭제 순서: Storage 먼저, 행 나중
//    반대로 하면 행이 사라진 뒤 remove가 실패했을 때 **어느 잡도 다시 집지 못하는**
//    영구 잔존 객체가 된다(cleanup 잡은 행을 순회한다). 이 순서에서 최악은
//    "객체는 지웠는데 행이 남은" 상태이고, 그 행은 pending이라 24시간 스윕이
//    정리한다(remove는 이미 없는 객체에 대해 에러가 아니다).

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";
import { tenantReasonExtra } from "../_lib/tenantUsage.js";
import { BUCKET } from "./upload-url.js";

const SERVICE_KEY = "suhaeng";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "사진 취소에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/discard-attachment",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);

    // 이용권 재판정 — §8.6 공통 규약(다른 performance 라우트와 같은 관례).
    const { allowed: hasAccess, reason: accessReason } =
      await hasPaidServiceAccess(
        ctx.supabaseAdmin,
        userId,
        // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
        SERVICE_CONFIGS[SERVICE_KEY]!,
      );
    if (!hasAccess) {
      return fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
        tenantReasonExtra(accessReason),
      );
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const attachmentId =
      typeof body.attachmentId === "string" ? body.attachmentId.trim() : "";

    if (!sessionId) {
      return fail(res, 400, "MISSING_FIELD", "sessionId는 필수입니다.", {
        field: "sessionId",
      });
    }

    if (!UUID_RE.test(attachmentId)) {
      return fail(
        res,
        400,
        "INVALID_ATTACHMENT_ID",
        "attachmentId 형식이 올바르지 않습니다.",
        {
          field: "attachmentId",
        },
      );
    }

    // 세션 소유권 — service_role이라 RLS가 우회되므로 이 조건이 유일한 방어선이다.
    const { data: sessionRow, error: sessionError } = await ctx.supabaseAdmin
      .from("performance_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("profile_id", userId)
      .maybeSingle();

    if (sessionError)
      throw new Error(`세션 조회 실패: ${sessionError.message}`);

    if (!sessionRow) {
      return fail(
        res,
        403,
        "NOT_SESSION_OWNER",
        "이 수행평가 세션에 접근할 수 없습니다.",
      );
    }

    // 첨부 조회는 **세션에 묶어서** 한다(analyze-guide.js와 같은 IDOR 차단 방식).
    // 없는 id와 남의 첨부를 같은 403으로 합친다(존재 오라클 방지).
    const { data: attachmentRow, error: attachmentError } =
      await ctx.supabaseAdmin
        .from("performance_attachments")
        .select("id,storage_path,ocr_status,deleted_at")
        .eq("id", attachmentId)
        .eq("session_id", sessionRow.id)
        .maybeSingle();

    if (attachmentError)
      throw new Error(`첨부 조회 실패: ${attachmentError.message}`);

    if (!attachmentRow) {
      return fail(
        res,
        403,
        "NOT_ATTACHMENT_OWNER",
        "이 안내문 사진에 접근할 수 없습니다.",
      );
    }

    if (attachmentRow.ocr_status !== "pending") {
      return fail(
        res,
        409,
        "ATTACHMENT_ALREADY_ANALYZED",
        "이미 분석에 사용된 사진은 취소할 수 없어요.",
      );
    }

    // Storage 먼저(파일 상단 주석). 경로는 DB 값이다.
    if (attachmentRow.storage_path && !attachmentRow.deleted_at) {
      const { error: removeError } = await ctx.supabaseAdmin.storage
        .from(BUCKET)
        .remove([attachmentRow.storage_path]);

      if (removeError) {
        // 객체를 못 지웠으면 행을 남긴다 — 행이 사라지면 cleanup 잡이 이 객체를
        // 영영 다시 집지 못한다(그 잡은 행을 순회한다).
        console.error(
          "performance/discard-attachment 원본 삭제 실패:",
          removeError,
        );
        return fail(
          res,
          500,
          "INTERNAL",
          "사진을 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    }

    const { error: deleteError } = await ctx.supabaseAdmin
      .from("performance_attachments")
      .delete()
      .eq("id", attachmentRow.id)
      .eq("session_id", sessionRow.id);

    if (deleteError)
      throw new Error(`첨부 행 삭제 실패: ${deleteError.message}`);

    res.status(200).json({ discarded: true, attachmentId: attachmentRow.id });
  },
});

// 실행 시간: 모델을 부르지 않으므로 형제 라우트의 `maxDuration: 60`이 필요 없다.
export const config = { runtime: "nodejs" };
