import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CardInfo,
  CashReceiptInfo,
  EasyPayInfo,
  VirtualAccountInfo,
} from "@/hooks/usePaymentConfirmation";
import { FAKE_ENTITLEMENT_ENABLED, getMockPaidOrders } from "@/lib/entitlement";
import { supabase } from "@/lib/supabase";
import type { SessionUser } from "./useMyPageProfile";

export type Order = {
  id: string;
  order_name?: string;
  amount: number;
  paid_at?: string;
  status?: string;
  approval_status?: string;
  // 학부모 반려 사유(fn_respond_enrollment) — 반려 건(approval_status='rejected')만
  // 값이 있다(orders_reject_reason_pairing_check). 결제 상세 팝업이 표시한다.
  reject_reason?: string | null;
  method?: string;
  vat?: number | string | null;
  // 영수증(ReceiptModal) 전용 — 토스 raw 응답의 card/virtualAccount/easyPay/
  // approvedAt 서브 객체를 PostgREST JSON path(raw->card 등)로 그대로 꺼낸다.
  // raw 전체(행당 수 KB)를 select 하지 않고 필요한 서브 객체만 얕게 뽑는 이유는
  // 위 vat 필드와 같다.
  card?: CardInfo | null;
  virtual_account?: VirtualAccountInfo | null;
  easy_pay?: EasyPayInfo | null;
  // 현금영수증(QA 시트 행310) — 가상계좌 결제가 입금 확인되면 토스가 자동
  // 발급한다(ParentCheckout.tsx의 virtualAccount.cashReceipt 요청). 위
  // card/virtual_account/easy_pay 와 같은 이유로 raw 서브 객체만 얕게 뽑는다.
  cash_receipt?: CashReceiptInfo | null;
  approved_at?: string | null;
  is_fake_entitlement?: boolean;
  order_items?: {
    name: string;
    list_price?: number;
    price?: number;
    quantity?: number;
    // 번들 구성 내역 표기(태스크6, bundleComposition.ts)용 — 이 항목이
    // bundle_items를 가진 products 행을 가리키면 영수증·결제 상세에 구성
    // 라인을 덧붙인다.
    product_id?: string | null;
  }[];
  list_amount?: number;
  discount_amount?: number;
  coupon_redemptions?: {
    discount_amount: number;
    voided_at?: string | null;
    coupons?: { title?: string | null } | { title?: string | null }[] | null;
  }[];
};

export type Refund = {
  // refund_requests.id는 bigint PK다(orders.id와 달리 uuid가 아니다).
  id: number;
  order_id?: string;
  order_name?: string | null;
  amount: number;
  gross_amount?: number | null;
  reason?: string | null;
  status?: string;
  approval_status?: string;
  student_profile_id?: string;
  created_at?: string;
  // v10 부분해지 — 산정 라인 배열(jsonb). 원소 키는 quote 산정 시점 버전에 따라
  // 다르므로(레거시 v9는 order_item_id 없음) 소비 측에서 방어적으로 파싱한다.
  quote?: unknown;
  // NULL 이면 주문 전체 환불, 값이 있으면 그 order_item_id 들만 대상인 부분해지.
  order_item_ids?: number[] | null;
  terms_version?: string;
};

