import { Check, CheckCircle2, Clock, Copy } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { COMPANY } from "@/data/company";
import { useMemberType } from "@/hooks/useMemberType";
import type { PaymentInfo } from "@/hooks/usePaymentConfirmation";
import { usePaymentConfirmation } from "@/hooks/usePaymentConfirmation";
import { useSignupEnabled } from "@/hooks/useSignupEnabled";
import { openPaidServiceOrAlert } from "@/lib/paidServiceAccess";
import {
  accountLabel,
  formatCardNumber,
  formatDateTime,
  installmentLabel,
  methodLabel,
} from "@/lib/paymentReceiptFormat";
import { buildAccessInfoBody } from "./paymentSuccessCopy";

// 색은 전부 tailwind 토큰으로 쓴다(하드코딩 hex 없음). 이전 ACCENT = '#2563EB' 는
// 시안 어느 캔버스에도 없는 값이었다 — 완료 화면 시안을 픽셀 실측하면
//   390(1882:14145)  체크 아이콘·CTA = #013262 (= primary)
//   1920(1882:13833) 체크 아이콘·CTA = #191d23 (토큰 없음, 최근접 ink.title #181d24)
// 로 캔버스끼리 갈린다. 브레이크포인트마다 CTA 색이 바뀌는 편보다 브랜드 네이비로
// 통일하는 편이 맞다고 판단해 두 폭 모두 primary 를 쓴다 — 390 시안 실측색과 일치하고,
// 같은 플로우의 로그인 CTA(PrimaryButton = bg-primary)와도 같은 색이 된다.
// (1920 차콜은 사용자 재확인 대기 항목으로 보고했다.)

// 부여된 program_key → '프로그램 시작하기' 목적지.
//
// 즉시 입장 모델이라 CTA 는 결제 직후 실제 서비스로 들어가야 한다. 입장(SSO)이
// 성립하는 서비스는 목표관리·수행평가 2건뿐이다(api/create-service-ticket.js:7-22 의
// SERVICE_CONFIGS, src/lib/paidServiceAccess.js:5 의 PAID_SERVICE_CONFIGS).
//
// 키는 service_key 가 아니라 **부여 결과(access.granted)의 program_key** 다
// (api/_lib/programAccess.js 가 program_key 배열을 돌려준다). 목표관리는
// service_key='goal' 이지만 program_key 는 'target' 이다(2026-08-11 사용자 확정 —
// 운영 DB 실데이터 기준. 이 관계는 이제 DB 정본이다 —
// sql/60_product_program_relation.sql 의 products.program_key 컬럼 참고.
// 2026-08-12 부터 부여는 sql/64 의 fn_grant_program_access_for_order 가
// 그 컬럼을 직접 조회해 수행한다(예전 JS 하드코딩 맵도, 그 뒤의
// getServiceKeyToProgramKeyMap 도 이제 없다). 수행평가는
// service_key = program_key = 'suhaeng' 로 같은 문자열이다.
// 기준을 granted 로 두면 "권한이 실제로 들어간 것만 입장 버튼이 생긴다"가 코드로
// 보장된다 — 결제만 되고 부여가 없는 상품에 입장 버튼을 띄우는 사고를 구조적으로
// 막는다.
//
// openPaidServiceOrAlert 는 service_key 를 직접 받지 않고 서비스 설명 텍스트를
// 키워드로 매칭한다(src/lib/paidServiceAccess.js:9-60). 그 파일은 이번 작업
// 범위가 아니라 API 를 못 바꾸므로, 매칭에 걸리는 대표 토큰을 slug 로 넘긴다.
// 매칭이 실패하면 같은 함수가 link 로 이동하므로 상세 페이지가 폴백이 된다.
// (아래 엔트리의 serviceKey 필드는 매칭용 slug 를 보조하는 표시값일 뿐, 실제
// create-service-ticket 요청의 service_key 는 paidServiceAccess.js 의
// PAID_SERVICE_CONFIGS 매칭 결과에서 나온다 — 'goal' 그대로 유지.)
interface ServiceEntry {
  serviceKey: string;
  slug: string;
  link: string;
  label: string;
}

const SERVICE_ENTRY: Record<string, ServiceEntry> = {
  target: {
    serviceKey: "goal",
    slug: "goal",
    link: "/services/goal",
    label: "목표관리",
  },
  suhaeng: {
    serviceKey: "suhaeng",
    slug: "수행평가",
    link: "/services/performance",
    label: "수행평가",
  },
};

// 구매 내역 확인 경로. 로그인이 필요하므로(src/pages/MyPage.jsx:133 이 세션 없으면
// /login 으로 보낸다) 회원 주문에서만 CTA 로 쓴다.
const FALLBACK_PATH = "/mypage";
const COPY_FEEDBACK_MS = 2000;

