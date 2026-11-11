import { useCallback, useEffect, useState } from "react";
import { useBundleCompositionMap } from "@/components/mypage/bundleComposition";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatKRW } from "@/data/pricingCatalog";
import type { VirtualAccountInfo } from "@/hooks/usePaymentConfirmation";
import { supabase } from "@/lib/supabase";
import MyPageModalShell from "./MyPageModalShell";
import ModalFooter from "./modal/ModalFooter";
import RefundAmountSummary from "./modal/RefundAmountSummary";
import RefundAccountFields from "./RefundAccountFields";

// 환불 신청 모달 (Figma 3665:6635).
//
// 금액 3행(결제 금액 / 취소 수수료 / 환불 금액)은 **서버가 계산한다** —
// fn_refund_quote(sql/72_refund_policy_calc.sql)를 그대로 호출해 보여준다.
// 프런트에서 같은 계산을 다시 구현하지 않는 이유는, 실제로 기록되는 금액
// (fn_request_refund)이 이 함수를 쓰기 때문이다. 화면과 DB가 다른 숫자를
// 말하는 상황이 구조적으로 생길 수 없어야 한다.
//
// 계좌 3필드(은행/계좌번호/예금주)는 시안에 없어 처음엔 뺐지만(2026-08-13),
// 카드 부분취소·계좌 환불을 토스로 일원화하면서(api/_routes/complete-refund.ts) 가상
// 계좌 결제 건은 이 계좌가 없으면 실제로 환급할 방법이 없어졌다 — 그래서
// **학부모(결제자) 역할 + 가상계좌 결제 건에 한해** 다시 필수로 받는다
// (2026-08-22, 환불 갭 해결 확정 설계). 학생 화면(asStudent)에는 여전히
// 노출하지 않는다 — 학생은 금액도 못 보는 화면이라(2026-08-13 확정) 계좌
// 정보를 물을 대상이 아니다. 학생이 신청한 건은 학부모가 승인할 때
// (RefundApprovalModal) 계좌를 받는다.

const ETC_REASON = "기타 사유 (직접 입력)";

// 확정 디자인(3967:3561) 실측 6종. 표시 순서까지 시안 그대로다.
// 이전 구현은 '서비스 이용 장애'를 포함한 7종이었다(구 시안 3665:6635).
const REASONS = [
  "단순 변심",
  "잘못된 상품 결제",
  "중복·오결제",
  "강의 내용·품질 불만족",
  "강의 취소·폐강 등 운영상 사유",
  ETC_REASON,
];

// 시안 노란 박스 문구(3665:6635 실측). 시안의 "취소 수수료" 문구는 이용약관
// Ver9·Ver10 어디에도 근거 조항이 없어 제외했다(2026-08-29).
const POLICY_NOTICE =
  "이용을 시작한 서비스는 이용 기간·횟수분을 제외하고 환불돼요";

