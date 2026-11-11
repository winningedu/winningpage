// 결제 확정 시 이용 권한(program_access)을 부여/회수하는 공용 모듈.
//
// 왜 별도 파일인가
//   부여 지점이 두 곳이다. 카드·간편결제는 api/_routes/confirm-payment.js 가 승인 직후
//   주문을 paid 로 확정할 때, 가상계좌는 api/_routes/toss-webhook.js 가 입금을 확인해
//   waiting_deposit → paid 로 전이할 때다. 같은 로직을 두 벌 두면 한쪽만
//   고쳐지는 사고가 나므로 여기로 모은다(api/_lib/supabaseAdmin.js 주석의
//   "신규 파일부터는 여기로 모은다" 방침).
//
// 부여만 있으면 손실이 난다 — 회수도 여기 둔다
//   즉시 입장은 "돈이 들어오면 즉시 열린다"는 뜻이고, 그 대칭인 "돈을 돌려주면
//   즉시 닫힌다"가 없으면 전액 환불받은 사용자가 무기한 이용한다.
//
// ---------------------------------------------------------------------
// 2026-08-12: 규칙이 JS 에서 DB(SQL 함수)로 내려갔다 — sql/64
// ---------------------------------------------------------------------
// 이 파일은 이제 **얇은 래퍼**다. 부여·회수의 실제 규칙은
// sql/64_entitlement_period_sessions.sql 의 두 SECURITY DEFINER 함수에 있다:
//   public.fn_grant_program_access_for_order(order_id, user_id, paid_at, restore_revoked)
//   public.fn_revoke_program_access_for_order(order_id, user_id, payment_status, reason)
//
// 왜 옮겼는가 (감사 결과 M1 / M6 / M15)
//   · M1 — 이용 기간·회차가 어디에도 없었다. products 에 기간·회차 컬럼이
//     없어서 이 파일은 "시작 시각"만 쓰고 만료를 일부러 비웠고(이 자리에 그
//     사실을 자백하는 주석이 있었다), 그래서 1개월권 구매자가 3년 뒤에도
//     들어갔다. 이제 products.duration_months / products.session_quota 가
//     정본이고, 기간 계산은 KST 달력 헬퍼(fn_add_months_kst)를 거친다 —
//     JS 의 Date 산술로는 1/31 + 1개월을 2/28 로 클램프할 수 없다.
//   · M6 — 어느 주문이 이 권한을 만들었는지 기록할 자리가 없었다. 그래서 B주문
//     환불이 A주문 권한까지 닫았다. 이제 program_access_grants(부여 원장)가
//     주문 라인 단위로 부여를 기록하고, program_access 는 그 원장에서 파생된
//     캐시다. 회수는 해당 주문의 원장 행만 닫고 캐시를 재계산한다.
//   · M15 — id/profile_id/user_id 등호 제약이 없어 판정(3컬럼 OR)과
//     회수(id 1컬럼)가 비대칭이었다. sql/64 4)절 CHECK 이 그 등호를 강제한다.
//
//   기간·회차 계산과 캐시 재계산을 JS 에 두면 부여 경로(여기)와 소비 경로
//   (dev 에 배포된 public.consume_performance_credit — program_access.meta 의
//   quota_total/quota_used 를 읽는다)가 서로 다른 진실을 갖게 된다. 트랜잭션
//   경계·행 잠금·달력 산술이 모두 DB 쪽에 있어야 성립하는 계산이라 SQL 로
//   내렸다.
//
// 무엇이 그대로인가 (호출부 계약)
//   · **절대 throw 하지 않는다.** 결제 승인은 이미 났으므로 부여 실패가 승인
//     흐름을 되돌리면 안 되고, 대신 결과 객체로 실패 사실을 돌려준다.
//   · 반환 형태 { ok, granted, serviceKeys, skipped, error } 를 유지한다.
//     src/pages/PaymentSuccess.jsx 가 access.ok / access.error /
//     access.granted 세 필드에 의존한다(granted 는 입장 CTA 개수를 만든다).
//   · error 문자열 어휘도 유지한다 — PaymentSuccess 의
//     PERMANENT_ACCESS_ERRORS(order_has_no_user / order_not_found /
//     no_order_items / missing_order_id / supabase_admin_unavailable)가
//     "새로고침하면 자동 재시도" 안내를 붙일지 말지를 이 문자열로 가른다.
//   · skipped 의 이유 문자열(no_program_key_mapping / suspended_by_admin /
//     revoked_not_restored)도 RPC 가 같은 값으로 돌려준다.

import type { SupabaseClient } from "@supabase/supabase-js";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

// 회수된 행의 payment_status. CHECK 값(unpaid|pending|paid|refunded|cancelled)
// 중 "돈을 돌려줬다" = refunded, "돈이 들어온 적 없이 종결" = cancelled 다.
//
// 이 상수는 sql/64 9)절 fn_revoke_program_access_for_order 안의 어휘와 **같은
// 값이어야 한다.** 그 함수가 허용값을 다시 정규화하지만, 값이 갈리면 회수된 행이
// 재부여 보호(revoked_not_restored)를 못 받는다.
const REVOKED_PAYMENT_STATUSES: string[] = ["refunded", "cancelled"];

