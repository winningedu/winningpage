import type { ReactNode } from "react";

// 기본 입력 화면 공통 입력 조각. 성장설계 ProfileForm 의 규격(h-9, text-app-label)을 따른다.
export const SELECT =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
export const TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
export const INPUT = "h-9 text-app-label md:text-app-label";
export const CARD_BOX = "rounded-xl border border-line/60 bg-white px-6 py-5";
export const CARD_HEADING = "text-app-card-title font-bold text-ink-strong";

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-app-label font-medium text-ink-sub">
        {label}
      </label>
      {children}
      {error && <p className="text-app-caption text-destructive">{error}</p>}
      {hint && !error && (
        <p className="text-app-caption text-ink-sub">{hint}</p>
      )}
    </div>
  );
}

/** 한 번에 하나만 고르는 알약 버튼 묶음. 누른 값은 aria-pressed 로 알린다. */
export function PillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-full border px-4 text-app-label font-medium transition-colors ${
              active
                ? "border-primary bg-primary text-white"
                : "border-line bg-white text-ink hover:bg-surface-04"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
