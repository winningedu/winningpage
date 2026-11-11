import { BANK_OPTIONS } from "@/lib/paymentReceiptFormat";

// 가상계좌(현금성) 결제 건의 환불계좌 입력 3필드 — RefundRequestModal(학부모
// 직접 신청)과 RefundApprovalModal(학부모가 학생 신청을 승인할 때)이 공유한다.
// 두 화면이 각자 만들면 은행 select 옵션·문구가 어긋날 수 있어 한 곳에 둔다
// (paymentRows.ts의 "두 화면이 같은 규칙을 써야 한다" 원칙과 같은 이유).
//
// 카드 결제 건에는 이 필드가 아예 렌더되지 않는다(호출부가 가상계좌 여부를
// 먼저 판정) — 토스 결제취소 API가 카드 취소에는 refundReceiveAccount를
// 받지 않고, 가상계좌 취소에만 요구하기 때문이다(api/_routes/complete-refund.ts).
//
// 계좌번호는 토스 공식 제약(숫자만, 최대 20자)에 맞춰 입력 즉시 정규화한다
// — 하이픈을 넣어 타이핑해도 상태값은 항상 숫자만 남는다. api/complete-
// refund.ts도 방어적으로 같은 필터를 한 번 더 건다(이중 안전망, RPC를
// 직접 호출하는 경로나 레거시 데이터까지 막기 위해).
const ACCOUNT_NUMBER_MAX_LENGTH = 20;

function normalizeAccountNumber(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, ACCOUNT_NUMBER_MAX_LENGTH);
}

type RefundAccountFieldsProps = {
  bank: string;
  account: string;
  holder: string;
  onBankChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onHolderChange: (value: string) => void;
};

export default function RefundAccountFields({
  bank,
  account,
  holder,
  onBankChange,
  onAccountChange,
  onHolderChange,
}: RefundAccountFieldsProps) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-[0.8125rem] font-semibold text-ink">
        환불받을 계좌 (가상계좌 결제는 필수예요)
      </p>
      <select
        value={bank}
        onChange={(e) => onBankChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-line px-4 text-[0.875rem] text-ink outline-hidden focus:border-accent"
      >
        <option value="">은행 선택</option>
        {BANK_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        inputMode="numeric"
        value={account}
        onChange={(e) =>
          onAccountChange(normalizeAccountNumber(e.target.value))
        }
        placeholder="계좌번호(하이픈 없이 자동 반영돼요)"
        className="h-12 w-full rounded-xl border border-line px-4 text-[0.875rem] text-ink outline-hidden focus:border-accent"
      />
      <input
        type="text"
        value={holder}
        onChange={(e) => onHolderChange(e.target.value)}
        placeholder="예금주명"
        className="h-12 w-full rounded-xl border border-line px-4 text-[0.875rem] text-ink outline-hidden focus:border-accent"
      />
    </div>
  );
}