// SQLSTATE → error 문자열. sql/64 가 배정한 코드는 WC010~WC012 다.
// order_not_found 만 PaymentSuccess 의 PERMANENT_ACCESS_ERRORS 에 이미 있다 —
// 나머지 둘은 구조적으로 도달 불가에 가깝다(소유자 확인은 confirm-payment 가
// 이미 하고, 상품 스펙 누락은 products_entitlement_shape_check 가 막는다).
const RPC_ERROR_BY_SQLSTATE: Record<string, string> = {
  WC010: "order_not_found",
  WC011: "order_user_mismatch",
  WC012: "product_entitlement_spec_missing",
};

// RPC 가 돌려주는 error 객체는 벤더(PostgrestError) 형태에 의존하고 이 파일은
// code/message 두 필드만 읽으므로, 그 최소 형태만 명시한다.
type RpcErrorLike = { code?: string; message?: string } | null | undefined;

function rpcErrorText(error: RpcErrorLike): string {
  const mapped = RPC_ERROR_BY_SQLSTATE[clean(error?.code)];
  if (mapped) return mapped;
  return clean(error?.message) || "rpc_failed";
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * 주문 하나에 대해 이용 권한을 부여한다. **호출자가 "돈이 들어왔다"를 확인한
 * 뒤에만** 부를 것(가상계좌 waiting_deposit 에서는 부르면 안 된다).
 *
 * @param {object} options
 * @param {boolean} [options.restoreRevoked=false]
 *        회수된 행(payment_status refunded|cancelled)까지 되살릴지. **새 결제가
 *        방금 승인된 경로에서만 true** 다(재구매는 되살아나야 한다). 멱등 재응답·
 *        웹훅 재전송 같은 "재시도" 경로는 false — 그 경로는 새 돈이 들어온 근거가
 *        없으므로 환불 회수를 되돌릴 권한이 없다. 부여는 복구용이지 제재 해제용이
 *        아니다.
 *        access_status='suspended'(운영자 제재)는 어느 경로에서도 덮지 않는다 —
 *        해제는 운영자의 판단이고, 결제로 자동 해제되면 제재가 무력화된다.
 *        (두 보호 모두 이제 sql/64 8)절 (d)/(e) 단계에 있다.)
 *
 * @returns ok=true 는 "부여 시도가 에러 없이 끝났다"는 뜻이다. 매핑되는 상품이
 *          없으면 ok=true + granted=[] + skipped 에 이유가 담긴다.
 *          granted 는 "이 주문으로 지금 권한이 살아 있는 program_key" 전체이므로
 *          멱등 재호출(성공 페이지 새로고침)에도 같은 값이 돌아온다.
 */
export type AccessSkipReason = {
  program_key?: string | null;
  product_slug?: string | null;
  reason: string;
};

export type GrantProgramAccessOptions = {
  orderId?: string;
  userId?: string;
  paidAt?: string | null;
  restoreRevoked?: boolean;
};

export type GrantProgramAccessResult = {
  ok: boolean;
  granted: string[];
  serviceKeys: string[];
  skipped: AccessSkipReason[];
  error: string | null;
  ledgerInserted?: number;
};

export async function grantProgramAccessForOrder(
  supabaseAdmin: SupabaseClient | null,
  {
    orderId,
    userId,
    paidAt,
    restoreRevoked = false,
  }: GrantProgramAccessOptions = {},
): Promise<GrantProgramAccessResult> {
  const result: GrantProgramAccessResult = {
    ok: false,
    granted: [],
    serviceKeys: [],
    skipped: [],
    error: null,
  };

  if (!supabaseAdmin) {
    // confirm-payment.js 의 createSupabaseAdmin() 은 env 누락 시 null 을 주고도
    // 결제 승인을 계속 진행한다. 그 상태를 조용히 넘기지 않고 드러낸다.
    result.error = "supabase_admin_unavailable";
    return result;
  }
  if (!clean(orderId)) {
    result.error = "missing_order_id";
    return result;
  }

  const accessId = clean(userId);
  if (!accessId) {
    // 비회원 결제는 orders.user_id 가 null 이라 권한을 줄 대상이 없다.
    // 운영자 수동 처리 대상. RPC 에도 같은 방어가 있지만(orders.user_id is
    // null → skipped), 여기서 먼저 끊어야 PaymentSuccess 가 '영구 실패 +
    // 회원가입 안내'를 띄운다(PERMANENT_ACCESS_ERRORS 에 order_has_no_user 가
    // 있다).
    //
    // 2026-08-12 갱신: 신규 주문에서는 이 분기가 도달 불가에 가깝다 — 비회원
    // 결제는 api/create-order.js 가 서버에서 거부하고(감사 M5),
    // sql/67_orders_user_id_not_null.sql 이 걸렸다면 orders.user_id 자체가
    // NULL 을 못 받는다. 그래도 지우지 않는다: DB 제약을 걸지 못했을 가능성
    // (그 파일의 판단 근거 참고)과 차단 이전 레거시 행에 대한 방어로 남긴다.
    result.error = "order_has_no_user";
    return result;
  }

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "fn_grant_program_access_for_order",
      {
        p_order_id: clean(orderId),
        p_user_id: accessId,
        p_paid_at: clean(paidAt) || null,
        p_restore_revoked: Boolean(restoreRevoked),
      },
    );

    if (error) {
      result.error = rpcErrorText(error);
      return result;
    }

    const payload = data || {};
    result.granted = toArray<string>(payload.granted)
      .map(clean)
      .filter(Boolean);
    result.serviceKeys = toArray<string>(payload.service_keys)
      .map(clean)
      .filter(Boolean);
    result.skipped = toArray<AccessSkipReason>(payload.skipped);
    // 주문 라인이 0건인 경우 RPC 가 ok=false + error='no_order_items' 를 준다.
    result.ok = payload.ok === true;
    result.error = result.ok ? null : clean(payload.error) || "grant_failed";
    // 진단용. api/_routes/confirm-payment.js·api/_routes/toss-webhook.js 가 로그에 싣는다.
    result.ledgerInserted = Number(payload.ledger_inserted ?? 0);
    return result;
  } catch (err) {
    result.error = String(err?.message ?? err);
    return result;
  }
}

