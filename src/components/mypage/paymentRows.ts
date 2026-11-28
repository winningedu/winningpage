// 결제/신청 목록 표가 공유하는 표시 헬퍼 — 학생 신청 내역(PaymentsTab)과
// 학부모 결제 내역(parent/ParentPaymentsTab)이 같은 규칙을 써야 한다.
// 두 화면이 각자 구현하면 같은 주문이 서로 다른 배지·다른 주문번호로 보인다.

import { formatKRW } from "@/data/pricingCatalog";
import type { CashReceiptInfo } from "@/hooks/usePaymentConfirmation";

type OrderStatusInput = {
  id?: string;
  status?: string | null;
  approval_status?: string | null;
};

type RefundStatusInput = {
  order_id?: string;
  status?: string | null;
  approval_status?: string | null;
};

type RefundQuoteInput = {
  quote?: unknown;
  order_item_ids?: number[] | null;
};

// 승인/신청 일시 YYYY/MM/DD.
export function formatApprovedAt(
  value: string | number | Date | null | undefined,
) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${y}/${m}/${d}`;
}

// 표시용 주문번호. 실데이터의 토스 orderId(order_1785898468780_adf9e6aa,
// sql/10_pricing_orders.sql)에서 order_ 접두어만 뗀 전체 값을 그대로 보여준다
// (축약·말줄임 없음 — 주문번호 칼럼은 전체가 보이도록 폭을 맞춘다).
export function formatOrderId(id: string | number | null | undefined) {
  const raw = String(id || "");
  return raw.startsWith("order_") ? raw.slice("order_".length) : raw;
}

// 표시용 상품명 — 여러 상품이 담긴 주문도 order_name(대표 상품명 + "외 N건" 요약)
// 대신 order_items 전체를 ", "로 나열한다. order_items 조인이 없는 호출부(옛
// 쿼리, 아직 안 옮긴 화면)를 위해 order_name 폴백을 남겨 둔다.
export function formatProductNames(order: {
  order_name?: string | null;
  order_items?: { name: string }[] | null;
}) {
  if (order.order_items && order.order_items.length > 0) {
    return order.order_items.map((item) => item.name).join(", ");
  }
  return order.order_name || "";
}

// 현금영수증 링크(QA 시트 행310) — orders.raw.cashReceipt(useMyPageOrders.ts가
// raw->cashReceipt 로 얕게 뽑아 cash_receipt 필드에 싣는다)에서 화면이 실제로
// 쓰는 값만 골라낸다. receiptUrl 이 없으면(가상계좌 발급 전·현금영수증 미요청
// 주문) null — 폴백 없이 버튼 자체를 렌더하지 않게 하는 신호로 쓴다.
export function getCashReceipt(order: {
  cash_receipt?: CashReceiptInfo | null;
}): { receiptUrl: string; type?: string; issueNumber?: string } | null {
  const receiptUrl = order.cash_receipt?.receiptUrl?.trim();
  if (!receiptUrl) return null;
  return {
    receiptUrl,
    ...(order.cash_receipt?.type && { type: order.cash_receipt.type }),
    ...(order.cash_receipt?.issueNumber && {
      issueNumber: order.cash_receipt.issueNumber,
    }),
  };
}

// order + 매칭되는 refund_requests 최신 행으로 상태 배지 키를 계산한다.
// refunds 는 상위(MyPage)가 created_at desc 로 정렬해 내려주므로 첫 매칭이 최신이다.
//
// refund_requests 는 축이 둘이다(sql/68) — status(어드민 처리축)와
// approval_status(학부모 승인축). 둘을 함께 보지 않으면 "학부모 확인 대기"와
// "어드민 처리 중"이 같은 배지로 뭉개진다.
export function resolveOrderStatus(
  order: OrderStatusInput,
  refunds: RefundStatusInput[],
) {
  // 학부모가 다른 상품 구성으로 새로 결제해 이 주문을 대체함
  // (fn_parent_create_enrollment). 반려가 아니라 대체라 환불 대상이 아니고,
  // waiting_deposit 체크보다도 먼저 봐야 한다 — 그래야 어떤 경우에도 환불
  // 매칭이나 다른 상태로 오분류되지 않는다.
  if (order.approval_status === "superseded") return "superseded";

  // 학부모가 결제 요청(수강신청) 자체를 반려함(fn_respond_enrollment,
  // p_approve=false) — status 는 canceled 로 함께 떨어지므로 이 분기가
  // 없으면 아래 "매칭되는 refund 없음 → paid" 폴백에 걸려 반려 건이
  // "결제 완료"로 잘못 표시된다(돈이 들어온 적이 없는 주문이다).
  if (order.approval_status === "rejected") return "enrollment_parent_rejected";

  // 가상계좌 미입금(waiting_deposit)은 환불 대상이 아니므로 refunds 매칭보다 먼저
  // 본다 — 돈이 안 들어온 주문이라 refund_requests 행이 있을 수 없다.
  if (order.status === "waiting_deposit") return "pending";

  const refund = refunds.find((r) => r.order_id === order.id);
  if (!refund) return "paid";

  // 어드민 처리축이 종결된 건이 먼저다 — 제약상 이 두 값은 승인 이후에만
  // 나올 수 있다(refund_requests_approval_before_processing_check).
  if (refund.status === "completed") {
    // v10 부분해지(구성서비스 단위) 완료는 주문 전체가 끝난 게 아니라
    // order.status 가 'paid' 로 남는다 — "일부 환불"은 이 조합으로만 파생된다.
    return order.status === "refunded" ? "refund_completed" : "refund_partial";
  }
  if (refund.status === "rejected") return "refund_rejected";

  if (refund.approval_status === "requested") return "refund_approval_pending";
  if (refund.approval_status === "rejected") return "refund_parent_rejected";

  return "refund_requested";
}

// refund 행의 quote(jsonb 산정 라인 배열, unknown)에서 대상 상품명들을 뽑아
// ", " 로 이어 붙인다. order_item_ids 가 비어 있으면(주문 전체 환불) 상품명
// 표기가 필요 없으므로 null을 돌려준다 — 호출부는 order_name 등 기존 표기로
// 폴백한다. quote 원소 키는 버전마다 달라(v9 레거시는 order_item_id가 없다)
// item_name 유무만 방어적으로 확인한다.
export function refundTargetNames(refund: RefundQuoteInput): string | null {
  if (!refund.order_item_ids || refund.order_item_ids.length === 0) {
    return null;
  }
  if (!Array.isArray(refund.quote)) return null;

  const names = refund.quote
    .map((line) =>
      line && typeof line === "object" && "item_name" in line
        ? (line as { item_name?: unknown }).item_name
        : undefined,
    )
    .filter((name): name is string => typeof name === "string");

  return names.length > 0 ? names.join(", ") : null;
}

export type DiscountOrderInput = {
  list_amount?: number | null;
  discount_amount?: number | null;
  order_items?:
    | {
        name: string;
        list_price?: number | null;
        price?: number | null;
        quantity?: number | null;
        // 번들 구성 내역 표기(태스크6, bundleComposition.ts) 용 — itemRows와
        // order_items는 항상 같은 순서·같은 길이라(computeDiscountBreakdown의
        // .map()) 호출부(OrderAmountBreakdown)가 인덱스로 짝지어 쓴다.
        product_id?: string | null;
      }[]
    | null;
  coupon_redemptions?:
    | {
        discount_amount: number;
        voided_at?: string | null;
        // PostgREST embed는 to-one 관계(coupon_redemptions.coupon_id -> coupons.id)를
        // 단일 객체로 반환한다(dev 실측: {"coupons":{"title":"..."}}). FK 메타데이터를
        // 못 읽는 환경이 배열로 줄 가능성까지 흡수하도록 유니온으로 받고, 접근은
        // couponTitle()이 양쪽을 처리한다.
        coupons?:
          | { title?: string | null }
          | { title?: string | null }[]
          | null;
      }[]
    | null;
};

type DiscountBreakdownRow = { label: string; amountText: string };

function couponTitle(
  rel:
    | { title?: string | null }
    | { title?: string | null }[]
    | null
    | undefined,
) {
  return (Array.isArray(rel) ? rel[0]?.title : rel?.title) ?? null;
}

// 결제요청 확인 모달(EnrollmentRequestModal)과 결제 상세 내역 모달
// (PaymentDetailModal)이 공유하는 "원금 → 할인 사유 → 쿠폰" 분해 로직.
// 두 화면이 각자 계산하면 같은 주문이 서로 다른 할인 내역으로 보일 수 있다.
//
// 서버 불변식(sql/55): list_amount - discount_amount = amount. discount_amount는
// "상품 할인 + 쿠폰 할인"의 합이라, 쿠폰 합(couponSum)을 뺀 나머지가 상품
// 할인(productDiscount)이다. order_items의 (list_price-price)*quantity 합이
// productDiscount와 정확히 맞아떨어지면 항목별로 쪼개 보여주고, 항목 합이 더
// 크면(비정상 — 스냅샷과 discount_amount 산정이 어긋난 경우) 항목 분해를 버리고
// 통합 한 줄로 폴백한다. 이렇게 하면 화면에 보이는 할인 행의 합은 항상
// discount_amount(서버 정본)와 일치한다.
export function computeDiscountBreakdown(order: DiscountOrderInput) {
  const activeRedemptions = (order.coupon_redemptions ?? []).filter(
    (r) => !r.voided_at,
  );
  const couponSum = activeRedemptions.reduce(
    (sum, r) => sum + r.discount_amount,
    0,
  );
  const productDiscount = Math.max(0, (order.discount_amount ?? 0) - couponSum);

  const itemDiscounts = (order.order_items ?? [])
    .map((item) => ({
      name: item.name,
      amount:
        ((item.list_price ?? 0) - (item.price ?? 0)) * (item.quantity ?? 1),
    }))
    .filter((d) => d.amount > 0);
  const itemDiscountSum = itemDiscounts.reduce((sum, d) => sum + d.amount, 0);
  const residual = productDiscount - itemDiscountSum;

  const discountRows: DiscountBreakdownRow[] = [];
  if (residual >= 0) {
    for (const d of itemDiscounts) {
      discountRows.push({
        label: `${d.name} 할인`,
        amountText: `-${formatKRW(d.amount)}`,
      });
    }
    if (residual > 0) {
      discountRows.push({
        label: "할인 금액",
        amountText: `-${formatKRW(residual)}`,
      });
    }
  } else if (productDiscount > 0) {
    // 항목 합(itemDiscountSum) > discount_amount 기반 productDiscount 인
    // 비정상 케이스 — 정합 우선으로 통합 한 줄 폴백.
    discountRows.push({
      label: "할인 금액",
      amountText: `-${formatKRW(productDiscount)}`,
    });
  }

  const couponRows: DiscountBreakdownRow[] = activeRedemptions.map((r) => {
    const title = couponTitle(r.coupons);
    return {
      label: title ? `쿠폰 · ${title}` : "쿠폰",
      amountText: `-${formatKRW(r.discount_amount)}`,
    };
  });

  // 결제 상품 나열 — "XXX 외 N건"(order_name) 대신 항목별로 이름과 가격을
  // 보여준다. 가격은 정가(list_price×수량)다 — 항목 행의 합이 바로 아래
  // 원금(list_amount)과 일치하고, 거기서 할인·쿠폰 행을 빼면 결제 금액에
  // 닿는 원장 구조를 유지하기 위해서다(판매가를 쓰면 항목 합과 원금이
  // 어긋나고 할인 행이 이중 차감으로 읽힌다). list_price가 없는 레거시
  // 스냅샷은 판매가로 폴백한다.
  const itemRows: DiscountBreakdownRow[] = (order.order_items ?? []).map(
    (item) => {
      const qty = item.quantity ?? 1;
      const unit = item.list_price || item.price || 0;
      return {
        label: qty > 1 ? `${item.name} ×${qty}` : item.name,
        amountText: formatKRW(unit * qty),
      };
    },
  );

  return {
    listAmount: order.list_amount ?? 0,
    itemRows,
    discountRows,
    couponRows,
    // discountRows+couponRows 금액의 합 — 표시 행들과 항상 정합한다(문자열
    // amountText 파싱 대신 couponSum+productDiscount 원본 숫자로 계산).
    // OrderAmountBreakdown의 "할인액 총합" 행이 이 값을 그대로 쓴다.
    discountTotal: couponSum + productDiscount,
  };
}
