// POST /api/check-service-access  { service_key }
// Authorization: Bearer <access_token>
//
// 클라이언트가 "이 사용자가 이 서비스의 유료 이용권을 가졌는가"를 물어보는
// 읽기 전용 엔드포인트다. 판정 로직 자체는 api/_lib/serviceAccess.js
// (program_access / enrollments 판정)에 있고, 여기서는 그걸 그대로
// 불러 쓴다 — api/_routes/create-service-ticket.js와 정확히 같은 규칙을 쓴다는
// 뜻이다. orders 테이블은 보지 않는다(그 이유는 serviceAccess.js 상단 주석
// 참고).
//
// create-service-ticket.js와 다른 점: 이 엔드포인트는 SSO 티켓을 발급하지
// 않는다. target_url도, SSO_SECRET도 요구하지 않고 sso_tickets에 아무것도
// 쓰지 않는다 — 순수 조회다. RequireGoalAccess 같은 가드가 "결제 페이지로
// 보낼지 말지"를 정하는 데만 쓴다.
//
// 응답 규격
//   200 {
//     allowed: true|false,        — 정상 판정. 미결제는 에러가 아니라
//                                   allowed:false다(가드가 정상 분기해야 함).
//     quotaRemaining: int|null,   — 남은 회차. **null이면 무제한**(0이 아니다).
//     quotaTotal: int|null,       — 총 회차. null이면 무제한.
//     planEndsAt: string|null,    — 이용권 만료 시각(ISO).
//     planLabel: string|null      — 상품 표시명.
//   }
//   스쿨멘토(SITE=schoolmentor)는 위 5필드에 두 개가 더 붙는다:
//     tenantReason: catch_all|disabled|outside_period|grace|month_cap|term_cap|null
//                   (기관 거부 사유. 앞 네 값은 allowed:false, 뒤 두 값은 allowed:true 이고 시작만 막힌다)
//     limitKind:    "month"|"term"|null (남은 횟수가 작은 쪽, 같으면 term)
//     planEndsAt 은 그 한도가 다시 열리는 날(YYYY-MM-DD)이다. 위닝 응답에는 두 필드가 없다.
//   400 { detail }               — 알 수 없는 service_key.
//   401 { detail }                — 토큰 없음/무효.
//   405 { detail }                — POST 아님.
//   500 { detail }                — 서버 설정 누락 등 예외.
//
// ⚠️ 회차 4필드는 **안내용이다. 이 응답은 차단 권위가 아니다.**
//    실제 차단은 sql/54_performance_app.sql의 consume_performance_credit RPC
//    결과로만 이뤄진다 — 그 RPC가 program_access 행을 `for update`로 잠그고
//    원장(performance_credit_ledger) INSERT에 성공했을 때만 회차가 준다.
//    여기서는 잠금 없이 읽기만 하므로, 응답을 만드는 사이에 다른 탭·기기가
//    차감하면 값이 즉시 낡는다. 클라이언트는 이 값으로 "남은 횟수 N회"를
//    표시하고 소진 배너를 띄우는 데까지만 쓰고, 진행 가능 여부는 반드시
//    api/performance/* 응답(409 QUOTA_EXHAUSTED)으로 판단해야 한다
//    (명세서 §2.2 「클라이언트 판정은 항상 안내용」, §9.3).
//
// 하위호환: 기존 호출부(src/lib/entitlement.js → RequireGoalAccess)는
// `allowed` 하나만 읽는다. 위 4필드는 **추가**일 뿐이며 allowed의 의미·타입은
// 바뀌지 않았다. 회차 개념이 없는 서비스(goal)는 4필드가 전부 null로 나간다.

import { defineHandler } from "../_lib/handler.js";
import { resolveUser } from "../_lib/httpAuth.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  clean,
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";
import { isSchoolmentorSite } from "../_lib/site.js";
import {
  PROGRAM_KEY_BY_SERVICE,
  readTenantQuota,
  readTenantUsage,
  tenantEntryAccess,
} from "../_lib/tenantUsage.js";

