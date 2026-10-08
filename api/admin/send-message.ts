// POST /api/admin/send-message
// Authorization: Bearer <supabase access token>
//
// 회원 상세 「알림톡·문자」 탭의 발송 기능. 운영자가 특정 회원에게 자유 문구
// 안내를 보낸다.
//
// 왜 알림톡이 아니라 문자인가
//   알림톡은 카카오 승인을 받은 템플릿 본문만 보낼 수 있다 — 자유 문구는
//   구조상 불가능하다. 그래서 이 경로는 SMS(90바이트 초과 시 LMS)다.
//   참조 HTML 의 안내 문구("90byte 초과 시 자동으로 LMS(장문)로 전환됩니다")도
//   같은 얘기다.
//
// 권한
//   회원 정보를 보고 그 사람에게 연락하는 행위라 자원 키는 'members' 다.
//   **edit 을 요구한다** — 읽기 전용(view) 관리자가 고객에게 문자를 보낼 수는
//   없어야 한다. 판정은 DB 의 fn_admin_can 을 그대로 호출해 화면·데이터·이
//   라우트가 같은 술어를 쓰게 한다(권한 로직을 JS 로 다시 구현하지 않는다).
//
// ⚠ auth 등급 판정 메모(api/docs/batch-5-issues.md에 상세) — 이 라우트는
//   공통 계층의 resolveAdmin(is_admin(), profiles.role='admin' 단일 축)을
//   쓰지 않는다. 대신 "로그인 여부만 확인 → fn_admin_effective_permissions로
//   members:edit 세부 권한 확인" 구조다. 조사 결과 이는 2026-08-19 확정된
//   관리자 권한 체계(AdministratorAccess/PowerUserAccess류 세분화 권한 묶음,
//   admin_members 기반) 구현의 일부로 판단된다 — resolveAdmin의 role='admin'
//   단일 축보다 더 세밀한 신규 권한 체계를 의도적으로 쓴 것이지 resolveAdmin
//   호출 누락이 아니다. 그래서 이 배치에서는 auth 등급을 올리지 않고 기존
//   "로그인 사용자 + RPC 세부 권한" 구조를 defineHandler auth:"user"로만
//   옮긴다(동작 보존 원칙).
//
// 응답 규격
//   200 { ok: true, channel, logId }
//   400 { detail }   수신자/본문 누락
//   401 { detail }   토큰 없음/무효
//   403 { detail }   members edit 권한 없음
//   405 { detail }   POST 아님
//   500 { detail }   발송 실패·설정 누락

import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { sendPlainMessage } from "../_lib/messaging/aligo.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "detail",
  unhandledMessage: "문자 발송 처리 중 오류가 발생했습니다.",
  logLabel: "admin/send-message",
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const actorId = ctx.userId as string;

    // 권한 판정은 DB 함수에 맡긴다. service_role 은 RLS 를 우회하므로 여기서
    // 직접 물어봐야 하고, 술어를 JS 로 옮겨 적으면 곧 화면과 어긋난다.
    const { data: perms, error: permError } = await supabaseAdmin.rpc(
      "fn_admin_effective_permissions",
      { p_profile_id: actorId },
    );

    if (permError) {
      console.error("admin/send-message 권한 조회 실패:", permError);
      return void sendError(res, "detail", 500, "권한 확인에 실패했습니다.");
    }

    const canEditMembers = (perms || []).some(
      (row: { resource_key?: string; level?: string }) =>
        row.resource_key === "members" && row.level === "edit",
    );

    if (!canEditMembers) {
      return void sendError(
        res,
        "detail",
        403,
        "회원 관리 수정 권한이 있어야 문자를 보낼 수 있습니다.",
      );
    }

    const body = (req.body || {}) as {
      profileId?: string;
      phone?: string;
      text?: string;
      subject?: string;
    };

    const profileId = String(body.profileId || "").trim() || null;
    const text = String(body.text || "").trim();
    let phone = String(body.phone || "").replace(/[^0-9]/g, "");

    if (!text) {
      return void sendError(res, "detail", 400, "보낼 내용을 입력해 주세요.");
    }

    // 화면이 번호를 안 넘기면(마스킹 상태라 원문을 모를 수 있다) profile 에서
    // 직접 읽는다 — 마스킹된 문자열이 그대로 넘어와 발송이 실패하는 걸 막는다.
    if (!phone && profileId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("phone")
        .eq("id", profileId)
        .maybeSingle();
      phone = String(profile?.phone || "").replace(/[^0-9]/g, "");
    }

    if (!phone) {
      return void sendError(res, "detail", 400, "수신자 연락처가 없습니다.");
    }

    let result: Awaited<ReturnType<typeof sendPlainMessage>> | null = null;
    let thrown: string | null = null;

    try {
      result = await sendPlainMessage({
        phone,
        text,
        subject: String(body.subject || "").trim() || "위닝에듀 안내",
      });
    } catch (error) {
      thrown = (error as Error).message;
    }

    const ok = Boolean(result?.ok);

    // 이력은 크론과 같은 표에 남긴다 — 회원 상세 탭이 한 곳만 읽으면 되도록.
    // dedupe_key 는 두지 않는다(같은 내용을 일부러 다시 보낼 수 있어야 한다).
    const { data: inserted } = await supabaseAdmin
      .from("alimtalk_send_logs")
      .insert({
        template_key: "manualMessage",
        channel: result?.channel || "sms",
        profile_id: profileId,
        phone,
        subject: String(body.subject || "").trim() || "위닝에듀 안내",
        message: text,
        status: ok ? "sent" : "failed",
        provider_code: result ? String(result.providerCode) : null,
        provider_message: result?.providerMessage || thrown || null,
        provider_msg_id: result?.messageId || null,
        meta: { sentBy: actorId },
      })
      .select("id")
      .maybeSingle();

    if (!ok) {
      return void sendError(
        res,
        "detail",
        500,
        `발송 실패: ${thrown || result?.providerMessage || "알 수 없는 오류"}`,
      );
    }

    return void res.status(200).json({
      ok: true,
      channel: result?.channel,
      logId: (inserted?.id as number) ?? null,
    });
  },
});
