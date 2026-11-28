// 토스 결제 응답(raw)을 사람이 읽는 영수증 문구로 바꾸는 공유 포맷터.
//
// src/pages/PaymentSuccess.tsx(결제 직후 화면)와
// src/components/mypage/ReceiptModal.tsx(마이페이지 영수증, 결제 이후 언제든 재조회)가
// 같은 토스 응답 모양(card/virtualAccount/easyPay/method)을 서로 다르게 읽으면
// 같은 주문이 화면마다 다른 카드사·할부·계좌로 보인다 — 그래서 매핑 표와 포맷
// 함수를 여기 한 곳에 둔다.
import type {
  CardInfo,
  EasyPayInfo,
  VirtualAccountInfo,
} from "@/hooks/usePaymentConfirmation";

// 토스 카드사 코드 → 표시명. 시안(1882-14270)이 결제수단을 '신용카드(신한)' 처럼
// 카드사명까지 붙여 적는데, 토스 승인 응답에는 card.issuerCode(2자리 코드)만 오고
// 한글 카드사명이 없어서 매핑 표가 필요하다. 미등록 코드는 카드사명을 생략하고
// '신용카드' 로만 표기한다(잘못된 카드사명을 영수증에 찍는 것보다 안전).
const CARD_ISSUERS: Record<string, string> = {
  "3K": "기업BC",
  46: "광주",
  71: "롯데",
  30: "KDB산업",
  31: "BC",
  51: "삼성",
  38: "새마을",
  41: "신한",
  62: "신협",
  36: "씨티",
  33: "우리BC",
  W1: "우리",
  37: "우체국",
  39: "저축",
  35: "전북",
  42: "제주",
  15: "카카오뱅크",
  "3A": "케이뱅크",
  24: "토스뱅크",
  21: "하나",
  61: "현대",
  11: "KB국민",
  91: "NH농협",
  34: "수협",
};

// 토스 은행 코드 → 표시명. 가상계좌 응답이 bank(한글명)를 주는 경우도 있어
// 그쪽을 먼저 쓰고, 없을 때만 이 표로 코드를 푼다.
const BANKS: Record<string, string> = {
  "02": "KDB산업은행",
  "03": "IBK기업은행",
  "04": "KB국민은행",
  "06": "KB국민은행",
  "07": "수협은행",
  11: "NH농협은행",
  12: "단위농협",
  20: "우리은행",
  23: "SC제일은행",
  27: "씨티은행",
  31: "DGB대구은행",
  32: "부산은행",
  34: "광주은행",
  35: "제주은행",
  37: "전북은행",
  39: "경남은행",
  45: "새마을금고",
  48: "신협",
  50: "저축은행",
  54: "HSBC은행",
  64: "산림조합",
  71: "우체국",
  81: "하나은행",
  88: "신한은행",
  89: "케이뱅크",
  90: "카카오뱅크",
  92: "토스뱅크",
};

// BANKS(코드→이름)를 {value, label} 옵션 배열로 뒤집는다 — 환불계좌 입력
// select(RefundAccountFields)와 어드민 목록(revenue.ts refundRequests 컬럼)이
// 같은 코드 목록을 공유한다. DB(refund_requests.refund_bank)에는 코드를
// 저장한다 — 토스 결제취소 API의 refundReceiveAccount.bank가 요구하는 값이
// 코드이고(virtualAccount.bankCode와 같은 코드 체계), 한글 라벨을 저장하면
// 서버가 다시 코드로 매핑해야 해서 값이 어긋날 여지가 생긴다.
export const BANK_OPTIONS: { value: string; label: string }[] = Object.entries(
  BANKS,
).map(([code, name]) => ({ value: code, label: name }));

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ISO 문자열 → "YYYY.MM.DD HH:mm". PaymentSuccess.tsx 와 동일 포맷 — 승인 시각
// 표기가 결제 직후 화면과 마이페이지 영수증에서 달라지면 안 된다.
export function formatDateTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const date = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; // tz-literal-ok: 브라우저 화면 표시라 로컬 시간대가 맞다
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`; // tz-literal-ok: 브라우저 화면 표시라 로컬 시간대가 맞다
  return `${date} ${time}`;
}

type MethodInfo = {
  card?: CardInfo | null | undefined;
  easyPay?: EasyPayInfo | null | undefined;
  method?: string | null | undefined;
};

// 토스 결제수단 표시명 (간편결제는 provider, 카드는 '신용카드(신한)' 형태)
export function methodLabel(payment?: MethodInfo | null) {
  if (payment?.easyPay?.provider) return payment.easyPay.provider;

  if (payment?.card) {
    // cardType 은 '신용' | '체크' | '기프트' 로 온다.
    const cardType = String(payment.card.cardType || "").trim();
    const base = cardType ? `${cardType}카드` : payment.method || "신용카드";
    const issuer = CARD_ISSUERS[String(payment.card.issuerCode || "").trim()];
    return issuer ? `${base}(${issuer})` : base;
  }

  return payment?.method || "-";
}

// 시안(1882-14270)은 '4895-4589-****-****' 로 앞 8자리만 노출한다. 토스도 이미
// 일부를 가려서 주지만(예: 43301234****123*) 가리는 자리가 달라, 뒤 8자리를
// 다시 '*' 로 덮은 뒤 4자리씩 하이픈으로 끊는다.
const CARD_NUMBER_VISIBLE_DIGITS = 8;
const CARD_NUMBER_MIN_DIGITS = 12;

export function formatCardNumber(raw?: string | null) {
  const value = String(raw || "").replace(/[^0-9*]/g, "");
  if (!value) return "-";
  const length = Math.max(value.length, CARD_NUMBER_MIN_DIGITS);
  const masked =
    value
      .slice(0, CARD_NUMBER_VISIBLE_DIGITS)
      .padEnd(CARD_NUMBER_VISIBLE_DIGITS, "*") +
    "*".repeat(length - CARD_NUMBER_VISIBLE_DIGITS);
  // masked는 항상 길이 12+ 비-개행 문자열이라 /.{1,4}/g 매치가 항상 성립한다.
  return masked.match(/.{1,4}/g)!.join("-");
}

// 0개월 = 일시불 (시안 1882-14270)
export function installmentLabel(months?: number | null) {
  const value = Number(months || 0);
  return value > 0 ? `${value}개월` : "일시불";
}

// 시안(1882-14746)은 '신한은행 110-260-365412' 로 은행명 + 계좌번호를 한 줄에 쓴다.
export function accountLabel(virtualAccount?: VirtualAccountInfo | null) {
  const bank =
    String(virtualAccount?.bank || "").trim() ||
    BANKS[String(virtualAccount?.bankCode || "").trim()];
  const accountNumber = String(virtualAccount?.accountNumber || "").trim();
  if (!accountNumber) return "-";
  return bank ? `${bank} ${accountNumber}` : accountNumber;
}
