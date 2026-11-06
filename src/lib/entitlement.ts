// 로컬 QA 전용 "이용권(유료 결제) 보유" 가정 플래그.
// 사용법: .env.local에 VITE_FAKE_ENTITLEMENT=true 를 추가하고 개발 서버를 재시작한다.
// import.meta.env.DEV를 반드시 함께 검사한다 — 프로덕션 빌드는 항상 DEV=false이므로,
// 이 값이 실수로 환경변수에 들어가도(Vercel 등) 프로덕션 번들에서는 활성화가 절대 불가능하다.
// 플래그 단독으로 판정하면 그 안전장치가 사라진다.
//
// 서버(api/_lib/serviceAccess.js의 hasPaidServiceAccess())는 이 플래그를 전혀 모른다.
// 여기는 프런트 표시 전용이며, 실제 결제 게이트 우회는 src/lib/paidServiceAccess.js의
// VITE_DISABLE_PAID_GATE가 담당한다. 두 플래그는 역할이 다르다(.env.example 참고).
export const FAKE_ENTITLEMENT_ENABLED =
  import.meta.env.DEV === true &&
  import.meta.env.VITE_FAKE_ENTITLEMENT === "true";

// MyPage.jsx가 orders 테이블에서 읽는 컬럼(id, order_name, amount, paid_at)과
// 형태를 맞춘 가짜 결제 내역. id는 실제 UUID와 절대 혼동되지 않도록 'dev-fake-' 접두어를 쓴다
// (submitRefund가 이 id로 refund_requests.order_id를 채우는 경로에 실수로 흘러들면
// DB에 존재하지 않는 order_id가 저장되므로, 호출부는 반드시 이 항목들을 환불 대상에서
// 제외해야 한다 — is_fake_entitlement 플래그로 구분한다).
export type MockPaidOrder = {
  id: string;
  order_name: string;
  amount: number;
  paid_at: string;
  is_fake_entitlement: true;
};

export function getMockPaidOrders(): MockPaidOrder[] {
  const now = new Date().toISOString();

  return [
    {
      id: "dev-fake-goal-12m",
      order_name: "[12개월] 위닝 목표관리",
      amount: 252000,
      paid_at: now,
      is_fake_entitlement: true,
    },
    {
      id: "dev-fake-suhaeng-6",
      order_name: "[3개월 6회 이용권] 위닝 수행평가",
      amount: 24000,
      paid_at: now,
      is_fake_entitlement: true,
    },
  ];
}

import { apiFetch, getAuthHeader } from "./apiFetch";
import { parseTenantReason, type TenantBlockReason } from "./tenantBlock";

// 이용권 판정은 서버 한 곳(api/_lib/serviceAccess.js hasPaidServiceAccess, program_access +
// admin_enrollments 조회)이 정본이다. 이 모듈은 그 판정을 다시 구현하지 않고
// /api/check-service-access를 호출해 물어보기만 한다.
//
// 과거(2026-08-10 이전) 이 함수는 orders 테이블을 직접 status='paid' + order_name 키워드
// 매칭으로 조회했다. 서버 규칙(program_access/admin_enrollments 기준)과 완전히 달라서
// program_access에만 기록된 결제자가 부당하게 차단되고, orders 행만 있는 사람은 통과하는
// 불일치가 있었다. 게다가 admin_enrollments는 RLS가 is_admin() 전용이라 일반 사용자
// 세션으로는 애초에 클라이언트에서 서버 규칙을 재현할 수 없었다. 그래서 조회를 서버로
// 옮겼다 — 아래 함수는 그 엔드포인트를 부르기만 한다.
//
// 로컬 개발(npm run dev, Vite 단독) 주의: api/ 는 Vercel 서버리스 함수라 Vite 개발 서버만
// 띄우면 /api/check-service-access가 존재하지 않는다(404 등) → 아래에서 항상 null(판정
// 불가)로 떨어진다. 이 상황을 우회하려고 있는 게 FAKE_ENTITLEMENT_ENABLED(위 플래그)다 —
// .env.local에 VITE_FAKE_ENTITLEMENT=true를 켜면 네트워크 호출 없이 즉시 true를 반환한다.
// api/ 가 함께 뜨는 환경(vercel dev 등)이 아니라면 로컬에서는 이 플래그가 사실상 필수다.
//
// 반환값 계약(호출부, 특히 RequireGoalAccess.jsx가 반드시 구분해야 함):
//   - FAKE_ENTITLEMENT_ENABLED가 켜져 있으면 조회 없이 즉시 true.
//   - 로그인 세션이 없으면 null(판정 불가) — "로그인 안 됨"과 "이용권 없음"은 서로 다른
//     사유다. 로그인 판정 자체는 가드의 1단계 책임이므로 여기서 false를 단정하지 않는다.
//   - serviceKey를 서버가 모르면(400) null — 판정 기준 자체가 없다는 뜻.
//   - 네트워크 오류·5xx 등 호출 자체가 실패하면 null(판정 불가). false로 단정하면 서버
//     장애 중인 결제 사용자를 결제 페이지로 잘못 보내게 된다 — 호출부는 null을 받으면
//     "미보유"로 취급해 곧장 리다이렉트하지 말고, 재시도 UI를 보여주거나 최소한 그
//     자리에 머무르게 해야 한다(RequireGoalAccess.jsx 참고).
//   - 그 외에는 서버가 준 실제 판정(true/false)을 그대로 반환한다.
export type EntitlementResult = {
  allowed: boolean | null;
  quotaRemaining: number | null;
  quotaTotal: number | null;
  planEndsAt: string | null;
  planLabel: string | null;
  /** 스쿨멘토 기관 거부 사유. 위닝 응답에는 없어 null 이다. */
  tenantReason: TenantBlockReason | null;
  /** 스쿨멘토 한도 종류(남은 횟수가 작은 쪽). 위닝은 null. */
  limitKind: "month" | "term" | null;
};

