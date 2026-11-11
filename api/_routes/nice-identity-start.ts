// POST /api/nice-identity-start  { purpose? }
//
// NICE 「통합인증」 표준창을 열기 위한 URL을 발급하고, 콜백에서 결과를 열어볼
// 재료(transaction_id / ticket / iterators)를 pending 행에 담아둔다.
//
// 로그인은 선택이다
//   가입 전에 본인확인을 하는 경로(만 14세 미만 법정대리인 인증)가 있어서
//   계정이 아직 없을 수 있다. 토큰이 있으면 user_id를 채우고, 없으면 null로
//   두었다가 가입이 끝날 때 연결한다.
//
// ⚠️ return_url은 반드시 서버 환경변수 값만 쓴다.
//   클라이언트가 보낸 값을 그대로 실으면 인증 결과를 통째로 남의 서버로
//   보내버릴 수 있다. 이 파일은 req.body의 어떤 URL도 쓰지 않는다.
//
// ⚠️ "NICE가 아무 return_url이나 받아준다"는 예전 메모는 **사실이 아니다**.
//   2026-08-06에 확인했다던 것은 아무 값을 넣어도 **표준창이 열리더라**는 것뿐이고,
//   인증 완료 후 그 URL로 **실제 리턴이 오는지는 검증된 적이 없다**(2026-08-13
//   사용자 정정). PUBLIC_SITE_URL을 Vercel에 등록한 뒤에야 리턴이 실제로 오기
//   시작했다(2026-08-18 확인).
//
// ⚠️ 아직 연결되지 않은 것
//   complete_signup_profile은 본인확인 여부를 보지 않는다. 그래서 지금은
//   클라이언트가 이 단계를 건너뛰고 가입을 마칠 수 있다. send-phone-code와
//   같은 구멍이며, 가입 RPC에서 identity_verifications를 consume 하도록
//   함께 막아야 한다.

import { defineHandler } from "../_lib/handler.js";
import {
  generateRequestNo,
  issueAuthUrl,
  REQUEST_TTL_SECONDS,
  SVC_TYPE_MOBILE,
} from "../_lib/niceIdentity.js";
import { getClientIp } from "../_lib/phoneCode.js";
import { getBearerToken } from "../_lib/serviceAccess.js";
import { getEnv } from "../_lib/supabaseAdmin.js";

// Fixie 프록시(undici ProxyAgent)를 쓰므로 Edge 런타임에서는 동작하지 않는다.
export const config = { runtime: "nodejs" };

const ALLOWED_PURPOSES = ["signup", "under14_guardian", "phone_change"];

// 본인확인은 건당 과금이다. 정상 사용이라면 몇 번이면 끝나므로 좁게 잡는다.
const MAX_STARTS_PER_HOUR_PER_IP = 10;

/**
 * 콜백이 우리 pending 행을 찾을 수 있도록 return_url에 rid를 붙인다.
 * NICE 콜백은 web_transaction_id만 돌려주기 때문에 이것 말고는 열쇠가 없다.
 */
function buildReturnUrl(requestNo: string) {
  const base = getEnv("NICE_RETURN_URL");
  if (!base) throw new Error("NICE_RETURN_URL 환경변수가 필요합니다.");

  const url = new URL(base);
  url.searchParams.set("rid", requestNo);

  // 가이드상 return_url은 250byte까지다. 넘으면 NICE가 거절하므로 미리 막는다.
  const built = url.toString();
  if (Buffer.byteLength(built, "utf8") > 250) {
    throw new Error("NICE_RETURN_URL이 너무 깁니다(250byte 초과).");
  }

  return built;
}

// 인증이 선택인 엔드포인트다(가입 전 본인확인 포함) — defineHandler auth:"user"는
// 토큰이 없거나 무효하면 401로 막아버려 가입 전 호출을 깨뜨린다. 그래서
// auth:"none"으로 두고, 공유 getBearerToken(_lib/serviceAccess.js)만 재사용해
// "있으면 붙이고 없거나 무효해도 통과"하는 원래 동작을 그대로 유지한다
// (api/docs/batch-3-issues.md — 명세 대조표는 이 파일을 auth:user로 적었지만
// 실제 동작은 auth:none이다).
export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  unhandledMessage:
    "본인확인을 시작하지 못했습니다. 문제가 계속되면 고객센터로 문의해 주세요.",
  logLabel: "nice-identity-start",
  handler: async (req, res, ctx) => {
    const purpose: string = ALLOWED_PURPOSES.includes(req.body?.purpose)
      ? req.body.purpose
      : "signup";
    const ip = getClientIp(req);

    try {
      const supabase = ctx.supabaseAdmin;

      // 로그인 상태면 user_id를 붙인다. 실패해도 진행한다 — 가입 전 호출이 정상이다.
      let userId: string | null = null;
      const token = getBearerToken(req);

      if (token) {
        const { data } = await supabase.auth.getUser(token);
        userId = data?.user?.id || null;
      }

      const { count, error: countError } = await supabase
        .from("identity_verifications")
        .select("id", { count: "exact", head: true })
        .eq("request_ip", ip)
        .gte("requested_at", new Date(Date.now() - 3600 * 1000).toISOString());

      if (countError) throw countError;

      if ((count || 0) >= MAX_STARTS_PER_HOUR_PER_IP) {
        return void res.status(429).json({
          ok: false,
          reason: "rate_limited",
          detail: "본인확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
        });
      }

      const requestNo = generateRequestNo();

      const auth = await issueAuthUrl({
        requestNo,
        returnUrl: buildReturnUrl(requestNo),
        svcTypes: [SVC_TYPE_MOBILE],
      });

      // 표준창을 열기 전에 저장한다. 순서를 바꾸면 사용자가 인증을 마쳤는데
      // 우리 쪽에 행이 없어 결과를 버리는 경우가 생긴다.
      const { error: insertError } = await supabase
        .from("identity_verifications")
        .insert({
          request_id: auth.requestNo,
          user_id: userId,
          purpose,
          status: "pending",
          transaction_id: auth.transactionId,
          auth_ticket: auth.ticket,
          auth_iterators: auth.iterators,
          request_ip: ip,
          expires_at: new Date(
            Date.now() + REQUEST_TTL_SECONDS * 1000,
          ).toISOString(),
        });

      if (insertError) throw insertError;

      return void res.status(200).json({
        ok: true,
        // 프론트는 이 URL을 window.open으로 연다. 파라미터를 따로 싣지 않는다.
        auth_url: auth.authUrl,
        request_id: auth.requestNo,
        expires_in: REQUEST_TTL_SECONDS,
      });
    } catch (error) {
      console.error("[nice-identity-start] 오류:", error);

      // 설정 오류 / NICE가 거절 / NICE에 닿지 못함을 구분한다. 앞의 둘은
      // 재시도해도 그대로라 "잠시 후 다시"라고 안내하면 안 된다.
      const isConfigError = /환경변수|너무 깁니다/.test(
        String(error?.message || ""),
      );
      const reason = isConfigError
        ? "server_misconfigured"
        : error?.niceResultCode
          ? "vendor_rejected"
          : "vendor_unavailable";

      return void res.status(500).json({
        ok: false,
        reason,
        detail:
          reason === "vendor_unavailable"
            ? "본인확인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "본인확인을 시작하지 못했습니다. 문제가 계속되면 고객센터로 문의해 주세요.",
      });
    }
  },
});