// fn_refund_quote.policy_code → 사용자 안내. 산정 규칙은 이용약관 제33조의1이며
// 코드 어휘는 sql/72 파일 상단 주석과 1:1 대응한다.
// ⚠ 아래 문구는 시안에 없는 신규 사용자 노출 카피다 — 도입 전 승인 필요.
const POLICY_TEXT = {
  before_start: "아직 이용을 시작하지 않아 전액 환불됩니다.",
  sessions_prorated: "사용하지 않은 잔여 횟수만큼 환불됩니다.",
  single_use_closed:
    "1회 이용권은 서비스가 시작된 후에는 환불이 제한됩니다(이용약관 제33조의1 ④).",
  period_tier: "이용 기간 경과분을 제외하고 환불됩니다(이용약관 제33조의1 ②).",
  period_prorated:
    "중도 환불 시 장기 할인이 취소되어 정가 기준으로 이용분을 정산합니다(이용약관 제33조의1 ⑪).",
  mixed: "상품별 규정에 따라 각각 산정한 금액을 합산했습니다.",
  no_grant: "이용 내역을 확인한 뒤 환불 금액이 확정됩니다.",
  period_unbounded: "이용 내역을 확인한 뒤 환불 금액이 확정됩니다.",
  // fn_refund_quote Ver10(20260901) 신규 코드. ⚠ 신규 카피 — 승인 필요.
  expired:
    "이용 기간(유효기간)이 만료되어 환불 가능 금액이 없습니다(이용약관 제33조의1 ⑤·⑥).",
  // ⚠ 신규 카피 — 승인 필요.
  free_item:
    "무상으로 제공된 상품은 환불 금액 산정에서 제외됩니다(이용약관 제33조의3 ⑥).",
  // ⚠ 신규 카피 — 승인 필요.
  period_monthly_tier:
    "이용한 개월수는 정가 기준으로 정산하고 남은 기간을 환불합니다(이용약관 제33조의1 ②·⑪).",
  // ⚠ 신규 카피 — 승인 필요.
  period_monthly_tier_noreprice:
    "청약철회 기간 내 신청으로, 결제 금액 기준으로 이용분만 제외하고 환불됩니다(이용약관 제32조·제33조의1 ②).",
};

// fn_request_refund 의 서버측 거부 사유. WC005~WC007 문구는 기존
// PaymentsTab 의 것을 그대로 옮겼다(팀 리드 승인 문자열).
const REFUND_ERROR_TEXT = {
  WC005: "본인 주문이 아닙니다.",
  WC006: "결제가 확인된 주문만 환불 신청할 수 있습니다.",
  WC007: "이미 처리 중인 환불 신청이 있습니다.",
  // sql/69 에서 도입된 누적 환불액 가드. ⚠ 신규 카피 — 승인 필요.
  WC037: "이미 환불이 완료된 주문입니다.",
  // sql/88 — 학부모 반려 건 재신청 차단(종결 축). ⚠ 신규 카피 — 승인 필요.
  WC057: "학부모님이 반려한 주문은 다시 환불 신청할 수 없습니다.",
  // 2026-08-22 — 학부모 직접 신청은 즉시 approved 로 들어가 다시 계좌를
  // 받을 기회가 없다. 프런트가 이미 필수 입력으로 막지만, RPC 직접 호출
  // 등으로 우회하면 서버가 여기서 막는다(RefundApprovalModal과 동일 문구).
  WC058: "가상계좌 환불은 환불계좌(은행/계좌번호/예금주) 입력이 필요합니다.",
  // 구성서비스 부분해지(fn_refund_quote Ver10, 20260901) — 대상 항목이 이미
  // 회수됐거나 주문에 없다. ⚠ 신규 카피 — 승인 필요.
  WC060: "선택한 항목은 환불할 수 없는 상태입니다. 화면을 새로고침해 주세요.",
  // 열린 다른 신청과 대상 항목이 겹친다(부분해지 축, WC007과 별도).
  // ⚠ 신규 카피 — 승인 필요.
  WC061: "선택한 항목에 이미 진행 중인 환불 신청이 있습니다.",
};
const REFUND_UNKNOWN_ERROR_TEXT =
  "환불 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.";

const QUOTE_LOAD_ERROR_TEXT =
  "환불 금액을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

type RefundOrder = {
  id: string;
  order_name?: string | null;
  amount: number;
  virtual_account?: VirtualAccountInfo | null;
};

// fn_refund_quote lines(jsonb) 원소 — 체크박스 렌더·표시에 쓰는 필드만.
type QuoteLine = {
  order_item_id: number;
  item_name: string;
  paid_allocated: number;
  refund: number;
  policy_code?: string;
};

type RefundQuote = {
  refund_amount: number;
  fee_amount: number;
  gross_amount?: number;
  policy_code?: string;
  // Ver10(20260901) 신규 필드 — 구성서비스 부분해지.
  scope?: string;
  coupon_restore?: boolean;
  lines?: QuoteLine[];
};