// fetchEntitlement — hasEntitlement의 상위 집합. 판정(allowed)에 더해 회차·플랜
// 정보를 함께 돌려준다. 수행평가 셸(SessionContext)이 사이드바 "남은 횟수"와
// §5.20 소진 배너를 그리려면 boolean 하나로는 부족해서 추가했다.
//
// allowed의 계약은 hasEntitlement와 **완전히 같다**(true/false/null 3값, null은
// "판정 불가"). 회차 필드는 다음과 같이 읽는다.
//
//   quotaRemaining === null  →  **무제한**(0이 아니다). 서버가 값을 모르는
//                               경우도 여기로 떨어진다 — 회차 개념이 없는
//                               서비스(goal), program_access 행이 없는 사용자
//                               (admin_enrollments 경로), meta 미설정 등.
//   quotaRemaining === 0     →  소진. 셸 진입은 계속 허용하고(§2.2 결정)
//                               새 세션 시작만 막는 안내를 띄운다.
//   quotaRemaining > 0       →  잔여 회차.
//
// ⚠️ 이 값은 안내용이다. 실제 차단 권위는 서버의 차감 RPC이며, 화면이 잔여
//    회차를 1로 알고 있어도 다른 탭이 먼저 쓰면 api/performance/*가
//    409 QUOTA_EXHAUSTED를 돌려준다. 클라이언트는 그 409를 정상 분기로
//    처리해야 하고, 이 값으로 선제 차단을 구현하면 안 된다(명세서 §2.2, §9.3).
export async function fetchEntitlement(
  serviceKey: string,
): Promise<EntitlementResult> {
  const empty = {
    quotaRemaining: null,
    quotaTotal: null,
    planEndsAt: null,
    planLabel: null,
    tenantReason: null,
    limitKind: null,
  };

  // 로컬 QA 플래그. 서버를 부르지 않으므로 회차는 알 수 없다 → 무제한(null)로
  // 둔다. 소진 UI를 로컬에서 보려면 플래그를 끄고 vercel dev로 실제 응답을 받아야 한다.
  if (FAKE_ENTITLEMENT_ENABLED) return { allowed: true, ...empty };

  const authHeader = await getAuthHeader();
  if (!authHeader) return { allowed: null, ...empty };

  try {
    const response = await apiFetch(
      "/api/check-service-access",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ service_key: serviceKey }),
      },
      { timeoutMs: 15000 },
    );

    let result: {
      allowed?: boolean;
      quotaRemaining?: number;
      quotaTotal?: number;
      planEndsAt?: string | null;
      planLabel?: string | null;
      tenantReason?: unknown;
      limitKind?: unknown;
      detail?: string;
    } = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      console.error(
        "[entitlement] check-service-access 실패:",
        response.status,
        result?.detail,
      );
      return { allowed: null, ...empty };
    }

    return {
      allowed: result?.allowed === true,
      // 구버전 서버(회차 필드 이전 배포)가 응답하면 키 자체가 없다 →
      // undefined가 아니라 null로 정규화해 호출부가 항상 3값만 보게 한다.
      quotaRemaining: normalizeQuota(result?.quotaRemaining),
      quotaTotal: normalizeQuota(result?.quotaTotal),
      planEndsAt: result?.planEndsAt ?? null,
      planLabel: result?.planLabel ?? null,
      tenantReason: parseTenantReason(result?.tenantReason),
      limitKind:
        result?.limitKind === "month" || result?.limitKind === "term"
          ? result.limitKind
          : null,
    };
  } catch (error) {
    console.error("[entitlement] check-service-access 호출 오류:", error);
    return { allowed: null, ...empty };
  }
}

function normalizeQuota(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}