// 새로고침으로 복구되지 않는 부여 실패.
//
// 부여 실패 사유는 두 종류인데 안내가 같으면 안 된다. DB 일시 오류는 재시도로
// 풀리지만, 아래 사유들은 몇 번 새로고침해도 같은 결과다 — 비회원 결제(주문에
// 권한을 줄 계정이 없다)·주문 없음·라인아이템 없음·서버 설정 누락·주문 소유자
// 불일치는 모두 요청을 반복해서 바뀌는 값이 아니다. 사유 문자열의 정본은
// api/_lib/programAccess.js 와 api/confirm-payment.js:accessNotAttempted 다.
const PERMANENT_ACCESS_ERRORS = new Set([
  "order_has_no_user",
  "order_not_found",
  "no_order_items",
  "missing_order_id",
  "supabase_admin_unavailable",
]);

// 'not_order_owner' 는 실패가 아니다.
//   api/confirm-payment.js 는 이미 결제완료된 주문에 대한 재부여를 주문 소유자
//   본인일 때만 시도한다(그 검사가 없으면 orderId 만 아는 요청으로 남의 권한을
//   되살릴 수 있다). 로그아웃 상태로 성공 URL 을 다시 열면 그 검사에 걸려
//   ok=false 로 오는데, 이건 "부여가 실패했다"가 아니라 "확인할 수 없어 시도하지
//   않았다"다. 경고색·문의 안내를 띄우면 아무 문제 없는 사용자를 겁주게 되므로
//   로그인 안내로 따로 분기한다.
const NOT_OWNER_ERROR = "not_order_owner";