// auth:"none"으로 두고 인증을 handler 내부에서 수행한다(change-phone.ts·
// create-service-ticket.ts와 같은 패턴) — dev 원본은 400(알 수 없는 service_key)
// 판정이 401(토큰)보다 먼저다. defineHandler의 auth:"user"는 handler 진입 전에
// 무조건 401을 걸어 이 순서를 재현할 수 없다.
export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "detail",
  unhandledMessage: "이용권 확인 중 오류가 발생했습니다.",
  logLabel: "check-service-access",
  handler: async (req, res, ctx) => {
    const { service_key } = req.body || {};
    const config = SERVICE_CONFIGS[clean(service_key)];

    if (!config) {
      sendError(res, "detail", 400, "알 수 없는 서비스입니다.");
      return;
    }

    const authed = await resolveUser(req);
    if (!authed) {
      sendError(res, "detail", 401, "로그인이 필요합니다.");
      return;
    }
    const userId = authed.userId;

    // 스쿨멘토: 기관 설정으로 판정하고 남은 횟수도 기관 한도에서 읽는다.
    // tenantReason 은 거부 사유이고 한도 소진(month_cap, term_cap)일 때는 allowed 가 true 여도 채워진다.
    // limitKind 는 안내에 쓰는 한도 종류(month, term, 없으면 null)다. 읽지 못하면 열지 않고 500 으로 답한다.
    if (isSchoolmentorSite()) {
      try {
        const tenant = await readTenantUsage(
          ctx.supabaseAdmin,
          userId,
          PROGRAM_KEY_BY_SERVICE[config.service_key] ?? config.service_key,
        );
        const quota = readTenantQuota(tenant);
        res.status(200).json({
          allowed: tenantEntryAccess(tenant).allowed,
          quotaRemaining: quota.quotaRemaining,
          quotaTotal: quota.quotaTotal,
          planEndsAt: quota.planEndsAt,
          planLabel: quota.planLabel,
          tenantReason: tenant.denyReason,
          limitKind: quota.limitKind,
        });
      } catch (tenantError) {
        console.error("check-service-access 기관 상태 조회 실패:", tenantError);
        // 열지 않되 최종 막힘으로 답하지도 않는다. 5xx 라 클라이언트는 확인 실패로 보고 다시 시도한다.
        sendError(res, "detail", 500, "이용권 확인 중 오류가 발생했습니다.");
      }
      return;
    }
    // hasPaidServiceAccess(판정, fn_program_access_state RPC 경유)와
    // findProgramAccessRow(회차 표시용 행 조회, program_access 테이블 직접 조회)는
    // 서로의 결과에 의존하지 않는다 — 둘 다 program_access를 각자 다른 방식으로
    // 조회할 뿐이라 직렬로 기다릴 이유가 없었다(이전엔 순서대로 await해 두 서버
    // 왕복이 그대로 더해졌다). Promise.all로 동시에 보내 지연을 줄인다.
    //
    // hasPaidServiceAccess는 이제 { allowed, reason } 을 돌려준다(기간만료
    // 사유를 create-service-ticket.js가 구분해 응답하기 위함) — 여기서는
    // 조회 응답 규격이 boolean 이므로 allowed만 뽑아 쓴다.
    const [{ allowed }, accessRow] = await Promise.all([
      hasPaidServiceAccess(ctx.supabaseAdmin, userId, config),
      findProgramAccessRow(ctx.supabaseAdmin, userId, config),
    ]);

    // 회차 조회는 판정과 독립이다. 실패해도 allowed를 흔들지 않는다 —
    // 부가 정보를 못 읽었다고 결제 완료 사용자를 미보유로 떨어뜨리면 안 된다.
    // (allowed:true인데 회차가 null이면 클라이언트는 "무제한"으로 읽으므로,
    //  안내가 과하게 관대해질 뿐 차단은 서버 RPC가 그대로 한다.)
    // readQuotaSnapshot 자체는 예외를 던지지 않지만(내부에서 흡수해 "정보
    // 없음"으로 접는다, api/_lib/serviceAccess.ts 해당 함수 주석 참고) 그
    // 계약이 흔들리는 경우까지 대비해 fail-open을 유지한다.
    let quota: Awaited<ReturnType<typeof readQuotaSnapshot>>;
    try {
      quota = await readQuotaSnapshot(ctx.supabaseAdmin, userId, accessRow);
    } catch (quotaError) {
      console.error(
        "check-service-access quota lookup 실패(무시):",
        quotaError,
      );
      quota = await readQuotaSnapshot(ctx.supabaseAdmin, userId, null);
    }

    res.status(200).json({
      allowed,
      quotaRemaining: quota.quotaRemaining,
      quotaTotal: quota.quotaTotal,
      planEndsAt: quota.planEndsAt,
      planLabel: quota.planLabel,
    });
  },
});
