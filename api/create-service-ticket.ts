import crypto from "node:crypto";
import { defineHandler } from "./_lib/handler.js";
import { resolveUser } from "./_lib/httpAuth.js";
import { assertNotQaAccount } from "./_lib/qaAccount.js";
import {
  clean,
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "./_lib/serviceAccess.js";
import { tenantReasonExtra } from "./_lib/tenantUsage.js";

const PAID_MESSAGE = "유료결제이후 이용해주세요!";
// 기간 만료 전용 안내(api/_lib/serviceAccess.js의 checkProgramAccessTable 참고).
// ToS(StudentService.jsx/ParentService.jsx §제3항)가 이미 쓰는 "재결제(재구매)"
// 어휘를 그대로 따른다 — "결제해 주세요" 로만 쓰면 이미 낸 돈을 부정하는 말로 읽힌다.
const EXPIRED_MESSAGE =
  "이용 기간이 만료되었습니다. 계속 이용하시려면 재결제(재구매)해 주세요.";
const TICKET_TTL_SECONDS = Number(process.env.SSO_TICKET_TTL_SECONDS || 180);

function getEnv(...keys: string[]) {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return "";
}

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signTicket(payload: Record<string, unknown>, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = `${base64urlJson(header)}.${base64urlJson(payload)}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function getUserName(
  user:
    | { user_metadata?: Record<string, unknown>; email?: string | null }
    | null
    | undefined,
) {
  const meta = user?.user_metadata || {};
  return clean(
    meta.name || meta.full_name || meta.student_name || user?.email || "",
  );
}

// auth:"none"으로 두고 인증을 handler 내부에서 수행한다(goal/openGoalSession과
// 같은 패턴, api/docs/refactor-plan.md 배치 4 참고) — service_key==='suhaeng'
// 분기는 원래 토큰 검사보다 먼저 실행되어 무인증으로도 200을 낸다
// (defineHandler의 auth:"user"는 handler 진입 전에 무조건 401을 걸어 이 순서를
// 재현할 수 없다). 나머지 config는 원래 순서(400 → target_url 500 → SSO_SECRET
// 500 → 인증 401 → 이용권 403)를 그대로 유지한다.
export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  unhandledMessage: "서비스 입장권 생성 중 오류가 발생했습니다.",
  logLabel: "create-service-ticket",
  handler: async (req, res, ctx) => {
    const { service_key } = req.body || {};

    // 수행평가 인앱 전환(하드 전환, 2026-08-13 사용자 확정) — 외부 앱은 고객사
    // 초안 프로토타입으로 이관 종결됐고, 이 브랜치의 dev 머지 시점이 곧 전환
    // 시점이라 병행 플래그를 두지 않는다. 히어로 CTA는 더 이상 이 엔드포인트를
    // 부르지 않지만(PerformanceAssessment.jsx는 이제 /app/performance로 직접
    // 이동한다), 구 링크・북마크로 이 엔드포인트가 여전히 호출될 수 있어(명세
    // §11-③) 분기를 제거하지 않고 인앱 경로 안내 응답으로 교체한다. SSO
    // 티켓 발급(target_url/SSO_SECRET/서명)은 더 이상 필요 없다 — 실제 이용권
    // 판정은 /app/performance 진입 가드(RequireEntitlement, App.jsx)가 서버
    // 최종 권위로 다시 수행하므로 여기서 이중 판정하지 않는다.
    // 응답 필드는 기존 SSO 티켓 응답과 동일한 `redirect_url`을 쓴다 — 프론트
    // 소비 코드(src/lib/paidServiceAccess.js의 `window.location.href =
    // result.redirect_url`)가 절대/상대 경로를 가리지 않아 그대로 호환된다.
    if (clean(service_key) === "suhaeng") {
      res.status(200).json({
        ok: true,
        service_key: "suhaeng",
        redirect_url: "/app/performance",
      });
      return;
    }

    const config = SERVICE_CONFIGS[clean(service_key)];

    if (!config) {
      res.status(400).json({ detail: "알 수 없는 서비스입니다." });
      return;
    }

    if (!config.target_url) {
      res.status(500).json({
        detail: `${config.service_name} target_url 환경변수가 필요합니다.`,
      });
      return;
    }

    const secret = getEnv("SSO_SECRET");
    if (!secret || secret.length < 32) {
      res.status(500).json({
        detail: "SSO_SECRET 환경변수가 필요합니다. 32자 이상으로 설정해주세요.",
      });
      return;
    }

    const authed = await resolveUser(req);
    if (!authed) {
      res.status(401).json({ detail: PAID_MESSAGE });
      return;
    }

    const { userId, user } = authed;
    // 외부 서비스로 넘어가는 입장권은 실제 서비스 운영에 닿는다. QA 계정에는 발급하지 않는다.
    await assertNotQaAccount(ctx.supabaseAdmin, userId);
    const access = await hasPaidServiceAccess(
      ctx.supabaseAdmin,
      userId,
      config,
    );

    if (!access.allowed) {
      const detail =
        access.reason === "period_expired" ? EXPIRED_MESSAGE : PAID_MESSAGE;
      res.status(403).json({ detail, ...tenantReasonExtra(access.reason) });
      return;
    }

    const now = Date.now();
    const ticketId = crypto.randomUUID();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + TICKET_TTL_SECONDS * 1000).toISOString();
    const userName = getUserName(user);

    const payload = {
      ticket_id: ticketId,
      nonce: ticketId,
      winning_user_id: userId,
      profile_id: userId,
      service_key: config.service_key,
      user_name: userName,
      student_name: userName,
      issued_at: issuedAt,
      expires_at: expiresAt,
    };

    const ticket = signTicket(payload, secret);
    const ticketHash = sha256(ticket);

    const { error: insertError } = await ctx.supabaseAdmin
      .from("sso_tickets")
      .insert({
        ticket_id: ticketId,
        ticket_hash: ticketHash,
        service_key: config.service_key,
        winning_user_id: userId,
        user_name: userName,
        issued_at: issuedAt,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("sso_tickets insert error:", insertError);
      res.status(500).json({
        detail:
          "sso_tickets 테이블이 없거나 저장 권한이 없습니다. 추가 SQL 적용이 필요합니다.",
      });
      return;
    }

    const redirectUrl = new URL(config.target_url);
    redirectUrl.searchParams.set("sso_ticket", ticket);

    res.status(200).json({
      ok: true,
      service_key: config.service_key,
      redirect_url: redirectUrl.toString(),
      expires_at: expiresAt,
    });
  },
});
