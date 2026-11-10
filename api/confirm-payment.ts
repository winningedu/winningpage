// Vercel 서버리스 함수: 토스페이먼츠 결제 승인
//
// 브라우저(success 페이지)가 paymentKey/orderId/amount 를 보내면,
// 이 함수가 "시크릿 키"로 토스 승인 API를 호출한다.
// 시크릿 키는 절대 프론트에 두지 말고, 여기(서버 환경변수 TOSS_SECRET_KEY)에만 둔다.
//
// 필요 환경변수:
//   TOSS_SECRET_KEY                 (예: test_sk_xxxxxxxx)
//   결제-사용자 매핑/저장용 Supabase(필수 — 미설정 시 토스 승인 호출 전에 500):
//   WINNING_SUPABASE_URL / SUPABASE_URL / VITE_SUPABASE_URL
//   WINNING_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY / WINNING_SUPABASE_KEY / SUPABASE_KEY
//
// 하드닝 변경 요약(임무 d):
//   - 주문 조회에 approval_status/payment_key 를 포함시켜 승인 호출 전 게이트를
//     추가했다: 미승인(approval_status<>'approved') 409, refunded 409,
//     paid+동일 payment_key 는 재승인 호출 없이 200 멱등 응답, paid+다른 키는 409.
//     (sql/68 orders_approval_before_payment_check 의 "학부모 수락 전 결제 불가"
//     불변식을 API 층에서도 선반영한다 — DB 는 최후 방어선일 뿐이다.)
//   - 토스 승인 응답이 ALREADY_PROCESSED_PAYMENT 계열이면 실패로 확정하지 않고
//     토스 결제 조회 API로 실제 상태를 다시 얻어 성공 경로에 합류시킨다(멱등
//     재시도 복구 — api/toss-webhook.js 의 상태-정본-재조회 패턴과 동일).
//   - 승인 후 최종 orders UPDATE 는 status 가 pending/failed 일 때만 적용되도록
//     가드하고(동시 웹훅 등 레이스로 이미 종결된 주문을 덮어쓰지 않는다), 갱신
//     실패나 영향 0행은 조용히 200 으로 삼키지 않고 500 + payment_key 로그로
//     드러낸다 — 승인은 났는데 기록이 안 된 상태를 사용자가 "성공"으로 오인하지
//     않게 한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  type GrantProgramAccessOptions,
  grantProgramAccessForOrder,
} from "./_lib/programAccess.js";
import {
  isQaAccount,
  QA_ACCOUNT_RESTRICTED_CODE,
  sendQaBlocked,
} from "./_lib/qaAccount.js";
import { getBearerToken } from "./_lib/serviceAccess.js";
import {
  createSupabaseAdmin,
  isSupabaseConfigError,
} from "./_lib/supabaseAdmin.js";

// 토스 결제 승인(POST /v1/payments/confirm)·조회(GET .../orders/{orderId}) 두
// 응답 모두 이 라우트가 실제로 읽는 필드만 담는다. 실패 응답의 code/message도
// 같은 JSON 변수(`data`)로 받으므로 여기 포함한다.
type TossPaymentResponse = {
  status?: string;
  method?: string | null;
  code?: string;
  message?: string;
  [key: string]: unknown;
};

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";
const TOSS_ORDER_QUERY_URL = "https://api.tosspayments.com/v1/payments/orders";

// orders.status 허용값: pending | paid | waiting_deposit | failed | canceled
//
// waiting_deposit 은 가상계좌 전용이다. 가상계좌는 승인 API가 성공해도 그건
// "계좌가 발급됐다"는 뜻일 뿐 돈이 들어온 게 아니다(토스 status =
// WAITING_FOR_DEPOSIT). 예전에는 이 경우에도 paid + paid_at=now() 를 찍어서
// 미입금 주문이 결제완료로 보였다. 실제 입금은 api/toss-webhook.js 가 받아
// paid 로 전이시킨다.
const STATUS_PENDING = "pending";
const STATUS_PAID = "paid";
const STATUS_WAITING_DEPOSIT = "waiting_deposit";
// canceled 는 api/toss-webhook.js 가 기록하는 종결 상태다(CANCELED/PARTIAL_CANCELED/
// EXPIRED). 취소된 주문에 승인 API를 재호출하면 "이미 처리된 결제" 에러가 돌아오고,
// 그 에러를 실패로 기록하면 canceled 이력이 failed 로 덮여 환불 정산에서 취소와
// 승인실패를 구분할 수 없게 된다. 그래서 호출 전에 끊는다.
// failed 는 종결로 취급하지 않는다 — 토스 일시 장애(5xx)로도 찍히므로 재시도로
// 복구될 수 있어야 한다(실패 기록이 pending 만 덮으므로 재시도 자체는 안전하다).
const STATUS_CANCELED = "canceled";
const STATUS_FAILED = "failed";
// refunded 는 fn_complete_refund 로만 도달하는 종결 상태다(웹훅/토스 응답으로는
// 오지 않는다). 재승인 호출을 걸어 부활을 막는다 — DB 트리거(sql/71 WC039)가
// orders.status 를 refunded 에서 되돌리는 UPDATE 자체를 막는 이중 방어선이다.
const STATUS_REFUNDED = "refunded";
const APPROVAL_APPROVED = "approved";

