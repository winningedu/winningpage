// Vercel 서버리스 함수: 토스페이먼츠 웹훅 수신
//
// 왜 필요한가
//   가상계좌는 결제창을 통과한 시점에 돈이 들어온 게 아니다. 승인 API가
//   성공해도 상태는 WAITING_FOR_DEPOSIT 이고, 실제 입금은 며칠 뒤에 일어날 수
//   있다. 그 순간을 브라우저는 알 수 없으므로 토스가 서버로 쏘는 웹훅만이
//   유일한 통보 경로다. 이 라우트가 없으면 입금된 주문이 영구히
//   waiting_deposit 으로 남는다.
//
// 페이로드를 믿지 않는다
//   이 엔드포인트는 인증 없이 열려 있어야 한다(토스가 호출하므로). 그래서
//   본문의 status 를 그대로 DB에 반영하면 누구나 주문을 결제완료로 바꿀 수
//   있다. 따라서 본문에서는 orderId 만 꺼내 쓰고, 실제 상태는 시크릿 키로
//   토스 결제 조회 API를 다시 호출해서 얻는다. 레거시 가상계좌 웹훅이 보내는
//   secret 값은 승인 응답(orders.raw.secret)과 대조해 추가로 걸러낸다.
//
// 지원하는 두 가지 본문 형태
//   1) 레거시 가상계좌 웹훅 : { orderId, status, secret, transactionKey, createdAt }
//   2) PAYMENT_STATUS_CHANGED : { eventType, createdAt, data: { orderId, status, ... } }
//
// 필요 환경변수 (confirm-payment.js 와 동일)
//   TOSS_SECRET_KEY
//   WINNING_SUPABASE_URL / WINNING_SUPABASE_SERVICE_ROLE_KEY
//
// 배포 후 토스 개발자센터 > 웹훅에 이 URL(/api/toss-webhook)을 등록하는 것은
// 콘솔 작업이라 코드로 처리하지 않는다.
//
// 하드닝 변경 요약(임무 d):
//   - status='refunded' 인 주문은 조회 직후 조기 200 으로 닫는다(부활 금지 —
//     sql/71 이 추가하는 orders BEFORE UPDATE 트리거 WC039 가 DB 층 이중 방어선).
//   - orders select/update 오류를 SQLSTATE 23xxx·WCxxx(영구/제약 위반)와 그 외
//     (일시 장애)로 나눠서, 영구 오류는 원문 로그 + 200 으로 닫아 토스의 재시도
//     폭주를 막고, 일시 오류만 500 으로 재시도를 유도한다.
//   - paid 확정·권한 부여 직전에 approval_status='approved' 를 다시 확인한다 —
//     미승인 주문이 웹훅 경로로 결제완료 처리되는 것을 막는다(sql/68
//     orders_approval_before_payment_check 의 API 층 선반영).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Json } from "../../src/types/database.types.js";
import {
  type GrantProgramAccessResult,
  grantProgramAccessForOrder,
  type RevokeProgramAccessResult,
  revokeProgramAccessForOrder,
} from "../_lib/programAccess.js";
import { createSupabaseAdmin, getEnv } from "../_lib/supabaseAdmin.js";

const TOSS_PAYMENT_BY_ORDER_URL =
  "https://api.tosspayments.com/v1/payments/orders";

