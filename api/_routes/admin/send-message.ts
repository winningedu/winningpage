// /api/admin/send-message 아래 문자 발송 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/send-message", sendMessage) 로 붙인다.
// 요청 검증과 응답 모양은 shared/send-message/contract.ts 를 따른다.
//
// POST /api/admin/send-message
// Authorization: Bearer <supabase access token>
//
// 회원 상세 「알림톡, 문자」 탭의 발송 기능. 운영자가 특정 회원에게 자유 문구
// 안내를 보낸다.
//
// 왜 알림톡이 아니라 문자인가
//   알림톡은 카카오 승인을 받은 템플릿 본문만 보낼 수 있다. 자유 문구는
//   구조상 불가능하다. 그래서 이 경로는 SMS(90바이트 초과 시 LMS)다.
//   참조 HTML 의 안내 문구("90byte 초과 시 자동으로 LMS(장문)로 전환됩니다")도
//   같은 얘기다.
//
// 권한
//   회원 정보를 보고 그 사람에게 연락하는 행위라 메뉴 키는 'members' 다.
//   POST 라 edit 을 요구한다. 읽기 전용(view) 관리자가 고객에게 문자를 보낼 수는
//   없어야 한다. 관리자 판정, 메뉴 권한, QA 계정 쓰기 차단은 admin() 가드가 한다.
//
// 응답 규격
//   200 { channel, logId }
//   400 problem  수신자/본문 누락
//   401, 403 problem  로그인, 관리자, members edit 권한
//   405 problem  POST 아님
//   500 problem  발송 실패(SEND_FAILED)와 설정 누락

import {
  SEND_MESSAGE_ERROR,
  type SendMessageResult,
  sendMessageBody,
} from "../../../shared/send-message/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { sendPlainMessage } from "../../_lib/messaging/aligo.js";

const guard = admin({
  permission: { key: "members" },
  unhandledMessage: "문자 발송 처리 중 오류가 발생했습니다.",
  logLabel: "admin/send-message",
});

export const sendMessage = adminFactory
  .createApp()
  .post("/", guard, validate("json", sendMessageBody), async (c) => {
    const supabaseAdmin = c.var.supabaseAdmin;
    const actorId = c.var.userId as string;
    const body = c.req.valid("json");

    const profileId = (body.profileId ?? "").trim() || null;
    const text = body.text.trim();
    let phone = (body.phone ?? "").replace(/[^0-9]/g, "");

    if (!text) {
      throw new ProblemError(
        400,
        "보낼 내용을 입력해 주세요.",
        SEND_MESSAGE_ERROR.TEXT_REQUIRED,
      );
    }

    // 화면이 번호를 안 넘기면(마스킹 상태라 원문을 모를 수 있다) profile 에서
    // 직접 읽는다. 마스킹된 문자열이 그대로 넘어와 발송이 실패하는 걸 막는다.
    if (!phone && profileId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("phone")
        .eq("id", profileId)
        .maybeSingle();
      phone = String(profile?.phone || "").replace(/[^0-9]/g, "");
    }

    if (!phone) {
      throw new ProblemError(
        400,
        "수신자 연락처가 없습니다.",
        SEND_MESSAGE_ERROR.RECIPIENT_REQUIRED,
      );
    }

    let result: Awaited<ReturnType<typeof sendPlainMessage>> | null = null;
    let thrown: string | null = null;

    try {
      result = await sendPlainMessage({
        phone,
        text,
        subject: (body.subject ?? "").trim() || "위닝에듀 안내",
      });
    } catch (error) {
      thrown = (error as Error).message;
    }

    const ok = Boolean(result?.ok);

    // 이력은 크론과 같은 표에 남긴다. 회원 상세 탭이 한 곳만 읽으면 되도록.
    // dedupe_key 는 두지 않는다(같은 내용을 일부러 다시 보낼 수 있어야 한다).
    const { data: inserted } = await supabaseAdmin
      .from("alimtalk_send_logs")
      .insert({
        template_key: "manualMessage",
        channel: result?.channel || "sms",
        profile_id: profileId,
        phone,
        subject: (body.subject ?? "").trim() || "위닝에듀 안내",
        message: text,
        status: ok ? "sent" : "failed",
        provider_code: result ? String(result.providerCode) : null,
        provider_message: result?.providerMessage || thrown || null,
        provider_msg_id: result?.messageId || null,
        meta: { sentBy: actorId },
      })
      .select("id")
      .maybeSingle();

    if (!ok || !result) {
      throw new ProblemError(
        500,
        `발송 실패: ${thrown || result?.providerMessage || "알 수 없는 오류"}`,
        SEND_MESSAGE_ERROR.SEND_FAILED,
      );
    }

    return c.json({
      channel: result.channel,
      logId: (inserted?.id as number) ?? null,
    } satisfies SendMessageResult);
  })
  .all("/", methodNotAllowed("POST"));
