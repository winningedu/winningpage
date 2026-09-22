import { BANK_OPTIONS } from "@/lib/paymentReceiptFormat";
import type { FieldOption } from "@/pages/admin/shared/csvExport";

// refund_requests.status DB CHECK 값(requested|processing|completed|rejected)과
// 화면 라벨을 분리한다 — 저장은 영문, 표시는 한글(MyPage.jsx REFUND_STATUS
// 재사용). CONFIGS.refundRequests 참고.
const REFUND_REQUEST_STATUS_OPTIONS: FieldOption[] = [
  { value: "requested", label: "접수" },
  { value: "processing", label: "처리중" },
  { value: "completed", label: "환불완료" },
  { value: "rejected", label: "반려" },
];

// 완료 처리는 fn_complete_refund RPC 전용이다(WC038 트리거가 제네릭 PATCH 로의
// completed 전환을 막는다) — 편집 폼 select 에는 completed 를 노출하지 않는다.
// 목록 표시(컬럼)는 이미 완료된 행의 라벨도 보여줘야 하므로 위
// REFUND_REQUEST_STATUS_OPTIONS(완료 포함)를 그대로 쓴다.
const REFUND_REQUEST_STATUS_EDIT_OPTIONS: FieldOption[] =
  REFUND_REQUEST_STATUS_OPTIONS.filter(
    (option) => typeof option === "object" && option.value !== "completed",
  );

// refund_requests.approval_status DB CHECK 값(requested|approved|rejected) — 학부모가
// 아닌 신청자가 낸 환불 신청의 승인 여부 축이다(payments.status·refund_requests.status
// 와는 다른 별개 축, Baseline §8 CHECK 목록 참고). fn_complete_refund 가 approved
// 아니면 WC035 로 막으므로 목록에서 바로 판별할 수 있어야 한다.
const REFUND_APPROVAL_STATUS_OPTIONS: FieldOption[] = [
  { value: "requested", label: "승인대기" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "승인반려" },
];

// payments.status DB CHECK 값(pending|paid|failed|refunded|cancelled)과 화면
// 라벨을 분리한다 — 저장은 영문, 표시는 한글. 한국어를 값으로 넣어 CHECK
// 위반으로 등록이 늘 실패하던 결함(CONFIGS.payments 참고)을 여기서 고친다.
// 라벨은 새로 짓지 않고 이 저장소에 이미 있는 어휘에서 가져온다:
//   pending → '납부대기', paid → '납부완료'  (1679행 admin_enrollments
//     payment_status 옵션과 동일 어휘)
//   refunded → '환불완료'  (MyPage.jsx REFUND_STATUS.completed, 184행
//     REFUND_REQUEST_STATUS_OPTIONS 와 동일 어휘)
// failed·cancelled 는 이 저장소에 대응하는 기존 라벨이 없어 새로 채운다
// (2026-08-12, 사용자 지시로 채움). '취소요청'을 cancelled 에 쓰지 않는다 —
// 그건 "취소 신청됨"(진행 중)이라는 별개 상태라 여기 cancelled(완료 상태)와
// 맞지 않는다. 대신 이미 쓰이는 '-완료' 접미(납부완료/환불완료)와 같은
// 형태로 맞춰 취소완료로 쓴다. failed 도 같은 이유로 '납부' 접두를 살려
// 납부실패로 쓴다 — refunds 탭(2188행)의 '취소요청'/'환불완료'/'반려' 축과는
// 다른 테이블·다른 상태 축이라 혼동하지 않는다.
interface RevenueColumn {
  key: string;
  label: string;
  type?: "money" | "date" | "select";
  options?: FieldOption[];
}

interface RevenueField {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "select" | "date";
  required?: boolean;
  // 상세 폼에서 값만 보여주고 편집은 막는다. 환불 처리 대장처럼 원장 전체가
  // 읽기 전용인 화면에서 쓴다(QA 275).
  readOnly?: boolean;
  options?: FieldOption[];
}

interface RevenueCrudConfig {
  title: string;
  table: string;
  searchPlaceholder: string;
  order?: string;
  excel?: boolean;
  readOnly?: boolean;
  noCreate?: boolean;
  // 개인정보 반출 게이트 대상(AdminConfig.sensitiveDownload 와 같은 뜻) — QA 271 계열.
  sensitiveDownload?: boolean;
  columns: RevenueColumn[];
  fields?: RevenueField[];
  defaults?: Record<string, unknown>;
}