/**
 * 주문 하나에 대해 이용 권한을 회수한다. 결제가 취소·환불·만료로 종결된 뒤에만
 * 부를 것. 부여와 대칭이며 절대 throw 하지 않는다.
 *
 * 없던 권한 행을 만들지 않는다 — 회수는 "이미 있는 권한을 닫는" 동작이다.
 * 부여된 적이 없으면(가상계좌 미입금 EXPIRED, 매핑 없는 상품만 산 주문) 원장
 * 0행 + 캐시 update 0행으로 멱등하게 끝난다(sql/64 7)절 참고).
 *
 * 이 주문의 원장 행만 닫는다
 *   예전에는 (user, program_key) 전체를 닫아서, 같은 프로그램을 두 주문으로 산
 *   사용자가 한 주문만 환불하면 나머지 권한까지 죽었다(M6). 이제 회수는
 *   program_access_grants 에서 **그 주문의 행만** revoked_at 으로 닫고, 남아
 *   있는 다른 주문의 부여로 기간·회차를 재계산한다.
 *
 * @param options.orderId
 * @param options.userId  주문자(orders.user_id). 없으면 회수 대상 없음.
 * @param options.paymentStatus  돈을 돌려준 취소는 refunded, 입금된 적 없이
 *        종결된 건(미입금 만료·승인 전 취소)은 cancelled.
 *        program_access_payment_status_check 허용값이다. 기본값 'refunded'.
 */
export type RevokeProgramAccessOptions = {
  orderId?: string;
  userId?: string | null;
  paymentStatus?: "refunded" | "cancelled";
};

export type RevokeProgramAccessResult = {
  ok: boolean;
  revoked: string[];
  serviceKeys: string[];
  skipped: AccessSkipReason[];
  error: string | null;
  ledgerClosed?: number;
};

export async function revokeProgramAccessForOrder(
  supabaseAdmin: SupabaseClient | null,
  {
    orderId,
    userId,
    paymentStatus = "refunded",
  }: RevokeProgramAccessOptions = {},
): Promise<RevokeProgramAccessResult> {
  const result: RevokeProgramAccessResult = {
    ok: false,
    revoked: [],
    serviceKeys: [],
    skipped: [],
    error: null,
  };

  if (!supabaseAdmin) {
    result.error = "supabase_admin_unavailable";
    return result;
  }
  if (!clean(orderId)) {
    result.error = "missing_order_id";
    return result;
  }

  const accessId = clean(userId);
  if (!accessId) {
    // 비회원 결제는 부여된 적이 없으니 회수할 것도 없다(부여 측 order_has_no_user
    // 와 같은 이유). 에러가 아니라 no-op 이다.
    // 2026-08-12: grantProgramAccessForOrder 쪽과 같은 이유로 신규 주문에서는
    // 도달 불가에 가깝지만, 레거시/제약 미적용 대비로 남긴다.
    result.ok = true;
    result.skipped.push({ reason: "order_has_no_user" });
    return result;
  }

  const nextPaymentStatus = REVOKED_PAYMENT_STATUSES.includes(
    clean(paymentStatus),
  )
    ? clean(paymentStatus)
    : "refunded";

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "fn_revoke_program_access_for_order",
      {
        p_order_id: clean(orderId),
        p_user_id: accessId,
        p_payment_status: nextPaymentStatus,
        p_reason: "order_revoked",
      },
    );

    if (error) {
      result.error = rpcErrorText(error);
      return result;
    }

    const payload = data || {};
    result.revoked = toArray<string>(payload.revoked)
      .map(clean)
      .filter(Boolean);
    result.skipped = toArray<AccessSkipReason>(payload.skipped);
    result.ok = payload.ok === true;
    if (!result.ok) result.error = clean(payload.error) || "revoke_failed";
    result.ledgerClosed = Number(payload.ledger_closed ?? 0);
    return result;
  } catch (err) {
    result.error = String(err?.message ?? err);
    return result;
  }
}
