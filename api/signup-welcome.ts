// POST /api/signup-welcome   (본문 없음, Authorization: Bearer <access_token>)
//
// 학부모 회원가입 직후 1회 — 가입 축하 쿠폰을 발급하고 안내 알림톡을 보낸다.
//
// 왜 서버인가
//   ① 알리고는 발신 IP 화이트리스트를 쓴다. 브라우저에서 직접 못 부른다
//      (api/_lib/outbound.ts 고정 IP 프록시 경유가 강제된다).
//   ② 쿠폰 발급은 coupon_grants INSERT 다. 클라이언트에 열어주면 아무나
//      자기 자신에게 쿠폰을 찍을 수 있다 — service_role 로만 부를 수 있는
//      RPC(fn_grant_signup_coupons_for_user)를 쓴다.
//
// 학부모만
//   2026-08-25 회의 확정 — 학생 가입자에게는 보내지 않는다. 결제를 학부모가
//   하고, 쿠폰 판정도 학부모-학생 쌍 단위라 학부모 한 명에게만 있으면 그 쌍의
//   주문에 적용된다(fn_usable_coupons). 그래서 학생 가입 폼(StudentForm /
//   Under14Form)은 이 라우트를 부르지 않고, 여기서도 member_type 을 한 번 더
//   확인한다 — 호출부만 믿으면 나중에 폼이 하나 늘 때 조용히 새어나간다.
//
// 왜 발급까지 여기서 하는가
//   가입 쿠폰 자동 발급은 auth.users 트리거가 하는데, 그 트리거는 **dev·로컬
//   에만 있고 prod 에는 의도적으로 없다**(supabase/README "의도적 드리프트",
//   사용자 확정 2026-08-21). 그대로 두면 prod 에서는 "쿠폰을 발급해 드렸습니다"
//   문자만 가고 쿠폰은 없다. 발송 직전에 같은 발급 본문을 한 번 더 부르면
//   두 환경이 같아진다 — RPC 가 멱등이라 트리거가 이미 발급한 dev 에서는
//   0건으로 지나간다.
//
// 실패가 가입을 막지 않는다
//   호출부(ParentForm)는 결과를 기다리지 않고, 여기서도 발급·발송 실패를
//   200 안의 필드로 돌려준다. 가입은 이미 끝났고 축하 문자가 안 갔다고
//   되돌릴 수 있는 게 없다. 실패는 alimtalk_send_logs 에 남으므로 회원 상세의
//   「알림톡·문자」 탭에서 확인하고 수기 재발송할 수 있다.
//
// 중복 발송
//   dedupe_key = `signupCoupon:<profileId>` — alimtalk_send_logs 의 부분 유니크
//   인덱스가 최종 방어선이다. 이 라우트를 여러 번 불러도 문자는 한 번만 간다.
//   ⚠️ sendAndLog 는 성공·실패를 가리지 않고 같은 키의 로그가 있으면 건너뛴다.
//   벤더 장애로 한 번 실패하면 자동 재시도가 되지 않는다는 뜻이다 — 그 경우는
//   어드민에서 수기 발송한다(크론 3종과 같은 규약).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendAndLog } from "./_lib/messaging/alimtalkSend.js";
import { createSupabaseAdmin } from "./_lib/supabaseAdmin.js";

export const config = { runtime: "nodejs" };

function getBearerToken(req: VercelRequest) {
  return String(req.headers.authorization || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, detail: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      reason: "not_authenticated",
      detail: "로그인이 필요합니다.",
    });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);
    const userId = userData?.user?.id ?? null;

    if (userError || !userId) {
      return res.status(401).json({
        ok: false,
        reason: "not_authenticated",
        detail: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, phone, member_type")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      console.error("signup-welcome 프로필 조회 실패:", profileError);
      return res
        .status(500)
        .json({ ok: false, reason: "profile_lookup_failed" });
    }

    // 가입 RPC(complete_signup_profile)가 아직 안 끝났거나 학생이면 아무것도
    // 하지 않는다. 200 으로 돌려준다 — 호출부에 보여줄 오류가 아니다.
    if (!profile || profile.member_type !== "parent") {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: profile ? "not_parent" : "no_profile",
      });
    }

    // 1) 쿠폰 발급. 멱등이라 트리거가 이미 발급한 환경에서는 0건이다.
    //    발급이 실패해도 발송은 시도한다 — dev 는 트리거가 이미 발급해 둔
    //    상태일 수 있어서, 여기 실패를 "쿠폰 없음"으로 단정할 수 없다.
    let grantedCount: number | null = null;

    const { data: granted, error: grantError } = await supabaseAdmin.rpc(
      "fn_grant_signup_coupons_for_user",
      { p_user_id: userId },
    );

    if (grantError) {
      console.error("signup-welcome 쿠폰 발급 실패:", grantError);
    } else {
      grantedCount = Number(granted ?? 0);
    }

    // 2) 안내 알림톡. 고객명은 승인 문안의 #{고객명} 자리다 — 비어 있으면
    //    템플릿의 v() 가 던지고 sendAndLog 가 실패 로그로 남긴다.
    const outcome = await sendAndLog({
      supabaseAdmin,
      templateKey: "signupCoupon",
      phone: profile.phone,
      profileId: profile.id,
      dedupeKey: `signupCoupon:${profile.id}`,
      meta: { grantedCount },
      variables: { 고객명: String(profile.name || "").trim() },
    });

    if (outcome.status === "failed") {
      console.error(
        `signup-welcome 발송 실패 profile=${userId}:`,
        outcome.reason,
      );
    }

    return res.status(200).json({
      ok: true,
      skipped: outcome.status === "skipped",
      send: outcome.status,
      grantedCount,
    });
  } catch (error) {
    console.error("signup-welcome 처리 실패:", error);
    return res.status(500).json({ ok: false, reason: "unexpected" });
  }
}