interface RowItem {
  label: string;
  value: string;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ISO 문자열 → "YYYY.MM.DD" ('이용 시작일'처럼 날짜만 필요한 곳에서 쓴다.
// 입금기한은 시각까지 필요해서 날짜만 찍으면 안 된다 — depositDeadlineInfo 참고.)
function formatDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// 입금기한 표시 + 렌더 시점 기준 잔여 시간. 시안(1882-14746)은 formatDate 로
// 날짜만 찍었지만 실제 마감은 validHours 로 정해지는 특정 '시각'이다 — 날짜만
// 보여주면 마감일 23시 이체가 늦는 사고로 이어진다(적극적 오인 유발, P0).
// formatDateTime 으로 시각까지 보여주고 남은 시간을 병기한다. remaining 은
// 마감이 이미 지난 경우도 문구가 깨지지 않도록 별도 문구를 돌려준다.
function depositDeadlineInfo(iso?: string | null) {
  if (!iso) return { text: "-", remaining: null };
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return { text: "-", remaining: null };

  const text = formatDateTime(iso);
  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return { text, remaining: "기한 만료" };

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 60) return { text, remaining: `${diffMinutes}분 후 마감` };

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return { text, remaining: `${diffHours}시간 후 마감` };

  return { text, remaining: `${Math.round(diffHours / 24)}일 후 마감` };
}

// Clipboard API 는 secure context(HTTPS/localhost) 에서만 쓸 수 있다. 로컬
// http dev 서버·구형 webview 등에서는 document.execCommand('copy') 폴백으로
// 넘어간다. 둘 다 실패해도 예외를 던지지 않고 false 만 돌려준다 — 버튼이
// 사라지거나 화면이 깨지는 대신, 호출부가 복사 성공 피드백만 건너뛴다.
async function copyToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 폴백으로 이어간다.
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function formatKRW(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

// 완료 화면의 행 구성은 결제수단마다 다르다.
//   공통     : 주문번호 … 부가가치세 금액 · 총 결제 금액   (시안 E 클러스터 9프레임 공통)
//   간편결제 : + 결제수단, 승인 시간                        (1882-13833)
//   카드     : + 결제수단(카드사명 병기), 카드번호, 할부 개월, 카드사 승인 번호, 승인 시간 (1882-14270)
//   가상계좌 : + 가상계좌 번호, 입금자명, 입금기한 — 결제수단·승인 시간 행이 없다 (1882-14746)
//
// '이용 시작일' 행: 즉시 입장 모델이므로 이용 시작 = 결제 확정 시각이다. orders 에
// 시작일 컬럼을 새로 만들지 않고 승인 시각(= api/confirm-payment.js 가 orders.paid_at
// 에 찍는 값과 같은 순간)에서 파생해 표시한다. 가상계좌는 아직 입금 전이라 시작일이
// 없으므로 이 행을 넣지 않는다(입금기한 행이 그 상태를 표현한다).
//
// 보류 1건:
//   · 시간 행 라벨 — 시안이 노드별로 3종('최종 승인 시간' 1882-13833 / '결제 요청 시간 및
//     최종 승인 시간' 1882-14270 / '결제 요청 시간' 1882-14145)이라 코드 기존 문구를 유지.
function buildRows({
  payment,
  orderId,
  totalAmount,
  vat,
}: {
  payment: PaymentInfo | null;
  orderId: string | null;
  totalAmount: number;
  vat: number | null;
}): RowItem[] {
  const rows: RowItem[] = [
    { label: "주문번호", value: payment?.orderId || orderId || "-" },
  ];
  const card = payment?.card;
  const virtualAccount = payment?.virtualAccount;
  // 간편결제(토스페이 등)도 응답에 card 가 실려 올 수 있지만, 토스페이 시안
  // (1882-13833)은 카드 3행을 그리지 않는다. 그래서 카드 3행은 간편결제가 아닌
  // 순수 카드결제에서만 노출한다.
  const isCardPayment = Boolean(card) && !payment?.easyPay?.provider;

  if (virtualAccount) {
    // '가상계좌 번호' 행은 여기서 뺐다 — 카드 최상단의 복사 버튼 달린 전용 블록으로
    // 승격했다(PaymentSuccess 본문 렌더 참고). 같은 값을 두 단계로 다르게 보여주면
    // 어느 쪽이 정본인지 헷갈린다.
    rows.push({
      label: "입금자명",
      value: String(virtualAccount.customerName || "").trim() || "-",
    });
    const deadline = depositDeadlineInfo(virtualAccount.dueDate);
    rows.push({
      label: "입금기한",
      value: deadline.remaining
        ? `${deadline.text} (${deadline.remaining})`
        : deadline.text,
    });
  } else {
    rows.push({ label: "결제수단", value: methodLabel(payment) });
    // isCardPayment는 Boolean(card)를 포함하므로 card는 항상 non-null이다.
    if (isCardPayment && card) {
      rows.push({ label: "카드번호", value: formatCardNumber(card.number) });
      rows.push({
        label: "할부 개월",
        value: installmentLabel(card.installmentPlanMonths),
      });
      rows.push({
        label: "카드사 승인 번호",
        value: String(card.approveNo || "").trim() || "-",
      });
    }
    rows.push({
      label: "최종 승인 시간",
      value: formatDateTime(payment?.approvedAt || payment?.requestedAt),
    });
    rows.push({
      label: "이용 시작일",
      value: formatDate(payment?.approvedAt || payment?.requestedAt),
    });
  }

  rows.push({ label: "부가가치세 금액", value: formatKRW(vat) });
  rows.push({ label: "총 결제 금액", value: formatKRW(totalAmount) });
  return rows;
}

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const amount = params.get("amount");

  const { status, errorMsg, payment } = usePaymentConfirmation({
    paymentKey,
    orderId,
    amount,
  });
  // 가입 오픈 여부(app_settings.signup_enabled) — false/로딩 중(null)이면
  // 비회원 결제 복구용 회원가입 CTA를 숨긴다(Header.tsx와 동일 원칙).
  const signupEnabled = useSignupEnabled();
  // 계좌번호 복사 피드백. 2초 후 자동으로 꺼진다.
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const totalAmount = payment?.totalAmount ?? Number(amount);
  const vat =
    payment?.vat ?? (totalAmount ? Math.round(Number(totalAmount) / 11) : null);

  const rows = buildRows({ payment, orderId, totalAmount, vat });

  // 이용 권한 부여 결과. api/confirm-payment.js 가 승인 응답에 실어 준다
  // (형태: { ok, granted, serviceKeys, skipped, error }).
  const access = payment?.access ?? null;

  // 가상계좌 미입금 상태 판정. 승인 응답의 토스 status 가 정본이고, 멱등 재응답
  // 경로도 같은 값을 채운다(api/confirm-payment.js). 과거 주문(raw 없음)에서
  // status 가 비어 오는 경우를 대비해 virtualAccount 존재로도 한 번 더 본다.
  const isWaitingDeposit =
    payment?.status === "WAITING_FOR_DEPOSIT" ||
    (Boolean(payment?.virtualAccount) && payment?.status !== "DONE");
  const virtualAccount = payment?.virtualAccount ?? null;

  // 결제는 됐는데 권한 부여만 실패한 상태(부여 실패는 승인을 되돌리지 않는다).
  // 이때 '프로그램 시작하기'를 눌러도 입장 판정에서 막히므로 CTA 를 바꾸지 않고
  // 대신 복구 안내를 보여준다.
  // 로그인 안 된 재방문(재부여를 시도하지 않은 상태). 실패로 취급하지 않는다.
  const { memberType } = useMemberType();

  const needsLogin = !isWaitingDeposit && access?.error === NOT_OWNER_ERROR;
  const grantFailed = !isWaitingDeposit && !needsLogin && access?.ok === false;
  // 새로고침 안내를 붙일 수 있는 실패인지. 영구 실패에 '새로고침하면 자동 재시도'
  // 라고 쓰면 사실이 아닌 안내를 반복해서 읽히게 된다.
  const grantPermanent =
    grantFailed && PERMANENT_ACCESS_ERRORS.has(String(access?.error ?? ""));
  // 비회원 결제만 사용자가 스스로 풀 수 있는 길(회원가입)이 있다.
  const needsSignup = grantPermanent && access?.error === "order_has_no_user";

  // 입장 버튼은 "권한이 실제로 들어간 프로그램" 개수만큼 만든다. 수시예측·콜멘토
  // 처럼 부여 대상이 없는 상품은 access.ok=true + granted=[] 로 돌아오므로
  // (api/_lib/programAccess.js 의 skipped) 여기서 0개가 되어 CTA 가 내려간다.
  const entries = (access?.granted ?? [])
    .map((key) => SERVICE_ENTRY[key])
    .filter((entry): entry is ServiceEntry => Boolean(entry));
  // 결제자가 학부모면 프로그램 입장 버튼을 띄우지 않는다.
  //
  // 쌍 구조(sql/68)에서 이용 권한(program_access_grants)은 **자녀**에게 부여된다
  // — 결제한 사람과 쓰는 사람이 다르다. 그런데 이 화면은 결제 직후의 결제자가
  // 보는 화면이라, 그대로 두면 학부모에게 '프로그램 시작하기'가 뜨고 눌러도
  // 입장 판정(RequireGoalAccess 등)에서 막힌다 — 이 파일이 지키려던 원칙
  // ("눌러도 막히는 버튼은 만들지 않는다", 아래 CTA 주석)에 정면으로 어긋난다.
  //
  // memberType 로딩 중에는 버튼을 내리지 않는다(깜빡임 방지) — 로딩이 끝난 뒤
  // parent 로 판명되면 그때 대체 CTA 로 바뀐다.
  const isParentPayer = memberType === "parent";
  const canStart =
    !isWaitingDeposit && !grantFailed && entries.length > 0 && !isParentPayer;
  // 부여는 정상 종료됐는데 들어갈 프로그램이 없는 상품(수시예측·콜멘토 등).
  // '지금 바로 이용' + '프로그램 시작하기' 를 띄우면 사실과 다르다.
  const noEntryProduct =
    !isWaitingDeposit && access?.ok === true && entries.length === 0;

  async function handleStart(
    event: MouseEvent<HTMLButtonElement>,
    entry: ServiceEntry,
  ) {
    // 입장권(SSO 티켓)을 받아 자식 앱으로 이동한다. 실패 시 함수 내부에서
    // alert 를 띄우고 커서를 복구한다.
    await openPaidServiceOrAlert(event, entry);
  }

  async function handleCopyAccount() {
    const accountNumber = String(virtualAccount?.accountNumber || "").trim();
    if (!accountNumber) return;
    const ok = await copyToClipboard(accountNumber);
    if (!ok) return; // 실패해도 화면은 그대로 — 버튼을 숨기거나 에러를 띄우지 않는다.
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(
      () => setCopied(false),
      COPY_FEEDBACK_MS,
    );
  }

  // 가상계좌(토스 status = WAITING_FOR_DEPOSIT)는 계좌 발급까지만 끝난 상태다.
  // 이전에는 시안 가상계좌 프레임(1882-14746 / 1882-14898)을 그대로 따라 헤딩·
  // 아이콘을 분기하지 않았다('주문이 완료됐어요!' + 체크 아이콘) — 하지만 이는
  // 돈이 아직 움직이지 않았는데 완료를 선언하는 것이고, 사용자가 은행 앱으로
  // 계좌번호를 손으로 옮겨 적어야 하고, 입금기한이 날짜만 찍혀 마감 시각을
  // 놓치기 쉽고, 안내 박스가 '즉시 이용 성공'과 같은 파란 상자였다. 사실과 다른
  // 상태를 선언하는 비용이 시안 파리티보다 크다는 판단으로 2026-08-11 사용자
  // 승인을 받아 이 상태만 헤딩·아이콘·계좌 표시·안내 박스 색을 의도적으로
  // 분기한다(아래 렌더 각 지점 주석 참고).

  return (
    <main className="min-h-screen bg-white pt-16">
      {status === "confirming" && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
          {/* 시안에 없는 과도 상태. 색·타입은 시안 규약 안에서 고른다 —
                트랙 border-line(#d7d7d7), 진행 border-t-primary, 문구는 시안 CTA 단계와
                같은 16px w600 #525252. */}
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-primary" />
          <p className="mt-5 text-base font-semibold text-ink">
            결제 승인 처리 중…
          </p>
        </div>
      )}

      {status === "missing_params" && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          {/* 파라미터 없는 재방문은 실패가 아니다 — 가상계좌 구매자가 계좌번호를
                다시 보려고 히스토리로 돌아오는 것도 이 경로로 들어온다. 빨간 에러
                대신 중립색 안내로 분기하고 재결제 경로 없이 마이페이지로만 보낸다. */}
          <h1 className="text-2xl font-semibold leading-7.75 tracking-[-0.02em] text-ink">
            결제 완료 페이지는 다시 열 수 없습니다
          </h1>
          <p className="mt-3 max-w-105 text-sm font-medium leading-relaxed text-ink-sub">
            이 화면은 결제 직후에만 볼 수 있습니다. 계좌번호 등 주문 내용은
            마이페이지에서 확인해 주세요.
          </p>
          <button
            type="button"
            onClick={() => navigate(FALLBACK_PATH)}
            className="mt-8 rounded-xl bg-primary px-8 py-3.5 text-base font-semibold leading-5 text-white transition hover:bg-primary/90"
          >
            마이페이지에서 확인하기
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          {/* 시안에 없는 실패 상태. 완료 화면의 타입 단계(H1 / CTA 16px)를 그대로 재사용하고
                font-black(w900)은 시안 최대 무게(w700)를 넘으므로 제거했다.
                원시 오류 문자열(errorMsg)은 더 이상 H1 에 얹지 않는다 — Toss 승인은
                이미 성공했는데 우리 confirm 호출만 실패한 경우가 섞여 있고, 그 상태에서
                재결제를 유도하면 이중 결제(P0)로 이어진다. 헤딩은 고정 문구로 사실만
                전달하고, orderId/amount 는 문의 시 댈 수 있는 유일한 식별자라 항상
                보여준다. 원문은 디버깅 가치만 남기고 12px 보조행으로 강등한다.
                색은 error 가 아니라 ink 중립이다 — 본문이 "결제는 이미 정상 처리됐을
                수 있습니다"라고 말하는데 헤딩이 빨강이면 성공했을 수도 있는 결제를
                실패로 단정해 보인다. warning 토큰(#fde68a)으로 올리는 방안도 검토했지만
                그 토큰은 tailwind.config.js 주석에 "가상계좌 입금대기 안내 박스와
                이용 권한부여 지연 안내 박스 두 곳"으로 소비처가 이미 고정되어 있고,
                이 H1 은 안내 박스가 아니라 타이틀 단계라 같은 성격의 UI 요소도 아니다.
                원칙(소비처 확산 금지)을 깨면서까지 3번째 소비처를 만들 이유가 없어
                파라미터 없는 재방문 분기(위)가 이미 쓰는 ink 중립으로 맞춘다. */}
          <h1 className="text-2xl font-semibold leading-7.75 tracking-[-0.02em] text-ink">
            결제 확인이 지연되고 있습니다
          </h1>
          <p className="mt-3 max-w-105 text-sm font-medium leading-relaxed text-ink-sub">
            결제는 이미 정상 처리됐을 수 있습니다. 아래 연락처로 주문번호와 함께
            문의해 주세요.
          </p>
          <dl className="mt-6 flex flex-col items-center gap-1 text-sm font-medium text-ink">
            <div className="flex items-center gap-2">
              <dt className="text-ink-sub">주문번호</dt>
              <dd>{orderId || "-"}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-ink-sub">총 결제 금액</dt>
              <dd>{formatKRW(amount)}</dd>
            </div>
          </dl>
          {errorMsg && (
            <p className="mt-4 text-xs leading-4 text-ink-sub">{errorMsg}</p>
          )}
          {/* 재결제 경로(/pricing, /checkout)를 만들지 않는다 — 이미 승인된 결제를
                다시 결제하게 만드는 사고를 구조적으로 막는다. 1순위는 카카오톡 문의(권한
                부여 실패 분기와 동일 채널), 2순위는 마이페이지에서 본인 확인. */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {COMPANY.kakaoChannelUrl ? (
              <a
                href={COMPANY.kakaoChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-primary px-8 py-3.5 text-center text-base font-semibold leading-5 text-white transition hover:bg-primary/90"
              >
                카카오톡으로 문의하기
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(FALLBACK_PATH)}
              className="rounded-xl border border-line px-8 py-3.5 text-base font-semibold leading-5 text-ink transition hover:bg-surface-card"
            >
              마이페이지에서 확인하기
            </button>
          </div>
        </div>
      )}

      {status === "done" && (
        /* 시안 확정 실측: 완료 카드 폭 650px 고정(=40.625rem, 1920·1280 동일).
             카드의 max-w-162.5 은 시안 확정값이라 건드리지 않고, 바깥
             컨테이너를 전역 컨텐츠 영역 규약 `mx-auto w-full max-w-content px-5
             sm:px-8` 로 통일한다(Pricing.jsx:100-119 주석의 근거 참고. 세로
             패딩만 이 화면 고유값으로 남긴다).
             폭별 규약 inner = sm 이상 min(layout − 64, 1100) / sm 미만 layout − 40:
             390 → 350, 768 → 704, 1280·1920 → 1100. 카드는 inner 와 650 중
             작은 쪽이 되므로 layout 714(= 650 + 64) 이상에서 650 으로 고정되고,
             그 아래에서는 규약 inner 안쪽으로 줄어들어 가로 스크롤이 없다.
             sm 게이터를 px-6(24) 에서 규약값 px-8(32) 로 올렸다. 그 결과
             layout 640~713 밴드에서만 카드가 좁아진다 — 이전 카드 = min(layout −
             48, 650), 지금 = min(layout − 64, 650) 이므로 차이는 640~698 에서
             16px(640: 592 → 576 / 698: 650 → 634), 700 에서 14px(650 → 636),
             713 에서 1px(650 → 649), 714 부터 0 이다(실측 확인).
             의도된 변경이다 — 이 밴드는 시안이 없는 파생 구간이고(시안 캔버스는
             390/1280/1920), 이전 값은 카드가 규약 콘텐츠 밴드 밖으로 좌우 각
             8px(640) / 7px(700) 비어져 나간 상태였다. 규약 안에서 클램프되는
             편이 낫다는 판단이다. */
        <div className="mx-auto w-full max-w-content px-5 py-12 text-center sm:px-8 sm:py-16">
          {/* color prop 대신 className 으로 색을 준다 — lucide 아이콘은 stroke=currentColor
                이므로 text-primary 가 그대로 선 색이 된다(하드코딩 hex 제거).
                입금대기는 체크 아이콘을 쓰지 않는다 — 아직 완료가 아니라서다(위
                isWaitingDeposit 분기 사유 주석 참고). 시계 아이콘으로 '진행 중'을
                표현하되 색은 warning 토큰을 쓰지 않는다 — 그 토큰은 안내 박스 2곳
                전용으로 고정하기로 했다(tailwind.config.js 주석). 브랜드 네이비
                (primary)를 그대로 써 실패가 아니라 진행 중임을 중립적으로 전달한다. */}
          {isWaitingDeposit ? (
            <Clock size={64} strokeWidth={2} className="mx-auto text-primary" />
          ) : (
            <CheckCircle2
              size={64}
              strokeWidth={2}
              className="mx-auto text-primary"
            />
          )}
          {/* H1 시안 실측: 390(1882:14145) 24px w600 lh31 #525252 ls-0.48 /
                1920(1882:13833) 50px w600 lh70 #525252 ls-1. 두 폭 모두 ls = 크기 × -0.02
                이라 tracking 단일값. lh 는 31/16 = 1.9375rem, 70/16 = 4.375rem.
                이전 값(36px w900 #0D1B2A)은 시안보다 작고 무거웠다 — 시안 위계는
                '크고 가볍게'다.
                입금대기는 문구도 분기한다 — '주문이 완료됐어요!'는 돈이 아직
                움직이지 않은 상태에서 완료를 선언하는 것이라 의도적으로 시안을
                벗어난다(위 isWaitingDeposit 분기 사유 주석 참고). 타입 단계는
                그대로 재사용한다. */}
          <h1 className="mt-8 text-2xl font-semibold leading-7.75 tracking-[-0.02em] text-ink sm:text-[3.125rem] sm:leading-17.5">
            {isWaitingDeposit
              ? "입금이 확인되면 이용이 시작돼요"
              : "주문이 완료됐어요!"}
          </h1>

          {isWaitingDeposit && (
            <div className="mx-auto mt-10 w-full max-w-162.5 rounded-2xl border border-line px-5 py-5 text-left sm:px-8 sm:py-6">
              {/* 계좌 정보 승격 블록 — 이전에는 아래 명세 카드의 '가상계좌 번호'
                    한 줄(14px, 다른 39개 명세 행과 동일 위계)이었고 복사 버튼이
                    없어 사용자가 은행 앱으로 손으로 옮겨 적어야 했다. 지금 당장
                    사용자가 취해야 할 행동이라 명세보다 한 단 큰 타이포로 카드
                    최상단에 올리고 복사 버튼을 붙인다. */}
              <p className="text-[0.875rem] font-semibold leading-5 text-ink-sub">
                입금할 계좌
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-lg font-semibold leading-6 text-ink sm:text-xl sm:leading-7">
                  {accountLabel(virtualAccount)}
                </p>
                {/* 복사 완료 라벨 문구 — '복사됨'(코퍼스 0건, '~됨' 꼴)을 '복사되었습니다'로
                      정정했다. 폭이 2배 이상 늘어 이 승격 블록(계좌번호 + 복사 버튼이 든
                      flex-wrap 행)의 레이아웃이 깨지는지 layout 390 에서 실측했다 — 계좌번호
                      행 자체가 이미 flex-wrap 으로 버튼이 둘째 줄로 내려가 있는 상태(계좌번호
                      문자열이 길어 한 줄을 다 쓰기 때문)라, '계좌번호 복사하기'(클릭 전) ↔
                      '복사되었습니다'(클릭 후) 전환 전후로 승격 블록 높이(164px)·계좌 행
                      높이(66px)가 그대로였고 가로 스크롤도 없었다(scrollWidth === clientWidth
                      === 390). 즉 버튼 폭만 배지 안에서 바뀔 뿐 형제 요소를 밀어내지 않아
                      깨지지 않는다 — 합니다체 '복사되었습니다'를 그대로 쓴다.
                      실측(390) 시각 박스 109×30px — 세로 30px 은 44px 최소 터치 타깃 기준
                      미달이다. 이 버튼은 사용자가 계좌번호를 은행 앱으로 옮기는 유일한
                      수단이라 실패하면 미입금으로 주문이 소멸하는 P0 지점이다.
                      시각 박스를 44px 로 키우는 대신(주변 12px 텍스트·아이콘과 비례가
                      깨진다) `after:` 오버레이로 히트영역만 확장한다 — 이 프로젝트에
                      선례가 있다(Pricing.jsx '자세히보기': after:h-11 after:w-full
                      after:-translate-y-1/2). h-11(2.75rem=44px) 오버레이로 세로
                      히트영역이 44px 이상임을 실측 확인했다(아래 검증 참고). */}
                <button
                  type="button"
                  onClick={handleCopyAccount}
                  className="relative flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-card after:absolute after:left-0 after:top-1/2 after:h-11 after:w-full after:-translate-y-1/2 after:content-['']"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "복사되었습니다" : "계좌번호 복사하기"}
                </button>
                {/* 시각 피드백(버튼 라벨)과 별개로 스크린리더용 알림을 role=status
                      로 낸다 — 버튼 텍스트 변경만으로는 보조기술이 안정적으로
                      읽어주지 않는다. */}
                <span role="status" className="sr-only">
                  {copied ? "계좌번호를 복사했습니다" : ""}
                </span>
              </div>
              <p className="mt-1 text-base font-semibold leading-6 text-ink">
                입금액 {formatKRW(totalAmount)}
              </p>
            </div>
          )}

          {/* 명세 카드 테두리는 시안 픽셀 실측 #d7d7d7 = line 토큰이다(이전 slate-200
                = #e2e8f0 은 토큰 밖 색). 시안 카드에는 그림자가 없어 하드코딩 rgba
                그림자도 함께 걷어냈다 — 폭 max-w-[40.625rem]과 radius 는 확정값이라 유지.
                입금대기는 위에 계좌 승격 블록이 먼저 오므로 간격을 mt-6(카드-카드
                간격, 안내 박스와 동일)으로 좁힌다 — mt-10/12 는 H1 바로 아래 첫
                블록일 때만 쓰는 간격이다. */}
          <div
            className={`mx-auto w-full max-w-162.5 rounded-2xl border border-line px-5 py-5 text-left sm:px-8 sm:py-6 ${
              isWaitingDeposit ? "mt-6" : "mt-10 sm:mt-12"
            }`}
          >
            <dl>
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 py-3 sm:gap-6 sm:py-4"
                >
                  {/* 명세 행 시안 실측: 라벨·값이 완전히 같은 한 단계다 —
                        14px w500 lh20 #525252 (1882:13833 에서 이 스타일이 39회 반복,
                        390 도 동일 크기). 이전 코드는 값만 15px w700 #111111 로 키워
                        시안에 없는 단계를 만들고 있었다. 그래서 dd 를 dt 와 같은 값으로
                        내려 시안의 단계 수(H1 / 명세 14px / CTA 16px = 3단계)에 맞춘다.
                        ls: 1920 시안은 이 크기에 자간을 주지 않으므로(390 만 -0.14)
                        tracking 을 붙이지 않는다. */}
                  <dt className="shrink-0 text-[0.875rem] font-medium leading-5 text-ink">
                    {row.label}
                  </dt>
                  <dd className="break-all text-right text-[0.875rem] font-medium leading-5 text-ink">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* 이용 안내 — 운영 모델은 '즉시 입장'(사용자 확정)이다. 결제 승인
                시점에 api/confirm-payment.js 가 권한을 자동 부여하므로 "담당
                매니저가 영업일 1~2일 내 안내"(수동 프로비저닝) 문구는 삭제했다.
                상태별로 사실이 다르므로 6분기로 쓴다(입금대기 / 로그인 필요 /
                영구 실패 / 재시도 가능 실패 / 입장 대상 없는 상품 / 즉시 입장).

                '마이페이지에서 바로/이어서 이용' 약속은 전부 뺐다 — 마이페이지
                '이용 중인 서비스' 목록에 입장 수단이 없어서(src/pages/MyPage.jsx:
                470-497, openPaidServiceOrAlert 호출 0건) 지킬 수 없는 약속이다.
                마이페이지에 입장 버튼이 들어가면 그때 되살릴 문구다. */}
          {/* 이 안내 박스는 시안에 없는 블록이다(시안 완료 화면은 H1·명세·CTA 3요소뿐).
                그래서 새 타입 단계를 만들지 않고 시안의 명세 단계(14px #525252)에 얹어
                무게·색으로만 위계를 만든다 — 라벨 w600 / 본문 w500 / 문의 w500 ink.sub.
                기본 배경은 시안 토큰 surface.info(#e9f4ff, '안내 박스' 용도)로 바꿨다
                (이전 blue-50/blue-100 은 토큰 밖 색). 입금대기·부여 지연 두 분기는
                warning/surface.warning 토큰(tailwind.config.js)을 쓴다 — error(빨강)로
                올리면 '결제는 성공했는데 아직 안 끝난 상태'를 결제 실패로 오인시킨다.
                이전에는 이 두 상태를 하드코딩 amber-200/50 으로 구분 없이 표시했는데,
                이번에 warning 토큰으로 정식 승격하면서 입금대기도 같은 색으로
                묶는다 — '즉시 이용 성공'(surface-info)과는 색으로 분리되는 게
                핵심이다. */}
          <div
            className={`mx-auto mt-6 w-full max-w-162.5 rounded-2xl border px-5 py-5 text-left sm:px-8 ${
              isWaitingDeposit || grantFailed
                ? "border-warning bg-surface-warning"
                : "border-line bg-surface-info"
            }`}
          >
            <p className="text-[0.875rem] font-semibold leading-5 text-ink">
              {(() => {
                if (isWaitingDeposit) return "입금 안내";
                if (needsLogin) return "로그인 후 이용";
                if (grantPermanent) return "이용 등록 확인이 필요합니다";
                if (grantFailed) return "이용 권한 등록 지연";
                return "이용 안내";
              })()}
            </p>
            {/* 문구는 각 상태에서 "검증 가능한 사실"만 남긴 초안이다 — 최종 문안은
                  사용자 승인 대기(입장 앱 없는 상품 안내 / 비회원 결제 안내 2건). */}
            {/* 크기·무게·색은 시안 명세 단계(14px w500 #525252)와 같게 두고, lh 만
                  leading-relaxed 를 유지한다 — 시안의 lh20(1.43)은 한 줄짜리 명세 행 기준
                  값이라 3~4줄 문단에 그대로 쓰면 답답해진다. */}
            <p className="mt-2 break-keep text-[0.875rem] font-medium leading-relaxed text-ink">
              {buildAccessInfoBody({
                isWaitingDeposit,
                needsLogin,
                needsSignup,
                grantPermanent,
                grantFailed,
                noEntryProduct,
                hasMultipleEntries: entries.length > 1,
                hasContactChannel: Boolean(COMPANY.kakaoChannelUrl),
              })}
            </p>
            {/* 12.5px 은 시안에 없는 단계였다 — 14px 로 올리고 보조 정보라는 사실은
                  ink.sub(#808080)로 표현한다(무게는 본문과 같은 w500). */}
            {COMPANY.kakao ? (
              <p className="mt-3 text-[0.875rem] font-medium leading-5 text-ink-sub">
                문의: 카카오톡 {COMPANY.kakao}
              </p>
            ) : null}
          </div>

          {/* CTA 는 390에서 카드 폭(=풀폭), sm 이상에서 내용 폭.
                즉시 입장이므로 기본 CTA 는 '프로그램 시작하기'다. 눌러도 막히는
                버튼은 만들지 않는다 — 그래서 목적지가 실제로 성립하는 경우만 버튼을
                띄운다.
                  · 권한이 들어간 프로그램이 여러 개면 버튼도 그 개수만큼 만든다.
                    하나로 묶어 마이페이지로 보내면 거기에 입장 수단이 없어서
                    (MyPage.jsx:470-497) 두 프로그램 어디에도 못 들어간다.
                  · 로그아웃 재방문은 로그인이 곧 해결이므로 /login 으로 보낸다.
                  · 비회원 결제는 회원가입이 유일한 자력 복구 경로다.
                  · 그 외 영구 실패는 로그인 벽인 /mypage 로 보내지 않고(비회원은
                    MyPage.jsx:133 에서 /login 으로 튕긴다) 카카오톡 문의만 남긴다
                    (사용자 확정 — 전화 등 다른 연락 수단은 노출하지 않는다). */}
          <div className="mx-auto mt-8 w-full max-w-162.5 sm:mt-10">
            {(() => {
              if (canStart)
                return (
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                    {entries.map((item) => (
                      <button
                        key={item.serviceKey}
                        type="button"
                        onClick={(event) => handleStart(event, item)}
                        className="w-full rounded-xl bg-primary py-4 text-base font-semibold leading-5 text-white transition hover:bg-primary/90 sm:w-auto sm:px-16 sm:leading-5.5"
                      >
                        {entries.length > 1
                          ? `${item.label} 시작하기`
                          : "프로그램 시작하기"}
                      </button>
                    ))}
                  </div>
                );
              if (needsLogin)
                return (
                  <Link
                    to="/login"
                    className="block w-full rounded-xl bg-primary py-4 text-center text-base font-semibold leading-5 text-white transition hover:bg-primary/90 sm:mx-auto sm:w-auto sm:px-16 sm:leading-5.5"
                  >
                    로그인하고 이용하기
                  </Link>
                );
              if (needsSignup && signupEnabled)
                return (
                  <Link
                    to="/signup"
                    className="block w-full rounded-xl bg-primary py-4 text-center text-base font-semibold leading-5 text-white transition hover:bg-primary/90 sm:mx-auto sm:w-auto sm:px-16 sm:leading-5.5"
                  >
                    회원가입하고 이용 등록하기
                  </Link>
                );
              if (grantPermanent && COMPANY.kakaoChannelUrl)
                return (
                  <a
                    href={COMPANY.kakaoChannelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full rounded-xl bg-primary py-4 text-center text-base font-semibold leading-5 text-white transition hover:bg-primary/90 sm:mx-auto sm:w-auto sm:px-16 sm:leading-5.5"
                  >
                    카카오톡으로 문의하기
                  </a>
                );
              return (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      isParentPayer
                        ? `${FALLBACK_PATH}?tab=payments`
                        : FALLBACK_PATH,
                    )
                  }
                  className="w-full rounded-xl bg-primary py-4 text-base font-semibold leading-5 text-white transition hover:bg-primary/90 sm:w-auto sm:px-16 sm:leading-5.5"
                >
                  {isParentPayer
                    ? "결제 내역 보러가기"
                    : "마이페이지에서 확인하기"}
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
