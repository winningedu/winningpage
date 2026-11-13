// 대행 사유 고르기. 학교 고르기(W5a)와 콘솔의 학교 바꾸기 창이 같은 목록과 모양을 쓴다.

export const REASONS = [
  { value: "admin_absent", label: "관리자 부재" },
  { value: "roster_proxy", label: "명단 대행" },
  { value: "incident_support", label: "장애 지원" },
] as const;

export type Reason = (typeof REASONS)[number]["value"];

export default function ProxyReasonField({
  reason,
  onChange,
}: {
  reason: Reason | null;
  onChange: (reason: Reason) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-app-label font-medium text-ink-sub">
        대행 사유
      </legend>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {REASONS.map((r) => (
          <label
            key={r.value}
            className="flex items-center gap-2 text-app-body text-ink-strong"
          >
            <input
              type="radio"
              name="reason"
              checked={reason === r.value}
              onChange={() => onChange(r.value)}
              className="size-4 accent-primary"
            />
            {r.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