// orders 테이블 select("id, user_id, amount, status, approval_status,
// payment_key, paid_at, raw")의 결과 행 모양. supabase-js 클라이언트가
// 제네릭 타입 없이 생성돼 있어(createSupabaseAdmin) select 결과가 자동으로
// 좁혀지지 않는다 — 아래에서 실제로 읽는 필드만 담는다.
type OrderRow = {
  id: string;
  user_id: string | null;
  parent_profile_id: string | null;
  amount: number;
  status: string;
  approval_status: string;
  payment_key: string | null;
  paid_at: string | null;
  raw: TossPaymentResponse | null;
};

// 토스 "이미 처리된 결제" 계열 오류 코드. 정확한 코드명이 SDK 버전에 따라
// 갈릴 수 있어 접두어로도 잡는다 — 이 경우는 우리 쪽 실패가 아니라 이전 시도가
// 이미 토스 승인을 받았다는 뜻이므로 실패 확정 대신 조회로 되돌아가야 한다.
function isAlreadyProcessedTossError(code: unknown) {
  const value = clean(code);
  return (
    value === "ALREADY_PROCESSED_PAYMENT" ||
    value.startsWith("ALREADY_PROCESSED")
  );
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function getEnv(...keys: string[]) {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return "";
}

// 부여를 시도조차 하지 않은 경우의 응답 형태. grantProgramAccessForOrder 의
// 반환 형태와 같게 유지해서 프런트(src/pages/PaymentSuccess.jsx)가 한 가지
// 모양만 보게 한다.
function accessNotAttempted(reason: string) {
  return {
    ok: false,
    granted: [],
    serviceKeys: [],
    skipped: [],
    error: reason,
  };
}

// 즉시 입장 모델(사용자 확정): 돈이 들어온 주문은 승인 직후 권한을 준다.
// 부여 실패가 결제 승인을 되돌리면 안 되므로(승인은 이미 났다) 로그만 남기고
// 결제 성공 응답을 유지한다. 대신 실패 사실은 응답 access 필드로 드러낸다 —
// 그래야 사용자가 '프로그램 시작하기' 대신 문의 안내를 보고, 운영자가 로그로
// 복구할 수 있다. 성공 페이지를 새로고침하면 멱등 upsert 로 자동 재시도된다.
async function grantAndLog(
  supabaseAdmin: SupabaseClient,
  {
    orderId,
    userId,
    paidAt,
    restoreRevoked,
  }: {
    orderId: string;
    userId: string;
    paidAt: string | null;
    restoreRevoked?: boolean;
  },
) {
  const access = await grantProgramAccessForOrder(supabaseAdmin, {
    orderId,
    userId,
    paidAt,
    restoreRevoked,
  } as GrantProgramAccessOptions);
  if (!access.ok) {
    console.error("program_access grant failed:", orderId, access.error);
  } else {
    // 원장(program_access_grants)에 실제로 새로 들어간 행 수. 0 이면 멱등
    // 재호출(이미 부여됨)이라는 뜻이고, granted 는 그래도 살아있는 program_key
    // 를 돌려준다 — 새로고침으로 CTA 가 사라지지 않는다(sql/64 8)절 6단계).
    console.log(
      "program_access granted:",
      orderId,
      access.granted,
      `ledger_inserted=${access.ledgerInserted ?? 0}`,
    );
  }
  return access;
}

// 멱등 재응답 경로의 재부여는 주문 소유자 본인만 트리거할 수 있어야 한다.
//
// 왜 여기만 인증을 거는가
//   이 엔드포인트는 결제 승인 자체를 위해 열려 있어야 한다(승인의 근거는 토스
//   승인 API 응답이고, 비회원 결제도 승인은 되어야 한다). 그런데 "이미 paid 인
//   주문"으로 들어오면 토스 호출도 금액 비교도 없이 곧장 권한 부여가 실행된다 —
//   성공 URL 을 북마크에서 다시 열거나 orderId 하나만 아는 요청 한 번으로 남의
//   권한 상태를 되돌릴 수 있다는 뜻이다. 그래서 "새 승인"에는 인증을 걸지 않고
//   (근거가 토스에 있다) "재부여"에만 소유자 확인을 건다.
//   프런트는 이미 세션 토큰을 실어 보낸다(src/pages/PaymentSuccess.jsx:236-240).
async function isOrderOwner(
  supabaseAdmin: SupabaseClient,
  req: VercelRequest,
  order: { user_id: string | null },
) {
  const token = getBearerToken(req);
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return false;

  return clean(data.user.id) === clean(order.user_id);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { paymentKey, orderId, amount } = req.body || {};

    if (!paymentKey || !orderId || !amount) {
      return res
        .status(400)
        .json({ error: "필수 파라미터 누락(paymentKey/orderId/amount)" });
    }

    const secretKey = getEnv("TOSS_SECRET_KEY");
    if (!secretKey) {
      return res
        .status(500)
        .json({ error: "서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다." });
    }

    let supabaseAdmin: SupabaseClient;
    try {
      supabaseAdmin = createSupabaseAdmin();
    } catch (err) {
      if (isSupabaseConfigError(err)) {
        return res
          .status(500)
          .json({ error: "서버 설정이 올바르지 않습니다." });
      }
      throw err;
    }

    // 서버가 생성한 주문의 금액을 신뢰값으로 사용한다. (클라이언트가 보낸 amount 는 검증용)
    let order: OrderRow | null = null;
    const { data: orderQueryData } = await supabaseAdmin
      .from("orders")
      // user_id / paid_at 은 권한 부여용이다(부여 대상 사용자 + 이용 시작 시각).
      // approval_status/payment_key 는 승인 호출 전 게이트용이다(아래).
      .select(
        "id, user_id, parent_profile_id, amount, status, approval_status, payment_key, paid_at, raw",
      )
      .eq("id", orderId)
      .maybeSingle();
    order = orderQueryData ?? null;

    if (order) {
      // QA 계정의 주문(결제 대상 학생이나 결제하는 학부모가 QA)은 승인하지 않는다.
      // 토스 승인은 실제 돈을 움직이고, 승인된 주문은 실제 환불 업무가 된다.
      for (const profileId of [order.user_id, order.parent_profile_id]) {
        if (profileId && (await isQaAccount(supabaseAdmin, profileId))) {
          return sendQaBlocked(res, "error", QA_ACCOUNT_RESTRICTED_CODE);
        }
      }

      // 학부모 수락 전에는 결제가 진행될 수 없다(sql/68
      // orders_approval_before_payment_check). paid/waiting_deposit 인 주문은
      // DB 불변식상 이미 approved 여야 하므로 이 게이트에 걸리지 않는다 — 실제로
      // 걸리는 대상은 미승인 상태에서 승인 호출을 시도하는 pending 주문이다.
      if (order.approval_status !== APPROVAL_APPROVED) {
        return res.status(409).json({
          error: "학부모 승인이 완료되지 않은 주문입니다.",
          status: order.status,
          approvalStatus: order.approval_status,
        });
      }

      if (order.status === STATUS_REFUNDED) {
        // 이미 환불 종결된 주문의 재승인 호출 — 부활 금지.
        return res
          .status(409)
          .json({ error: "이미 환불된 주문입니다.", status: order.status });
      }

      if (
        order.status === STATUS_PAID ||
        order.status === STATUS_WAITING_DEPOSIT
      ) {
        if (order.status === STATUS_PAID) {
          // paid 인데 저장된 payment_key 와 요청 paymentKey 가 다르면 같은 주문에
          // 대한 별개의 결제 시도다 — 멱등 응답 대상이 아니라 막아야 한다.
          const storedKey = clean(order.payment_key);
          if (!storedKey || storedKey !== clean(paymentKey)) {
            return res.status(409).json({
              error: "이미 처리된 결제입니다.",
              status: order.status,
            });
          }
        }
        // 이미 승인된 주문 (성공 페이지 재요청/새로고침 등) → 저장해둔 승인 원본으로 멱등 응답.
        // waiting_deposit 도 여기서 걸러야 한다. 안 그러면 미입금 상태에서 새로고침할 때마다
        // 토스 승인 API를 재호출한다.
        const raw = order.raw || {};
        // 이미 paid 인 주문은 여기서 부여를 한 번 더 시도한다. 첫 승인 때
        // 부여가 실패했더라도(결제는 성공 처리되므로) 성공 페이지 재방문으로
        // 복구된다. waiting_deposit 은 아직 돈이 안 들어왔으므로 부여 금지 —
        // 입금 확인 시 api/toss-webhook.js 가 부여한다.
        //
        // 단 이 재시도는 (a) 주문 소유자 본인만, (b) 회수·제재된 권한은 되살리지
        // 않는 모드로만 돈다(restoreRevoked 를 넘기지 않는다 = false). 새 돈이
        // 들어온 근거가 없는 호출이므로 "복구"까지만 허용하고 "복원"은 막는다.
        // any: accessNotAttempted()의 자리표시 모양과 grantAndLog가 돌려주는
        // grantProgramAccessForOrder 원본 payload 모양이 다르다(위 489행과 같은
        // 이유).
        let access: any;
        if (order.status !== STATUS_PAID) {
          access = accessNotAttempted("waiting_deposit");
        } else if (!clean(order.user_id)) {
          // 비회원 결제(orders.user_id = null). 부여 대상이 없다 — 소유자 확인
          // 이전에 걸러서 프런트가 '영구 실패' 로 안내할 수 있게 한다.
          access = accessNotAttempted("order_has_no_user");
        } else if (!(await isOrderOwner(supabaseAdmin, req, order))) {
          access = accessNotAttempted("not_order_owner");
        } else {
          access = await grantAndLog(supabaseAdmin, {
            orderId,
            userId: order.user_id!,
            paidAt: order.paid_at,
          });
        }

        return res.status(200).json({
          ...raw,
          // raw 에 토스 status(DONE | WAITING_FOR_DEPOSIT)가 들어 있다. raw 가 없는
          // 과거 주문을 위해 주문 상태에서 역산한 값을 폴백으로 둔다.
          status:
            raw.status ??
            (order.status === STATUS_PAID ? "DONE" : "WAITING_FOR_DEPOSIT"),
          orderId,
          totalAmount: order.amount,
          alreadyConfirmed: true,
          access,
        });
      }
      if (order.status === STATUS_CANCELED) {
        // 취소·만료로 종결된 주문. 성공 URL 재방문(히스토리·북마크)으로 여기까지 올 수
        // 있는데, 승인 API를 다시 부르면 실패가 돌아오는 것 말고는 얻을 게 없다.
        return res
          .status(409)
          .json({ error: "이미 처리된 결제입니다.", status: order.status });
      }
      if (Number(order.amount) !== Number(amount)) {
        return res
          .status(400)
          .json({ error: "주문 금액이 일치하지 않습니다." });
      }

      // P0-2: 승인 직전 쿠폰 재검증(sql/55_coupon_policy.sql fn_revalidate_order_coupons).
      // 30분 소프트 홀드가 풀린 뒤 결제해도 여기 없이는 아무도 막지 않아, 같은 쿠폰이
      // 서로 다른 두 paid 주문에 붙을 수 있었다(팀 보고 시나리오 참고). 이미 paid/
      // waiting_deposit/canceled 인 주문은 위에서 먼저 return 하므로 여기 도달하는
      // 주문은 pending(또는 이전 시도의 failed — failed 는 종결이 아니라 재시도
      // 가능, 위 STATUS_FAILED 주석 참고) 뿐이다. 멱등 재응답 경로(이미 paid 인
      // 주문)에는 이 재검증을 걸지 않는다 — 재검증이 제외하는 건 "이 주문 자신의"
      // redemption 뿐이라 자기참조 오류는 없지만, 이미 승인된 결제를 재확인 요청
      // 한 번으로 되돌릴 방법이 없어(카드 승인·즉시 입장 모두 기정사실) 걸어봐야
      // 사용자를 막을 수만 있고 구제할 수는 없기 때문이다.
      const { data: revalidateRows, error: revalidateError } =
        await supabaseAdmin.rpc("fn_revalidate_order_coupons", {
          p_order_id: orderId,
        });

      if (revalidateError) {
        // 돈이 걸린 판단: RPC 자체가 실패하면(네트워크·권한 오류) 쿠폰 이상 유무를 알
        // 수 없다. 낙관적으로 통과시키면 이 재검증이 막으려던 이중 사용을 그대로
        // 열어주고, 그 손실(쿠폰 부정 사용, 카드 승인·즉시 입장 확정)은 되돌릴 수
        // 없다. 반대로 막아서 생기는 비용은 되돌릴 수 있다 — STATUS_FAILED 는 종결이
        // 아니라 재시도 가능하도록 이미 설계돼 있어(위 STATUS_FAILED 주석), 사용자는
        // 같은 결제창에서 다시 승인을 시도할 수 있다. 그래서 fail-closed 를 택한다.
        console.error(
          "fn_revalidate_order_coupons 호출 실패:",
          revalidateError,
        );
        await supabaseAdmin
          .from("orders")
          .update({ status: STATUS_FAILED })
          .eq("id", orderId)
          .eq("status", STATUS_PENDING);
        // :249 의 "쿠폰이 실제로 무효" 문구와 다르다 — 여기는 재검증 RPC 호출
        // 자체가 실패한 경우(서버 장애)라 쿠폰 상태를 알 수 없다. 사용자가 할 수
        // 있는 건 재시도뿐이라 Login.jsx:116 과 같은 골격("~중 문제가
        // 발생했습니다. 다시 시도해 주세요.")을 쓴다. "취소되었습니다" 는 쓰지
        // 않는다 — 토스 승인 호출 전에 막는 경로라 결제가 일어난 적이 없다.
        return res.status(500).json({
          error:
            "결제 승인 확인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }

      const invalidCoupon = (revalidateRows || []).find(
        (row) => row.ok === false,
      );
      if (invalidCoupon) {
        // 이미 다른 paid 주문에 같은 쿠폰이 귀속돼 있는 등, 이 주문에 붙은 쿠폰이
        // 더 이상 유효하지 않다. 토스 승인 API를 아예 호출하지 않는다 — 승인 후
        // 취소로는 이미 발생한 이득(카드 포인트 적립, 즉시 입장)을 완전히 되돌릴 수
        // 없어 사전 차단이 유일한 방어선이다.
        await supabaseAdmin
          .from("orders")
          .update({ status: STATUS_FAILED })
          .eq("id", orderId)
          .eq("status", STATUS_PENDING);
        // 문구는 팀 리드가 승인한 코퍼스 규범 문자열이다(2026-08-11). "취소되었습니다"
        // 라고 쓰지 않는다 — 이 경로는 토스 승인 API를 호출하기 전에 막는 것이라
        // 결제가 일어난 적이 없다. couponId/reason 은 구조화 필드로 실어 클라이언트가
        // 사유를 판단하게 한다.
        return res.status(409).json({
          error:
            "적용한 쿠폰을 사용할 수 없어 결제를 진행하지 못했습니다. 쿠폰을 다시 선택해 주세요.",
          couponId: invalidCoupon.coupon_id,
          reason: invalidCoupon.reason,
        });
      }
    }

    // 토스 승인 API 호출. 주문이 있으면 DB 금액을, 없으면 요청 금액을 사용한다.
    const confirmAmount = order ? Number(order.amount) : Number(amount);
    const auth = Buffer.from(`${secretKey}:`).toString("base64");
    const tossRes = await fetch(TOSS_CONFIRM_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount: confirmAmount }),
    });

    let data: TossPaymentResponse = await tossRes.json();

    if (!tossRes.ok) {
      if (isAlreadyProcessedTossError(data?.code)) {
        // 우리 쪽 승인 요청이 실패로 보여도, 토스가 "이미 처리된 결제"라고
        // 답했다면 이전 시도(네트워크 유실로 응답만 못 받은 재시도 등)가 실제로는
        // 성공했다는 뜻이다. 실패로 확정하지 않고 토스 조회 API로 정본 상태를 다시
        // 얻어 아래 성공 경로에 그대로 합류시킨다(멱등 재시도 복구).
        const queryRes = await fetch(
          `${TOSS_ORDER_QUERY_URL}/${encodeURIComponent(orderId)}`,
          {
            headers: { Authorization: `Basic ${auth}` },
          },
        );
        const queried: TossPaymentResponse = await queryRes.json();

        // 재조회 status 게이트: ALREADY_PROCESSED 가 곧 "성공"을 뜻하지 않는다 —
        // 이전 시도가 승인까지는 갔지만 이후 취소/만료됐을 수 있다(1차 승인 성공 →
        // DB 확정 UPDATE 실패로 pending 잔존 → 토스 콘솔 취소/VA 만료 → 사용자가
        // 성공 URL 재시도 → confirm 이 ALREADY_PROCESSED → 재조회 status=CANCELED).
        // 여기서 무조건 성공 경로에 합류시키면 취소·환불된 결제가 paid 주문 +
        // 프로그램 권한(회수분 복원 포함)으로 부활한다. DONE/WAITING_FOR_DEPOSIT
        // 만 성공 경로 진입을 허용하고, 나머지(CANCELED/PARTIAL_CANCELED/EXPIRED/
        // ABORTED 등)는 orders 를 건드리지 않고 종결 상태 정리는 웹훅(mapStatus
        // 경로)에 맡긴다.
        const RECOVERABLE_TOSS_STATUSES = new Set([
          "DONE",
          "WAITING_FOR_DEPOSIT",
        ]);

        if (
          queryRes.ok &&
          RECOVERABLE_TOSS_STATUSES.has(queried?.status ?? "")
        ) {
          data = queried;
        } else if (queryRes.ok) {
          console.error(
            "이미 처리된 결제 재조회 성공했으나 상태가 회수 불가:",
            orderId,
            queried?.status,
          );
          return res.status(409).json({
            error: "이미 처리된 결제입니다.",
            status: queried?.status,
          });
        } else {
          console.error("이미 처리된 결제 재조회 실패:", orderId, queried);
          if (order) {
            await supabaseAdmin
              .from("orders")
              .update({ status: STATUS_FAILED })
              .eq("id", orderId)
              .eq("status", STATUS_PENDING);
          }
          return res.status(tossRes.status).json({
            error: data.message ?? "결제 승인 실패",
            code: data.code,
          });
        }
      } else {
        // 토스가 실패를 반환한 경우 (금액 위변조, 토스 승인 자체가 거절된 경우 등)
        // → 주문 실패 기록. 단 아직 승인 전인 주문(pending)만 덮어쓴다. 웹훅이
        // 먼저 canceled/paid 로 올려놓은 주문을 이 경로가 failed 로 지우면 취소
        // 이력과 승인실패가 구분되지 않고, paid_at 이 남은 채 status 만 failed 인
        // 모순 레코드가 생긴다.
        if (order) {
          await supabaseAdmin
            .from("orders")
            .update({ status: STATUS_FAILED })
            .eq("id", orderId)
            .eq("status", STATUS_PENDING);
        }
        return res.status(tossRes.status).json({
          error: data.message ?? "결제 승인 실패",
          code: data.code,
        });
      }
    }

    // 승인 성공 → 주문을 확정한다. 단 가상계좌는 아직 입금 전이므로 paid 로 올리지
    // 않고, 입금 시각을 뜻하는 paid_at 도 비워 둔다.
    const waitingForDeposit = data.status === "WAITING_FOR_DEPOSIT";
    // 즉시 입장의 '이용 시작일'은 이 값에서 파생된다(orders 스키마는 그대로 두고
    // paid_at 하나만 원천으로 쓴다 — 시작일/기간 컬럼을 새로 만들지 않는다).
    const paidAt = waitingForDeposit ? null : new Date().toISOString();

    // any: accessNotAttempted()의 자리표시 모양(camelCase serviceKeys)과 RPC가
    // 실제로 돌려주는 fn_grant_program_access_for_order payload(snake_case
    // service_keys/ledger_inserted 포함)가 서로 다른 모양이다(기존 동작, 주석
    // 그대로 유지 — 아래 access 대입부 주석 참고). 두 모양을 하나로 정확히
    // 타이핑하려면 RPC 반환 형태를 새로 정의해야 해서 이 파일 범위를 넘는다.
    let access: any = accessNotAttempted("order_not_found");

    if (order) {
      // orders 확정 UPDATE + 권한 부여를 한 트랜잭션으로 묶는다(sql/79
      // fn_finalize_paid_order) — 예전에는 이 둘이 별도 왕복이라 그 사이 크래시
      // 하면 "paid 인데 권한만 없는" 주문이 남았다.
      //
      // status 필터(p_require_pending_or_failed=true): pending(정상 최초 승인)
      // 또는 failed(토스 일시 장애 후 재시도 — 위 STATUS_FAILED 주석대로 failed 는
      // 종결이 아니다)일 때만 확정한다. 그 외(동시 웹훅 등 레이스로 이미
      // paid/canceled/refunded 로 바뀐 경우)는 RPC 내부 UPDATE 가 0 행으로 끝나
      // ok:false 를 돌려준다.
      //
      // amount 조건(p_confirm_amount): :251 에서 이 시점 이전에 order.amount 를
      // 확인했더라도, 그 확인과 이 호출 사이(토스 승인 왕복 포함)에 다른 학부모의
      // fn_respond_enrollment 가 이 주문의 30분 경과 redemption 을 void+원복
      // (discount_amount/amount 상향, sql/71) 시키면, 토스는 이미 지난
      // confirmAmount 로 승인됐는데 status 만 보고 통과해 "amount 는 원복됐지만
      // 실제 청구는 옛 금액" 인 paid 주문이 남는다(과소청구 기록 + 쿠폰 이중 사용
      // 가능). confirmAmount 와 현재 orders.amount 가 다르면 RPC 내부 UPDATE 를
      // 0 행으로 실패시켜 아래 500(승인 성공·기록 실패 — payment_key 로그 + 수동
      // 대조) 경로로 자연 합류시킨다. 신규 문구 없음.
      const { data: finalizeResult, error: finalizeError } =
        await supabaseAdmin.rpc("fn_finalize_paid_order", {
          p_order_id: orderId,
          p_status: waitingForDeposit ? STATUS_WAITING_DEPOSIT : STATUS_PAID,
          p_payment_key: paymentKey,
          p_method: data.method ?? null,
          p_paid_at: paidAt,
          p_raw: data,
          p_confirm_amount: confirmAmount,
          p_require_pending_or_failed: true,
          // 방금 토스 승인이 성공한 "새 결제"다. 이전에 환불로 회수된 권한이
          // 있어도 되살려야 한다(재구매) → true. 운영자 제재
          // (access_status='suspended')는 이 경로에서도 유지된다(RPC 내부 위임).
          p_restore_revoked: true,
        });

      if (finalizeError || !finalizeResult?.ok) {
        // 토스 승인은 이미 성공했다 — 여기서 200 을 돌려주면 돈은 들어왔는데 우리
        // 기록·권한 부여는 빠진 채로 사용자가 성공으로 오인한다. 권한 부여는
        // 스킵하고 paymentKey 를 로그에 남겨 운영자가 토스 콘솔과 수동 대조할 수
        // 있게 한 뒤 500 으로 재시도를 유도한다.
        console.error("orders 확정 실패(승인은 성공):", {
          orderId,
          paymentKey,
          finalizeError,
          finalizeResult,
        });
        return res.status(500).json({
          error:
            "결제 승인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }

      // 가상계좌(waiting_deposit)에는 권한을 주지 않는다 — 계좌만 발급됐고 돈은
      // 안 들어왔다. 입금 확인 시 api/toss-webhook.js 가 같은 RPC 로 부여한다.
      // access 는 fn_grant_program_access_for_order 원본 payload(ok/granted/
      // service_keys/skipped/error/ledger_inserted, 전부 snake_case) 그대로다
      // — src/pages/PaymentSuccess.jsx 는 ok/error/granted 세 필드만 읽는다.
      access = finalizeResult.access;
      if (waitingForDeposit) {
        console.log("program_access grant skipped (waiting_deposit):", orderId);
      } else if (!access.ok) {
        console.error("program_access grant failed:", orderId, access.error);
      } else {
        console.log(
          "program_access granted:",
          orderId,
          access.granted,
          `ledger_inserted=${access.ledger_inserted ?? 0}`,
        );
      }
    }

    return res.status(200).json({ ...data, access });
  } catch (err) {
    console.error("confirm-payment error:", err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