// 토스 결제 조회 API(GET /v1/payments/orders/{orderId}) 응답 중 이 라우트가
// 실제로 읽는 필드만 담는다. 문서의 다른 필드는 싣지 않는다.
// message/code는 조회 실패(!tossRes.ok) 시 토스가 돌려주는 에러 바디 필드다.
type TossPayment = {
  status: string;
  method?: string | null;
  approvedAt?: string | null;
  cancels?: unknown[] | null;
  balanceAmount?: number | null;
  message?: string;
  code?: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

// orders.raw는 jsonb라 생성 타입은 Json(스칼라 포함)이지만, 이 라우트가 그
// 컬럼에 쓰는 값은 항상 토스 응답 객체나 그 파생 객체다(옆 주석들 참고).
// 읽을 때만 객체 모양으로 좁혀서 임의 키 접근을 허용한다 — 값이 실제로
// 배열/스칼라/null이면 빈 객체로 취급해 호출부가 항상 안전하게 인덱싱한다.
function asJsonRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

// 토스 결제 status → orders.status
// 허용값은 pending | paid | waiting_deposit | failed | canceled (sql/10_pricing_orders.sql)
function mapStatus(tossStatus: unknown) {
  switch (clean(tossStatus)) {
    case "DONE":
      return "paid";
    case "WAITING_FOR_DEPOSIT":
      return "waiting_deposit";
    case "CANCELED":
    case "PARTIAL_CANCELED":
    case "EXPIRED":
      return "canceled";
    case "ABORTED":
      return "failed";
    default:
      return "";
  }
}

// 부수효과(권한 부여·회수)가 붙은 상태. 이 상태로 오는 웹훅은 orders 상태가
// 이미 같더라도 조기 종료하지 않는다 — 부수효과가 1회차에 실패했을 때 재전송이
// 유일한 복구 수단이고, 부여(upsert)·회수(update)는 모두 멱등이다.
const SIDE_EFFECT_STATUSES = new Set(["paid", "canceled"]);

// refunded 는 fn_complete_refund 로만 도달하는 종결 상태다. 토스가 이 주문에
// 대한 이벤트를 다시 보내도(취소/조회 재전송 등) orders.status 를 건드리면 안
// 된다 — sql/71 의 orders BEFORE UPDATE 트리거(WC039)가 DB 층에서도 막지만,
// 여기서 조기 차단해 불필요한 토스 조회·업데이트 시도 자체를 줄인다.
const STATUS_REFUNDED = "refunded";

const APPROVAL_APPROVED = "approved";

// SQLSTATE 23xxx(제약 위반) 또는 이 저장소가 쓰는 WCxxx(도메인 예외, sql/68·69·71)
// 는 재시도해도 결과가 같은 영구 오류다 — 200 으로 닫아 토스의 재시도 폭주를
// 막는다. 그 외(네트워크·일시적 DB 장애)는 500 으로 재시도를 유도한다.
function isPermanentDbError(error: { code?: string } | null | undefined) {
  const code = String(error?.code || "").trim();
  return /^23\d{3}$/.test(code) || /^WC\d{3}$/.test(code);
}

// 부여 실패를 운영자가 볼 수 있는 곳에 남긴다.
//
// 웹훅은 사용자가 보는 화면이 없어서 console.error 만 남기면 실패를 아무도
// 모른다(가상계좌는 며칠 뒤 입금되므로 사용자가 성공 페이지로 돌아오지도
// 않는다). orders 에 별도 컬럼을 만들지 않고 raw(jsonb)에 키를 하나 얹는다 —
// raw 는 토스 응답 보관용이고 이 레포에서 raw 를 읽는 코드는 confirm-payment 의
// 멱등 재응답(raw.status/raw.secret)뿐이라 키 추가가 기존 리더를 깨지 않는다.
// 성공 시에는 이전 실패 흔적을 지운다(같은 주문이 복구됐다는 사실도 정보다).
async function recordGrantOutcome(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  {
    orderId,
    raw,
    access,
  }: {
    orderId: string;
    raw: Json | null | undefined;
    access: { ok: boolean; error?: unknown };
  },
) {
  const rawRecord = asJsonRecord(raw);
  const had = Object.hasOwn(rawRecord, "access_grant_error");
  if (access.ok && !had) return;

  const nextRaw: Record<string, unknown> = { ...rawRecord };
  if (access.ok) {
    delete nextRaw.access_grant_error;
    nextRaw.access_grant_recovered_at = new Date().toISOString();
  } else {
    nextRaw.access_grant_error = {
      error: access.error,
      at: new Date().toISOString(),
    };
  }

  const { error } = await supabaseAdmin
    .from("orders")
    // nextRaw는 문자열·Date ISO·access.error(항상 string|null, programAccess.ts
    // GrantProgramAccessResult/RevokeProgramAccessResult 참고)로만 구성돼
    // JSON-safe하다 — Json 인덱스 시그니처와 구조적으로만 안 맞아 캐스트한다.
    .update({ raw: nextRaw as Json })
    .eq("id", orderId);
  if (error)
    console.error("orders.raw grant marker update failed:", orderId, error);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    // 두 형태 모두 orderId 만 필요하다. 나머지 필드는 신뢰하지 않는다.
    const orderId = clean(body.orderId || body?.data?.orderId);
    const claimedSecret = clean(body.secret || body?.data?.secret);

    if (!orderId) {
      // 재시도해도 결과가 같으므로 200 으로 닫는다(4xx 를 주면 토스가 계속 재시도한다).
      return res.status(200).json({ ignored: true, reason: "orderId 없음" });
    }

    const secretKey = getEnv("TOSS_SECRET_KEY");
    if (!secretKey) {
      // 설정 누락은 우리 쪽 문제다. 5xx 로 응답해 토스 재시도를 유도한다.
      return res
        .status(500)
        .json({ error: "서버에 TOSS_SECRET_KEY 가 설정되지 않았습니다." });
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { data: order, error: selectError } = await supabaseAdmin
      .from("orders")
      // user_id 는 입금 확인 시 이용 권한을 줄 대상이다(즉시 입장).
      // paid_at 은 이미 paid 인 주문에 부여를 재시도할 때 이용 시작 시각으로 쓴다
      // (재시도가 시작일을 오늘로 밀어버리지 않게 한다).
      // approval_status 는 paid 확정 전 학부모 승인 여부 재확인용이다(아래).
      .select("id, user_id, status, approval_status, paid_at, raw")
      .eq("id", orderId)
      .maybeSingle();

    if (selectError) {
      if (isPermanentDbError(selectError)) {
        // 제약 위반·도메인 예외는 재시도해도 같은 결과다 — 200 으로 닫아 토스의
        // 재시도 폭주를 막는다. 원문은 로그로만 남긴다.
        console.error(
          "toss-webhook 영구 오류(주문 조회):",
          orderId,
          selectError,
        );
        return res.status(200).json({
          ignored: true,
          reason: "permanent_db_error",
          code: selectError.code,
        });
      }
      throw selectError;
    }
    if (!order) {
      return res.status(200).json({ ignored: true, reason: "주문 없음" });
    }

    if (order.status === STATUS_REFUNDED) {
      // 환불 종결된 주문 부활 금지. sql/71 의 orders BEFORE UPDATE 트리거(WC039)가
      // DB 층에서도 같은 UPDATE 를 막지만, 여기서 조기에 닫아 불필요한 토스 조회·
      // 업데이트 시도를 하지 않는다.
      return res
        .status(200)
        .json({ ignored: true, reason: "refunded_order_immutable" });
    }

    // 레거시 가상계좌 웹훅의 secret 대조. 승인 응답에 secret 이 있었던 주문만 검사한다.
    const storedSecret = clean(asJsonRecord(order.raw).secret);
    if (storedSecret && claimedSecret && storedSecret !== claimedSecret) {
      return res.status(200).json({ ignored: true, reason: "secret 불일치" });
    }

    // 상태의 정본은 토스 조회 응답이다.
    const auth = Buffer.from(`${secretKey}:`).toString("base64");
    const tossRes = await fetch(
      `${TOSS_PAYMENT_BY_ORDER_URL}/${encodeURIComponent(orderId)}`,
      {
        headers: { Authorization: `Basic ${auth}` },
      },
    );
    const payment: TossPayment = await tossRes.json();

    if (!tossRes.ok) {
      return res.status(502).json({
        error: payment?.message ?? "토스 결제 조회 실패",
        code: payment?.code,
      });
    }

    const nextStatus = mapStatus(payment.status);
    if (!nextStatus) {
      return res
        .status(200)
        .json({ ignored: true, reason: `미지원 status(${payment.status})` });
    }

    // paid 확정·권한 부여는 학부모 승인(approval_status='approved')이 전제다
    // (sql/68 orders_approval_before_payment_check). 미승인 주문에 대한 paid
    // 전이 시도는 DB 제약이 최종적으로 막지만(23514 → 위 isPermanentDbError 로
    // 200 처리), 여기서 먼저 걸러 토스 조회 이후의 불필요한 업데이트 시도와
    // 오해의 소지가 있는 로그를 줄인다.
    if (nextStatus === "paid" && order.approval_status !== APPROVAL_APPROVED) {
      console.error(
        "toss-webhook: 미승인 주문의 paid 전이 시도 — 무시:",
        orderId,
        order.approval_status,
      );
      return res
        .status(200)
        .json({ ignored: true, reason: "approval_not_approved" });
    }

    // 상태가 그대로인 웹훅(토스 재전송·수동 재전송)이라도 paid 는 그냥 닫지
    // 않는다. 1회차에서 orders 는 paid 로 올라갔는데 권한 부여만 실패한 경우
    // (programs 시드 미적용 FK 위반, 일시적 DB 오류) 조기 종료하면 복구 수단이
    // 사라진다 — 가상계좌 구매자는 며칠 뒤 입금하므로 성공 URL 로 돌아오지 않고,
    // 그러면 confirm-payment 의 멱등 재시도도 발동하지 않는다. 부여는 멱등
    // upsert 라서 재호출이 안전하므로, 웹훅 재전송을 복구 경로로 쓴다.
    // 취소도 같은 이유로 닫지 않는다 — 회수(update)가 실패한 뒤 오는 재전송이
    // 유일한 복구 수단이다.
    const unchanged = nextStatus === order.status;
    if (unchanged && !SIDE_EFFECT_STATUSES.has(nextStatus)) {
      return res
        .status(200)
        .json({ ok: true, unchanged: true, status: nextStatus });
    }

    // 이미 paid 인 주문에 재전송이 온 경우 orders 는 다시 쓸 필요가 없다.
    let paidAt = order.paid_at ?? null;
    let access: GrantProgramAccessResult | null = null;

    if (nextStatus === "paid" && !unchanged) {
      // 신규 전이(입금 확인) — orders 확정 UPDATE 와 권한 부여를 한 트랜잭션으로
      // 묶는다(sql/79 fn_finalize_paid_order, api/_routes/confirm-payment.js 와 같은
      // RPC). 예전에는 이 둘이 별도 왕복이라 그 사이 크래시하면 paid 인데
      // 권한만 없는 주문이 남았다 — 웹훅 재전송이 유일한 복구 수단이었다.
      // p_confirm_amount=null(웹훅은 금액을 재검증하지 않는다, 기존 blind
      // update 와 동일), p_require_pending_or_failed=false(원래도 상태 조건 없이
      // 갱신했다 — approval/refunded 는 이미 위에서 걸렀다).
      paidAt = payment.approvedAt ?? new Date().toISOString();

      const { data: rpcResult, error: finalizeError } = await supabaseAdmin.rpc(
        "fn_finalize_paid_order",
        {
          p_order_id: orderId,
          p_status: "paid",
          // p_payment_key/p_method: SQL 함수 시그니처(20260821000000_baseline.sql
          // fn_finalize_paid_order)에 DEFAULT가 없어 두 인자 다 생성 타입이
          // "string"(널 불가)으로 나오지만, Postgres 함수 인자는 NOT NULL을
          // 선언할 수 없어 null 전달 자체는 유효하다. 본문이 payment_key는
          // `coalesce(p_payment_key, payment_key)`로, method는 컬럼이 nullable이라
          // 직접 대입으로 null을 안전하게 받는다 — 생성 타입의 표현 한계다.
          p_payment_key: null as unknown as string,
          p_method: (payment.method ?? null) as unknown as string,
          p_paid_at: paidAt,
          // TossPayment는 이 라우트가 실제로 읽는 필드만 담은 로컬 타입이라
          // Json 인덱스 시그니처와 구조적으로 안 맞을 뿐, 값은 벤더 JSON
          // 응답 그대로라 jsonb 컬럼에 그대로 저장해도 안전하다.
          p_raw: payment as unknown as Json,
          // p_confirm_amount는 DEFAULT NULL::numeric이라 생략해도 결과가
          // 같다(명시적 null과 동일하게 NULL로 남는다) — 키를 생략해 옵셔널
          // 타입(number | undefined)과 자연스럽게 맞춘다.
          p_require_pending_or_failed: false,
          // 새 입금이 확인된 전이만 회수된 권한을 되살릴 수 있다.
          p_restore_revoked: true,
        },
      );
      const finalizeResult = rpcResult as {
        ok: boolean;
        error?: string;
        access?: GrantProgramAccessResult;
      } | null;

      if (finalizeError) {
        if (isPermanentDbError(finalizeError)) {
          console.error(
            "toss-webhook 영구 오류(주문 확정):",
            orderId,
            finalizeError,
          );
          return res.status(200).json({
            ignored: true,
            reason: "permanent_db_error",
            code: finalizeError.code,
          });
        }
        throw finalizeError;
      }
      if (!finalizeResult?.ok) {
        console.error(
          "toss-webhook: 주문 확정 UPDATE 실패:",
          orderId,
          finalizeResult,
        );
        return res
          .status(500)
          .json({ error: "주문 확정 실패", detail: finalizeResult });
      }

      access = finalizeResult.access as GrantProgramAccessResult;
      if (!access.ok) {
        console.error(
          "program_access grant failed (webhook):",
          orderId,
          access.error,
        );
      }
      await recordGrantOutcome(supabaseAdmin, {
        orderId,
        raw: payment as unknown as Json,
        access,
      });
    } else {
      // 그 외 전이(paid 이외 상태로의 갱신)와, paid+unchanged 재시도(묶을 UPDATE
      // 자체가 없는 경우)는 기존 경로를 그대로 둔다.
      if (!unchanged) {
        const patch = {
          status: nextStatus,
          method: payment.method ?? null,
          // TossPayment → Json: 위 fn_finalize_paid_order 호출부 주석과 동일한
          // 이유(로컬 벤더 응답 타입이 Json 인덱스 시그니처와 구조적으로만 불일치).
          raw: payment as unknown as Json,
        };

        const { error: updateError } = await supabaseAdmin
          .from("orders")
          .update(patch)
          .eq("id", orderId);

        if (updateError) {
          if (isPermanentDbError(updateError)) {
            // 제약 위반·도메인 예외(예: WC039 refunded_order_immutable 트리거)는
            // 재시도해도 같은 결과다 — 200 으로 닫아 토스의 재시도 폭주를 막는다.
            console.error(
              "toss-webhook 영구 오류(주문 갱신):",
              orderId,
              updateError,
            );
            return res.status(200).json({
              ignored: true,
              reason: "permanent_db_error",
              code: updateError.code,
            });
          }
          throw updateError;
        }
      }

      // 즉시 입장(사용자 확정): paid+unchanged 재전송의 부여 재시도. 카드·
      // 간편결제 경로(api/_routes/confirm-payment.js)와 같은 api/_lib/programAccess.js
      // 를 쓴다 — 부여 규칙이 두 벌로 갈라지지 않게 한다.
      if (nextStatus === "paid") {
        access = await grantProgramAccessForOrder(supabaseAdmin, {
          orderId,
          userId: order.user_id,
          paidAt,
          // 재전송(unchanged)은 새 돈의 근거가 없는 재시도이므로 환불 회수를
          // 되돌리지 않는다.
          restoreRevoked: false,
        });
        if (!access.ok) {
          console.error(
            "program_access grant failed (webhook):",
            orderId,
            access.error,
          );
        }
        await recordGrantOutcome(supabaseAdmin, {
          orderId,
          raw: order.raw,
          access,
        });
      }
    }

    // 즉시 입장의 대칭: 결제가 종결(취소·환불·만료)되면 권한도 즉시 닫는다.
    // 주문만 canceled 로 바꿔도 판정부(api/_routes/create-service-ticket.js 의
    // checkProgramAccessTable → fn_program_access_state)는 program_access 만
    // 보고 orders.status 를 보지 않으므로 입장이 계속 성립한다.
    //
    // ⚠ 이것이 저장소 유일한 회수 호출부다. 계좌이체 환불처럼 운영자가
    //   refund_requests.status 를 'completed' 로 바꾸는 경로에는 회수 트리거가
    //   없어 권한이 paid/active 로 남는다. sql/64 의 원장은 그 구멍을 고치는
    //   것이 아니라 **고칠 자리를 만든다**(주문 단위로 어느 부여를 닫아야 하는지
    //   특정할 수 있게 됐다). 트리거 신설은 별 작업이며, 그동안은 sql/64 말미
    //   감시 쿼리 (c) 로 그 상태를 관측한다.
    let revoke:
      | RevokeProgramAccessResult
      | { ok: true; revoked: never[]; skipped: { reason: string }[] }
      | null = null;
    if (nextStatus === "canceled") {
      // 부분취소(PARTIAL_CANCELED)는 잔액이 남아 있으면 결제가 유효하게 살아 있는
      // 상태다. 토스 응답의 balanceAmount 가 "취소 후 남은 금액"이므로 0보다 크면
      // 회수하지 않는다 — 1회차분만 환불한 구매자의 권한을 통째로 닫으면 안 된다.
      //
      // 원장(sql/64 의 program_access_grants)이 도입된 뒤에도 이 분기는
      // 그대로다. 토스 취소 응답은 balanceAmount·cancels
      // 로 **금액만** 주고 어느 주문 라인이 취소됐는지 주지 않으므로,
      // order_item_id 단위 자동 회수를 유도할 근거가 없다. 원장의 라인 앵커
      // (order_item_id)는 "운영자가 손으로 처리할 때의 좌표"로만 쓴다 —
      // 어느 부여를 닫아야 하는지 사람이 지정할 수 있게 된 것이 원장의 기여다.
      // (부분취소 후 남은 회차·기간의 정산 규칙은 여전히 미확정 항목이다.)
      const balanceAmount = Number(payment.balanceAmount ?? 0);
      if (clean(payment.status) === "PARTIAL_CANCELED" && balanceAmount > 0) {
        console.warn(
          "partial cancel with balance left — access kept:",
          orderId,
          balanceAmount,
        );
        revoke = {
          ok: true,
          revoked: [],
          skipped: [{ reason: "partial_cancel_balance_left" }],
        };
      } else {
        // 돈이 실제로 들어왔던 주문의 취소 = 환불(refunded), 입금 전 종결(가상계좌
        // 미입금 만료) = 취소(cancelled). 구분 근거를 orders.status 로 잡으면
        // 재전송 때는 이미 canceled 라서 refunded 가 cancelled 로 뒤집힌다. 그래서
        // 토스 응답에서 판정한다 — 승인된 적이 있으면 approvedAt 이, 취소 이력이
        // 있으면 cancels 배열이 채워진다(EXPIRED 는 둘 다 없다).
        const wasApproved =
          Boolean(payment.approvedAt) || Array.isArray(payment.cancels);
        revoke = await revokeProgramAccessForOrder(supabaseAdmin, {
          orderId,
          userId: order.user_id,
          paymentStatus: wasApproved ? "refunded" : "cancelled",
        });
        if (!revoke.ok) {
          // 여기서 실패하면 돈은 돌려줬는데 권한이 열린 채로 남는다. 5xx 로 응답해
          // 토스 재전송을 유도한다(회수 update 는 멱등이라 재시도가 안전하다).
          console.error(
            "program_access revoke failed (webhook):",
            orderId,
            revoke.error,
          );
          return res
            .status(500)
            .json({ error: "program_access 회수 실패", revoke });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      status: nextStatus,
      ...(unchanged ? { unchanged: true } : {}),
      ...(access ? { access } : {}),
      ...(revoke ? { revoke } : {}),
    });
  } catch (err) {
    console.error("toss-webhook error:", err);
    // 5xx 를 주면 토스가 재시도하므로 일시 장애는 자동 복구된다.
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