// 결제 내역 + 환불 신청 내역. user가 정해지면 1회 로드하고, reload는 결제/환불
// 관련 액션(환불 신청·환불 응답 등) 후 두 목록을 함께 다시 불러올 때 쓴다 —
// 환불만 갱신하면 지난 결제내역의 상태 배지·주문 상태가 stale 로 남는다.
export function useMyPageOrders(user: SessionUser | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);

  // 동시/연속 reload 경합 가드 — 마지막에 시작한 호출의 응답만 반영한다.
  // (기존 alive 플래그의 stale set 방지 역할을 콜백 형태에서 대신한다.)
  const generationRef = useRef(0);

  const reload = useCallback(async () => {
    if (!user) return;
    const generation = ++generationRef.current;

    const [{ data: ord }, { data: reqs }] = await Promise.all([
      supabase
        .from("orders")
        // 가상계좌는 승인 직후 paid 가 아니라 waiting_deposit 으로 기록된다
        // (api/_routes/confirm-payment.js — 계좌 발급만 끝난 상태). paid 만 조회하면 입금 전
        // 주문이 마이페이지에서 통째로 사라지므로 두 상태를 함께 읽고, 배지·환불 대상
        // 판정을 위해 status 도 가져온다.
        //
        // method / vat 은 결제 상세 내역 모달(PaymentDetailModal, Figma 3665:6278)이
        // 쓴다. 부가세는 우리가 금액에서 역산하지 않고 토스 승인 응답 원본
        // (orders.raw.vat)을 그대로 읽는다 — raw 전체는 행당 수 KB라 목록 조회에
        // 얹으면 무겁기 때문에 PostgREST JSON 경로로 필요한 한 값만 뽑는다.
        // card/virtual_account/easy_pay/approved_at 도 같은 이유로 raw 서브
        // 객체만 얕게 뽑는다 — 결제 영수증(ReceiptModal)이 카드사·할부·승인번호·
        // 입금계좌를 src/lib/paymentReceiptFormat.ts 포맷터로 표시하는 데 쓴다.
        // list_amount/discount_amount/coupon_redemptions 는 결제 상세 모달
        // (PaymentDetailModal)의 "원금"/"할인 금액"/"쿠폰" 행 분해용 — redemption 은
        // 주문당 몇 개 안 되는 얕은 임베드라 목록 조회에 얹어도 가볍다. order_items의
        // list_price/price/quantity는 항목별 할인 사유 분해용, coupons(title)은
        // 쿠폰명 노출용 — coupons는 public read가 is_active=true 행만 통과시키므로
        // 비활성 쿠폰이면 embed가 null로 온다(코드에서 폴백 처리).
        .select(
          "id, order_name, amount, paid_at, status, approval_status, reject_reason, method, vat:raw->>vat, card:raw->card, virtual_account:raw->virtualAccount, easy_pay:raw->easyPay, cash_receipt:raw->cashReceipt, approved_at:raw->>approvedAt, order_items(name, list_price, price, quantity, product_id), list_amount, discount_amount, coupon_redemptions(discount_amount, voided_at, coupons(title))",
        )
        // 쌍 구조(sql/68) — orders.user_id 는 **결제한 사람(학부모)** 축이다.
        // 학생은 student_profile_id 에만 박히므로 user_id 로만 조회하면 학생
        // 계정은 자기가 신청해서 이용 중인 주문을 하나도 못 본다(빈 목록).
        // 두 축을 OR 로 함께 본다 — RLS(orders select)가 이미 쌍 당사자만
        // 통과시키므로 남의 주문이 섞일 여지는 없다.
        .or(`user_id.eq.${user.id},student_profile_id.eq.${user.id}`)
        .in("status", [
          "pending",
          "paid",
          "waiting_deposit",
          "canceled",
          "refunded",
        ])
        // waiting_deposit 은 paid_at 이 null 이라 paid_at 정렬에서는 순서가 불안정하다.
        // 주문 생성 시각은 항상 존재하므로(orders.created_at not null) 정렬 키로 쓴다.
        .order("created_at", { ascending: false })
        // supabase 클라이언트가 Database 제네릭 없이 생성돼(src/lib/supabase.ts)
        // select 문자열만으로 타입을 추론한다 — raw->card 같은 단일 화살표(JSON
        // 객체) 경로는 Json 타입으로 추론되어 위 Order.card(CardInfo | null)와
        // 맞지 않는다. .returns()로 이 쿼리 결과 타입만 우리 Order 타입으로
        // 못박는다(쿼리 자체의 컬럼명 오타 검증은 그대로 유지된다).
        .overrideTypes<Order[], { merge: false }>(),
      supabase
        .from("refund_requests")
        .select(
          "id, order_id, order_name, amount, gross_amount, reason, status, approval_status, student_profile_id, created_at, quote, order_item_ids, terms_version",
        )
        // orders 와 같은 이유로 쌍 두 축을 함께 본다 — refund_requests.user_id 는
        // "신청한 사람"이라, 학부모가 신청한 환불을 학생이 못 보거나 그 반대가 된다.
        // RLS(sql/68 "refund_requests select own")가 이미 두 축(student_profile_id,
        // parent_profile_id)으로 열려 있어 이 조회와 정확히 맞물린다.
        .or(`student_profile_id.eq.${user.id},parent_profile_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
    ]);
    if (generation !== generationRef.current) return;

    // 로컬 QA 전용: 이용권을 보유한 것으로 가정하는 가짜 결제 내역을 실제 조회 결과
    // 앞에 합친다. "신청 내역"(PaymentsTab) 등 orders를 그대로 쓰는 화면에는 보이지만,
    // "나의 서비스"(MyServicesTab)는 2026-09-01부터 orders가 아니라 program_access_grants
    // 원장을 직접 읽으므로 이 가짜 주문으로는 카드가 뜨지 않는다(실제 grant가 있어야
    // 뜬다) — 로컬에서 이 탭을 확인하려면 실제 결제·부여를 거쳐야 한다. 환불 신청 선택
    // 목록에서는 반드시 제외해야 한다(PaymentsTab의 refundableOrders 필터 참고) — 가짜
    // 주문에 환불을 걸면 실제 refund_requests 행이 DB에 생겨 데이터가 오염된다.
    if (FAKE_ENTITLEMENT_ENABLED) {
      console.info(
        "[entitlement] 로컬 가짜 이용권 주문을 마이페이지에 표시합니다.",
      );
      setOrders([...getMockPaidOrders(), ...(ord || [])]);
    } else {
      setOrders(ord || []);
    }

    setRefunds(reqs || []);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { orders, refunds, reload };
}