type RefundRequestModalProps = {
  open: boolean;
  order: RefundOrder | null;
  asStudent?: boolean;
  parentName?: string;
  onClose: () => void;
  onSubmitted?: () => void;
  onStaleData?: () => void;
};

export default function RefundRequestModal({
  open,
  order,
  asStudent = false,
  parentName = "",
  onClose,
  onSubmitted,
  onStaleData,
}: RefundRequestModalProps) {
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  // 모달이 열릴 때 받은 "주문 전체" 산정 — 전체 선택으로 되돌아갈 때 재호출 없이
  // 재사용한다.
  const [fullQuote, setFullQuote] = useState<RefundQuote | null>(null);
  // 체크박스 목록 — 최초 응답 기준으로 고정한다(부분 재산정 응답은 선택된
  // 라인만 담고 있어 목록으로 쓰면 체크박스가 사라진다). 2개 이상일 때만 값을
  // 채운다 — 1개 이하면 구성서비스 선택 UI 자체가 없다.
  const [allLines, setAllLines] = useState<QuoteLine[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [quoteError, setQuoteError] = useState("");
  const [loading, setLoading] = useState(false);

  // 라인이 1개뿐이라(번들 등 부분환불 없는 주문) allLines가 비었을 때도 그
  // 라인 아래에 구성 내역을 붙이려면 order_item_id가 필요하다 — 체크박스
  // 유무와 무관하게 항상 채운다(체크박스 목록과 달리 재산정으로 사라지지
  // 않는다, 첫 응답 그대로 고정).
  const [initialLines, setInitialLines] = useState<QuoteLine[]>([]);
  // order_item_id → product_id — 구성서비스 내역(bundleComposition)을 찾는
  // 키. 이 모달이 받는 order prop에는 product_id가 없어 직접 조회한다
  // (order_items RLS "select own"은 주문 당사자면 통과 — ReceiptModal과
  // 같은 근거).
  const [orderItemProductIds, setOrderItemProductIds] = useState<
    Record<number, string | null>
  >({});
  const bundleMap = useBundleCompositionMap(Object.values(orderItemProductIds));

  const [reason, setReason] = useState("");
  const [etcText, setEtcText] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [refundBank, setRefundBank] = useState("");
  const [refundAccount, setRefundAccount] = useState("");
  const [refundHolder, setRefundHolder] = useState("");

  const orderId = order?.id;
  const virtualAccount = order?.virtual_account ?? null;
  const isVirtualAccountOrder = Boolean(virtualAccount);
  // 계좌 필드는 학부모(asStudent=false) + 가상계좌 결제 건에서만 필요하다.
  const showAccountFields = !asStudent && isVirtualAccountOrder;

  // 열릴 때마다 산정을 새로 받는다. 회차 소비·기간 경과는 시간이 지나면
  // 바뀌므로 캐시하지 않는다. virtualAccount는 order 프롭에서 파생되는데,
  // order는 상위(ParentPaymentsTab)가 매 렌더 새 배열/객체로 내려줄 수 있어
  // deps에 넣으면 입력 중인 계좌 값이 다른 이유의 재렌더로 초기화된다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: orderId(스칼라) 하나로 "이 모달이 다른 주문을 위해 다시 열렸는가"만 판별하는 기존 설계를 그대로 따른다.
  useEffect(() => {
    if (!open || !orderId) return undefined;
    let alive = true;

    setLoading(true);
    setQuote(null);
    setFullQuote(null);
    setAllLines(null);
    setInitialLines([]);
    setSelectedIds(new Set());
    setOrderItemProductIds({});
    setQuoteError("");
    setReason("");
    setEtcText("");
    setSubmitError("");
    // 결제 시점에 이미 환불계좌가 있으면(위 VirtualAccountInfo.refundReceiveAccount
    // 주석 참고) 프리필하고, 없으면 빈 값 — 지어내지 않는다.
    const prefill = virtualAccount?.refundReceiveAccount;
    setRefundBank(prefill?.bank || "");
    setRefundAccount(prefill?.accountNumber || "");
    setRefundHolder(prefill?.holderName || "");

    // 구성 내역(bundleComposition)에 필요한 order_item_id → product_id는
    // 산정과 독립이라 병렬로 받는다. 실패해도 조용히 생략한다(구성 내역은
    // 부가 정보 — 전체 모달을 막지 않는다, useBundleCompositionMap과 같은 방침).
    supabase
      .from("order_items")
      .select("id, product_id")
      .eq("order_id", orderId)
      .then(({ data, error }) => {
        if (!alive || error || !data) return;
        const map: Record<number, string | null> = {};
        for (const row of data) map[row.id] = row.product_id ?? null;
        setOrderItemProductIds(map);
      });

    (async () => {
      const { data, error } = await supabase.rpc("fn_refund_quote", {
        p_order_id: orderId,
      });

      if (!alive) return;
      setLoading(false);

      if (error) {
        console.error("환불 금액 산정 실패:", error);
        setQuoteError(REFUND_ERROR_TEXT[error.code] || QUOTE_LOAD_ERROR_TEXT);
        return;
      }

      // RETURNS TABLE 이라 1행짜리 배열로 온다.
      const rawRow = Array.isArray(data) ? data[0] : data;
      if (!rawRow) {
        setQuoteError(QUOTE_LOAD_ERROR_TEXT);
        return;
      }
      // fn_refund_quote의 lines(jsonb 컬럼)는 생성 타입이 Json으로만 표현한다 —
      // 실제 모양은 QuoteLine[]이다(jsonb_agg로 만든 배열, 위 QuoteLine 타입 참고).
      const row = rawRow as unknown as RefundQuote;
      setQuote(row);
      setFullQuote(row);

      // 구성서비스가 2개 이상인 주문만 부분해지 체크박스를 보여준다. 기본값은
      // 전체 선택 — 지금까지의 "주문 전체 환불" 동작과 결과가 같다.
      const rowLines: QuoteLine[] = Array.isArray(row.lines) ? row.lines : [];
      setInitialLines(rowLines);
      if (rowLines.length >= 2) {
        setAllLines(rowLines);
        setSelectedIds(new Set(rowLines.map((l) => l.order_item_id)));
      } else {
        setAllLines(null);
        setSelectedIds(new Set());
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, orderId]);

  // 선택 집합이 바뀔 때마다 재산정한다. 전체 선택이면 위에서 이미 받은
  // fullQuote 를 재사용하고(재호출 없음), 0개면 재산정 자체를 하지 않는다
  // (제출도 막는다 — 아래 canSubmit).
  useEffect(() => {
    if (!open || !orderId || !allLines) return undefined;

    if (selectedIds.size === allLines.length) {
      if (fullQuote) setQuote(fullQuote);
      return undefined;
    }
    if (selectedIds.size === 0) return undefined;

    let alive = true;
    setLoading(true);
    setQuoteError("");

    (async () => {
      const { data, error } = await supabase.rpc("fn_refund_quote", {
        p_order_id: orderId,
        p_order_item_ids: Array.from(selectedIds),
      });

      if (!alive) return;
      setLoading(false);

      if (error) {
        console.error("환불 금액 재산정 실패:", error);
        setQuoteError(REFUND_ERROR_TEXT[error.code] || QUOTE_LOAD_ERROR_TEXT);
        return;
      }

      const rawRow = Array.isArray(data) ? data[0] : data;
      if (!rawRow) {
        setQuoteError(QUOTE_LOAD_ERROR_TEXT);
        return;
      }
      // fn_refund_quote의 lines(jsonb 컬럼) 캐스트 — 위 블록과 동일 이유.
      setQuote(rawRow as unknown as RefundQuote);
    })();

    return () => {
      alive = false;
    };
  }, [open, orderId, allLines, selectedIds, fullQuote]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 체크박스 UI가 있는 주문(allLines 존재)에서 일부만 선택된 상태인지 —
  // 전체 선택이면 p_order_item_ids 를 생략해 주문 전체 신청과 동일하게 보낸다.
  const isPartialSelection =
    Boolean(allLines) && selectedIds.size < (allLines?.length ?? 0);

  const handleSubmit = useCallback(async () => {
    if (!orderId || saving) return;
    // 체크박스 UI가 있는데 0개 선택이면 제출하지 않는다(버튼도 비활성화되지만
    // 방어적으로 한 번 더 막는다).
    if (allLines && selectedIds.size === 0) return;

    const finalReason = reason === ETC_REASON ? etcText.trim() : reason;
    if (!finalReason) return;

    setSaving(true);
    setSubmitError("");

    // 금액은 보내지 않는다 — 서버가 fn_refund_quote 로 다시 산정해 기록한다.
    const { error } = await supabase.rpc("fn_request_refund", {
      p_order_id: orderId,
      p_reason: finalReason,
      // 구성서비스 일부만 선택했을 때만 실어 보낸다 — 전체 선택은 생략해야
      // 서버가 scope='order' 로 산정한다(§2-10, 전체를 배열로 넘겨도 서버가
      // 승격은 하지만 의도를 명확히 하는 쪽을 따른다).
      ...(isPartialSelection
        ? { p_order_item_ids: Array.from(selectedIds) }
        : {}),
      // 가상계좌 결제 건만 실어 보낸다 — 카드 결제 건에 빈 문자열을 보내면
      // fn_request_refund 가 저장은 하되(스키마상 막지 않는다) 의미 없는 값이
      // refund_requests 에 남는다.
      ...(showAccountFields
        ? {
            p_refund_bank: refundBank,
            p_refund_account: refundAccount.trim(),
            p_refund_holder: refundHolder.trim(),
          }
        : {}),
    });

    setSaving(false);

    if (error) {
      console.error("환불 신청 저장 실패:", error);
      setSubmitError(
        error.code in REFUND_ERROR_TEXT
          ? REFUND_ERROR_TEXT[error.code]
          : REFUND_UNKNOWN_ERROR_TEXT,
      );

      // 서버가 "이미 신청이 있다"(WC007) · "이미 환불 완료"(WC037) · "대상
      // 항목이 유효하지 않다"(WC060) · "대상 항목이 열린 신청과 겹친다"(WC061)
      // 라고 하면 화면의 환불 목록/구성서비스 상태가 낡았다는 뜻이다 — 이
      // 화면을 연 뒤에(또는 다른 탭/기기에서) 상태가 바뀐 경우다. 목록을 다시
      // 읽어 표의 상태 배지가 갱신되게 하고, 그러면 진입 버튼도 사라진다.
      // 이걸 안 하면 사용자가 같은 버튼을 계속 눌러 같은 에러만 반복해서 본다.
      if (
        error.code === "WC007" ||
        error.code === "WC037" ||
        error.code === "WC060" ||
        error.code === "WC061"
      )
        onStaleData?.();
      return;
    }

    onSubmitted?.();
  }, [
    orderId,
    reason,
    etcText,
    saving,
    onSubmitted,
    onStaleData,
    showAccountFields,
    refundBank,
    refundAccount,
    refundHolder,
    allLines,
    selectedIds,
    isPartialSelection,
  ]);

  if (!open || !order) return null;

  const refundAmount = quote ? Number(quote.refund_amount) : null;
  const grossAmount = quote ? Number(quote.gross_amount) : Number(order.amount);

  // gross_amount 는 scope 와 무관하게 항상 "주문 전체" 결제액이다(fn_refund_quote
  // 는 v_order.amount 를 그대로 돌려준다). 일부 선택(scope='items')일 때는 그
  // 위에 "선택 항목 결제액"(선택된 라인의 안분결제액 합)을 별도로 보여준다.
  const selectedPaidSum =
    quote?.scope === "items" && quote.lines
      ? quote.lines.reduce((sum, line) => sum + Number(line.paid_allocated), 0)
      : null;

  // "이용분 공제" = 이번 산정의 기준액(전체 선택이면 결제 금액, 일부 선택이면
  // 선택 항목 결제액) − 환불 금액. 이전의 "취소 수수료"(quote.fee_amount) 행을
  // 대체한다 — 부분해지에서는 fee_amount 가 주문 전체 기준이라 화면에 보이는
  // 선택 범위와 안 맞는다.
  const usageBase =
    quote?.scope === "items" && selectedPaidSum !== null
      ? selectedPaidSum
      : grossAmount;
  const usageDeduction =
    refundAmount !== null ? Math.max(usageBase - refundAmount, 0) : null;

  // 산정액이 0원이면 신청 버튼을 막는다. 신청을 접수시키면 학부모 본인 신청은
  // 즉시 승인(approval_status='approved')으로 들어가고, 어드민이 완료 처리하는
  // 순간 fn_complete_refund 가 권한을 회수한다 — 돈은 0원 돌려받고 이용 권한만
  // 잃는 결과가 된다. 예외 환불이 필요한 경우는 고객센터로 안내한다.
  // (DB 는 amount >= 0 을 허용한다 — 어드민이 예외 판단할 여지를 남긴 것이고,
  //  일반 사용자 경로에서 그 상태를 만들지 않는 것은 이 화면의 책임이다.)
  const blockedByPolicy = quote !== null && refundAmount === 0;

  const reasonFilled =
    Boolean(reason) && (reason !== ETC_REASON || etcText.trim().length > 0);
  const accountFieldsFilled =
    !showAccountFields ||
    (Boolean(refundBank) &&
      refundAccount.trim().length > 0 &&
      refundHolder.trim().length > 0);
  // 구성서비스 체크박스가 있는 주문(allLines 존재)은 최소 1개 선택돼야 한다.
  const hasValidSelection = !allLines || selectedIds.size > 0;
  const canSubmit =
    !loading &&
    !quoteError &&
    !blockedByPolicy &&
    reasonFilled &&
    accountFieldsFilled &&
    hasValidSelection &&
    !saving;

  const policyText = quote ? POLICY_TEXT[quote.policy_code || ""] : "";

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="sm"
      title={asStudent ? "환불을 요청할게요" : "환불을 신청할게요"}
      // 학생 모드 안내(3967:3561 실측) — 결제 주체가 학부모라는 사실과 요청이
      // 어디로 가는지를 먼저 알려준다. 학부모 모드는 부제가 없다.
      subtitle={
        asStudent ? (
          <>
            결제는 {parentName ? `${parentName} ` : ""}학부모님이 하셨어요. 환불
            요청을 보내면 학부모님이 확인 후 환불을 진행합니다.
          </>
        ) : undefined
      }
      footer={
        <ModalFooter
          buttons={[
            {
              key: "cancel",
              label: "취소",
              variant: "neutral",
              onClick: onClose,
            },
            {
              key: "submit",
              label: saving
                ? "접수 중..."
                : asStudent
                  ? "환불 요청 하기"
                  : "환불 하기",
              variant: "destructive",
              disabled: !canSubmit,
              onClick: handleSubmit,
            },
          ]}
        />
      }
    >
      <ScrollArea className="flex-1 px-6">
        {/* 취소/환불 규정 안내 */}
        <p className="mt-6 text-[0.8125rem] font-semibold text-ink">
          취소/환불 규정 안내
        </p>
        <p className="mt-2 whitespace-pre-line break-keep rounded-xl bg-[#FFF7E0] px-4 py-3 text-[0.8125rem] leading-relaxed text-[#8A6D1F]">
          {POLICY_NOTICE}
        </p>

        {/* 금액 3행 */}
        <div className="mt-6">
          <p
            className="truncate text-[0.9375rem] font-semibold text-ink"
            title={order.order_name ?? undefined}
          >
            {order.order_name}
          </p>

          {/* 구성 이용권 내역(bundleComposition, 2026-09-01) — 번들 라인은
              부분환불 없이 1개로 유지하되(fn_refund_quote_dedupe_bundle_lines),
              그 라인이 무엇으로 구성됐는지는 영수증(ReceiptModal)과 같은
              방식으로 부속 라인에 보여준다. 금액 없이 구성만 — 라인이
              1개뿐이라 체크박스 UI가 없을 때만 제목 바로 아래 붙는다(2개
              이상이면 아래 각 체크박스 라인에 붙는다). */}
          {initialLines.length === 1 &&
            (() => {
              const soleLine = initialLines[0];
              if (!soleLine) return null;
              const note =
                bundleMap.get(
                  orderItemProductIds[soleLine.order_item_id] || "",
                ) ?? [];
              if (note.length === 0) return null;
              return (
                <div className="mt-1.5 flex flex-col gap-0.5 pl-1">
                  {note.map((line) => (
                    <p key={line} className="text-xs text-ink-sub">
                      {line}
                    </p>
                  ))}
                </div>
              );
            })()}

          {/* 구성서비스 선택(fn_refund_quote Ver10, 20260901) — 시안에 없는
              신규 UI. 구성서비스가 2개 이상인 주문에서만 나타난다. 기본은
              전체 선택 — 이 목록은 최초 응답 기준으로 고정한다(위 allLines
              주석 참고). 제목 "구성서비스 선택"은 약관 용어(제33조의2 ①
              "구성서비스") 차용 — 사용자 확정 2026-09-01. */}
          {allLines && allLines.length >= 2 && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-[0.8125rem] font-semibold text-ink">
                구성서비스 선택
              </p>
              {allLines.map((line) => {
                const checked = selectedIds.has(line.order_item_id);
                const note =
                  bundleMap.get(
                    orderItemProductIds[line.order_item_id] || "",
                  ) ?? [];
                return (
                  <div key={line.order_item_id}>
                    <label
                      className={`flex h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 transition ${
                        checked
                          ? "border-accent bg-surface-info"
                          : "border-line"
                      } ${loading ? "opacity-60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={loading}
                        onChange={() => toggleSelected(line.order_item_id)}
                        className="h-4 w-4 shrink-0 rounded border-line accent-accent"
                      />
                      <span className="flex-1 truncate text-[0.875rem] text-ink">
                        {line.item_name}
                      </span>
                      {!asStudent && (
                        <span className="shrink-0 text-[0.8125rem] text-ink-sub">
                          {formatKRW(Number(line.refund))}
                        </span>
                      )}
                    </label>
                    {note.length > 0 && (
                      <div className="mt-1.5 flex flex-col gap-0.5 pl-4">
                        {note.map((n) => (
                          <p key={n} className="text-xs text-ink-sub">
                            {n}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {selectedIds.size === 0 && (
                // ⚠ 신규 카피 — 승인 필요.
                <p className="text-[0.8125rem] text-error">
                  환불할 항목을 1개 이상 선택해 주세요.
                </p>
              )}
            </div>
          )}

          {/* 금액은 학생에게 보여주지 않는다(2026-08-13 확정) — 결제 주체인
              학부모의 확인 화면(RefundApprovalModal)에서만 공개한다. 산정 자체는
              그대로 돌아간다(아래 blockedByPolicy 가 0원 건을 막는 근거로 쓴다). */}
          {(() => {
            if (asStudent) return null;
            if (loading)
              return (
                <p className="mt-3 text-[0.875rem] text-ink-sub">
                  환불 금액 계산 중...
                </p>
              );
            if (quoteError)
              return (
                <p className="mt-3 text-[0.875rem] text-error">{quoteError}</p>
              );
            return (
              <div>
                {/* 일부 선택(scope='items')일 때만 — 선택 범위의 결제액을
                    RefundAmountSummary의 안분결제액 행으로 별도 보여준다.
                    전체 선택이면 결제 금액과 같아 생략한다. */}
                <RefundAmountSummary
                  gross={grossAmount}
                  paidAllocated={
                    quote?.scope === "items" ? selectedPaidSum : undefined
                  }
                  // 이 분기(loading=false, quoteError="")는 fetch 성공 후
                  // setQuote(row)까지 끝난 상태라 usageDeduction/refundAmount는
                  // 항상 non-null이다.
                  fee={usageDeduction}
                  refund={refundAmount ?? 0}
                />

                {policyText && (
                  <p className="mt-2 break-keep text-[0.75rem] leading-relaxed text-ink-sub">
                    {policyText}
                  </p>
                )}

                {quote?.coupon_restore && (
                  // ⚠ 신규 카피 — 승인 필요.
                  <p className="mt-2 break-keep text-[0.75rem] leading-relaxed text-ink-sub">
                    결제에 사용한 쿠폰은 환불 완료 시 복원됩니다.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* 환불계좌 — 학부모 + 가상계좌 결제 건만(위 파일 상단 주석 참고).
              0원 환불이면 계좌도 필요 없으므로 blockedByPolicy 와 함께 숨긴다. */}
        {showAccountFields && !blockedByPolicy && (
          <RefundAccountFields
            bank={refundBank}
            account={refundAccount}
            holder={refundHolder}
            onBankChange={setRefundBank}
            onAccountChange={setRefundAccount}
            onHolderChange={setRefundHolder}
          />
        )}

        {/* 사유 선택 — 환불 금액이 0원이면 고를 필요가 없으므로 숨긴다. */}
        {!blockedByPolicy && (
          <div className="mt-6 flex flex-col gap-2 pb-2">
            {REASONS.map((item) => {
              const selected = reason === item;
              return (
                <label
                  key={item}
                  className={`flex h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 transition ${
                    selected ? "border-accent bg-surface-info" : "border-line"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected ? "border-accent" : "border-line"
                    }`}
                  >
                    {selected && (
                      <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                    )}
                  </span>
                  <input
                    type="radio"
                    name="refund-reason"
                    value={item}
                    checked={selected}
                    onChange={() => setReason(item)}
                    className="sr-only"
                  />
                  <span className="text-[0.875rem] text-ink">{item}</span>
                </label>
              );
            })}

            {reason === ETC_REASON && (
              // 시안 placeholder 는 "탈퇴 사유를 직접 입력해주세요"인데, 회원 탈퇴
              // 모달에서 복사되며 남은 오타로 보인다(여기는 환불 모달이다).
              // "환불 사유"로 고쳐 쓴다 — 디자이너 확인 필요.
              <input
                type="text"
                value={etcText}
                onChange={(e) => setEtcText(e.target.value)}
                placeholder="환불 사유를 직접 입력해주세요"
                className="h-12 w-full rounded-xl border border-line px-4 text-[0.875rem] text-ink outline-hidden focus:border-accent"
              />
            )}
          </div>
        )}

        {blockedByPolicy && (
          // ⚠ 신규 카피 — 승인 필요.
          <p className="mt-4 break-keep rounded-xl bg-[#FCEAEE] px-4 py-3 text-[0.8125rem] leading-relaxed text-[#D6336C]">
            이 주문은 환불 가능 금액이 없어 신청을 접수할 수 없습니다. 서비스
            이용에 문제가 있었다면 고객센터로 문의해 주세요.
          </p>
        )}

        {submitError && (
          <p className="mt-4 text-[0.875rem] text-error">{submitError}</p>
        )}
      </ScrollArea>
    </MyPageModalShell>
  );
}