// coupons: custom:true 도메인 컴포넌트(CouponAdmin) 전용 — 다른 배치 소유 컴포넌트라
// 이 파일에서는 config 형태만 선언한다(customComponentKey로만 연결).
interface RevenueCustomConfig {
  title: string;
  custom: true;
  customComponentKey: string;
  searchPlaceholder: string;
}

type RevenueConfig = RevenueCrudConfig | RevenueCustomConfig;

export const revenueConfigs: Record<string, RevenueConfig> = {
  // 매출 및 결제 — 실제 결제(orders/order_items) 기반. 원천은 admin_revenue_items
  // 뷰(20260823000011)이고 화면은 RevenueAdmin.tsx 가 전부 그린다(제네릭 CRUD 아님).
  revenue: {
    title: "매출 및 결제",
    custom: true,
    customComponentKey: "revenue",
    searchPlaceholder: "",
  },

  // 「매출 조정」(payments) · 「매출 정산」(payments 읽기전용) · 「일일정산」
  // (daily_settlements) 은 2026-08-23 에 없앴다.
  //
  //   셋 다 운영자가 손으로 적는 수기 장부였고 실제 결제와 연결이 없었다. 게다가
  //   앞의 둘은 화면이 그리던 컬럼(payer_name/program_name/class_name/sale_amount/
  //   discount_amount/paid_amount)이 **실제 payments 스키마에 하나도 없어서**
  //   빈 화면으로 떠 있었다(2026-08-23 실측 — payments 는 order_id·amount·status
  //   같은 토스 연동용 컬럼만 갖고 있다).
  //
  //   대체재는 「매출 및 결제」다 — orders/order_items 를 보는 admin_revenue_items
  //   뷰(20260823000011) 기반. 유저가 결제하는 DB 와 어드민이 보는 DB 가 갈라져
  //   있던 것을 합치는 게 이 교체의 핵심이다.
  //
  //   ⚠️ payments·daily_settlements **테이블은 지우지 않았다.** 화면만 없앤다 —
  //      운영 DB 에 손으로 적어둔 기록이 남아 있을 수 있어 확인 전에는 못 지운다.

  // 관리자 수기 대장(admin_refunds/refunds, sql/00_base_schema.sql:882) — 고객이
  // fn_request_refund 로 신청한 게 아니라 운영자가 직접 기록하는 별도 원장이다.
  // dev 실측 0행이지만 운영 DB엔 있을 수 있어 없애지 않는다(팀 리드 지시,
  // 2026-08-11). 아래 refundRequests(고객 신청 원장, refund_requests 테이블)와
  // 라벨이 '환불 요청 내역' vs '환불 신청 내역'으로 거의 같아 혼동을 일으켰다
  // (2026-08-12 재정정) — 이 탭 라벨을 '환불 수기 대장'으로 바꿔 관리자 직접
  // 기록용임을 드러낸다. 같은 이유로 이 탭의 상태 변경은 읽기 전용으로
  // 막는다(readOnly) — fn_complete_refund 를 거치지 않는 제네릭 PATCH 로
  // '환불완료'를 찍을 수 있던 경로를 여기서도 차단한다(①과 동일 원칙).
  refunds: {
    title: "환불 수기 대장",
    table: "refunds",
    searchPlaceholder: "환불 요청 검색",
    order: "requested_at",
    readOnly: true,
    excel: true,
    columns: [
      { key: "payer_name", label: "수강자명" },
      { key: "program_name", label: "프로그램" },
      { key: "class_name", label: "클래스" },
      { key: "paid_amount", label: "납부금액", type: "money" },
      { key: "refund_amount", label: "환불금액", type: "money" },
      { key: "reason", label: "사유" },
      { key: "status", label: "상태" },
    ],
    fields: [
      { key: "payer_name", label: "수강자명", type: "text" },
      { key: "program_name", label: "프로그램", type: "text" },
      { key: "class_name", label: "클래스", type: "text" },
      { key: "paid_amount", label: "납부금액", type: "number" },
      { key: "refund_amount", label: "환불금액", type: "number" },
      { key: "reason", label: "사유", type: "text" },
      {
        key: "status",
        label: "상태",
        type: "select",
        options: ["취소요청", "환불완료", "반려"],
      },
      { key: "memo", label: "비고", type: "textarea" },
    ],
    defaults: { status: "취소요청", paid_amount: 0, refund_amount: 0 },
  },

  // fn_request_refund(sql/59_refund_request_hardening.sql)로 고객이 신청한 환불
  // 원장. 이전에는 이 화면의 '환불 요청 내역' 탭이 위 refunds(관리자 수기
  // 대장)를 읽어 아무도 고객 신청을 보지 못했다 — 이 config 가 그 간극을
  // 메운다(팀 리드 지시, 2026-08-11). RLS 는 어드민 select/update 만 열려
  // 있다(refund_requests_admin_select_all / _admin_update_all, sql/59) — insert
  // 정책이 없어(RPC 전용) noCreate: true 로 등록 버튼을 감춘다. delete 정책도
  // 없다(처리 상태는 status UPDATE 로 남기고 원장 행을 지우지 않는다는 원칙,
  // sql/55 coupon_redemptions 와 같은 설계) — 다만 AdminTable 은 config 로
  // 삭제 버튼만 따로 끄는 수단이 없어(readOnly 는 편집 자체를 막아버려 status
  // 처리가 안 된다) 버튼 자체는 남는다. 눌러도 RLS 가 막아 실패 alert 만 뜬다.
  //
  // status 는 DB CHECK(requested|processing|completed|rejected)라 한국어
  // 리터럴을 쓰면 안 된다(이 저장소가 이미 겪은 반복 결함 — 어드민 폼이 한글
  // '납부'를 영문 CHECK 컬럼에 써 payments 등록이 늘 실패하는 것과 같은 유형).
  // select 옵션을 {value, label} 로 나눠 저장은 영문, 표시는 한글로 분리한다.
  // 라벨 4종은 MyPage.jsx REFUND_STATUS 를 그대로 재사용한다(팀 리드 승인
  // 재사용 범위, 2026-08-11).
  //
  // 그 외 컬럼(order_id/order_name/amount/reason/user_id/refund_bank/
  // refund_account/refund_holder/admin_memo/created_at) 라벨은 팀 리드가
  // 승인한 코퍼스 규범 문자열이다(2026-08-11).
  refundRequests: {
    title: "환불 신청 내역", // MyPage.jsx:642 재사용(같은 데이터의 고객 쪽 헤딩)
    table: "refund_requests",
    searchPlaceholder: "환불 신청 검색",
    excel: true,
    noCreate: true,
    columns: [
      { key: "order_id", label: "주문번호" },
      { key: "amount", label: "환불 신청 금액", type: "money" },
      { key: "reason", label: "신청 사유" },
      // 환불계좌 3필드(2026-08-22 추가) — 가상계좌 결제 건 환불에 실제로
      // 쓰이는 계좌다(api/complete-refund.ts 가 토스 결제취소 API의
      // refundReceiveAccount로 그대로 넘긴다). columns 배열은 목록 전용이라
      // 이 저장소의 AdminEngine 렌더 구조상 애초에 인라인 편집이 없다 —
      // 편집은 아래 fields(상세/수정 폼)로만 가능하므로 별도 readOnly 플래그가
      // 필요 없다. refund_bank 는 코드로 저장되어(paymentReceiptFormat.ts
      // BANKS와 같은 코드 체계) select 타입으로 은행명을 사람이 읽게 푼다.
      {
        key: "refund_bank",
        label: "환불 은행",
        type: "select",
        options: BANK_OPTIONS,
      },
      { key: "refund_account", label: "환불 계좌번호" },
      { key: "refund_holder", label: "환불 예금주" },
      {
        key: "approval_status",
        label: "승인 여부",
        type: "select",
        options: REFUND_APPROVAL_STATUS_OPTIONS,
      },
      {
        key: "status",
        label: "상태",
        type: "select",
        options: REFUND_REQUEST_STATUS_OPTIONS,
      },
      { key: "created_at", label: "환불 신청일", type: "date" },
      // QA 273 — 신청일만 있고 처리일이 없어 일자별 환불 집계도 정산 대사도 할 수
      // 없었다. fn_complete_refund 가 완료 시점에 찍는다(20260831081100).
      // 그 컬럼이 생기기 전에 처리된 건은 빈 칸이다 — 실제 시각을 알 수 없어
      // 소급하지 않았다.
      { key: "completed_at", label: "환불 처리일", type: "date" },
    ],
    fields: [
      { key: "user_id", label: "신청자", type: "text" },
      { key: "order_id", label: "주문번호", type: "text" },
      { key: "order_name", label: "주문명", type: "text" },
      { key: "amount", label: "환불 신청 금액", type: "number" },
      { key: "reason", label: "신청 사유", type: "textarea" },
      { key: "refund_bank", label: "은행", type: "text" },
      { key: "refund_account", label: "계좌번호", type: "text" },
      { key: "refund_holder", label: "예금주", type: "text" },
      // completed 는 select 에서 뺐다 — fn_complete_refund RPC 전용(위
      // REFUND_REQUEST_STATUS_EDIT_OPTIONS 주석 참고, WC038 트리거).
      {
        key: "status",
        label: "상태",
        type: "select",
        options: REFUND_REQUEST_STATUS_EDIT_OPTIONS,
      },
      { key: "admin_memo", label: "관리자 메모", type: "textarea" },
    ],
  },

  // custom: true 는 Admin() 최상단 렌더 분기가 제네릭 list/create/edit 경로를
  // 통째로 건너뛰게 한다(loadRows 도 early return). customComponentKey 지정은
  // premiumBookPages 와 같은 일반화 지점이다.
  coupons: {
    title: "쿠폰관리",
    custom: true,
    customComponentKey: "coupons",
    searchPlaceholder: "",
  },

  // QA 275 — 파일18 「환불 처리 대장」. 완료된 환불만 보는 결과 원장이라 신청
  // 단계(refundRequests)와 화면을 나눈다. 원천은 admin_refund_ledger 뷰
  // (20260831081100) — 학생·처리자 이름과 소속코드를 조인해 평면화했다.
  //
  // 읽기 전용이다. 완료 처리는 fn_complete_refund RPC 전용이고(WC038 트리거가
  // 제네릭 PATCH 로의 completed 전환을 막는다), 대장을 손으로 고칠 수 있으면
  // 감사 기록이 되지 못한다.
  //
  // ⚠️ 수강자명·소속명이 함께 나가므로 다운로드는 게이트를 탄다(QA 268 계열).
  refundLedger: {
    title: "환불 처리 대장",
    table: "admin_refund_ledger",
    searchPlaceholder: "수강자명, 주문번호, 소속명 검색",
    order: "completed_at",
    readOnly: true,
    noCreate: true,
    excel: true,
    sensitiveDownload: true,
    columns: [
      { key: "completed_at", label: "처리일", type: "date" },
      { key: "student_name", label: "수강자명" },
      { key: "program_name", label: "프로그램" },
      // 2026-09-22 — org_code(자유 입력 text) → tenant_name(tenants FK 조인,
      // admin_refund_ledger 뷰가 이미 끝에 붙여 반환한다) 로 교체.
      { key: "tenant_name", label: "소속" },
      { key: "paid_amount", label: "납부금액", type: "money" },
      { key: "refund_amount", label: "환불금액", type: "money" },
      { key: "refund_method", label: "환불방법" },
      { key: "processed_by_name", label: "처리자" },
      { key: "reason", label: "사유" },
    ],
    fields: [
      { key: "completed_at", label: "처리일", type: "text", readOnly: true },
      { key: "order_id", label: "주문번호", type: "text", readOnly: true },
      { key: "student_name", label: "수강자명", type: "text", readOnly: true },
      { key: "tenant_name", label: "소속", type: "text", readOnly: true },
      { key: "program_name", label: "프로그램", type: "text", readOnly: true },
      { key: "paid_amount", label: "납부금액", type: "text", readOnly: true },
      { key: "refund_amount", label: "환불금액", type: "text", readOnly: true },
      { key: "refund_method", label: "환불방법", type: "text", readOnly: true },
      {
        key: "processed_by_name",
        label: "처리자",
        type: "text",
        readOnly: true,
      },
      { key: "reason", label: "신청 사유", type: "textarea", readOnly: true },
      {
        key: "admin_memo",
        label: "처리 메모",
        type: "textarea",
        readOnly: true,
      },
    ],
  },
};
