// W10 상담 상태 고르기(교 #51, 결정 2). 4가지 중 하나가 눌려 있고 다른 것을 누르면 그 값으로 바뀐다.

import { cn } from "@/lib/utils";

export type CounselStatus = "unset" | "scheduled" | "done" | "needed";

const OPTIONS: { value: CounselStatus; label: string }[] = [
  { value: "unset", label: "미지정" },
  { value: "scheduled", label: "상담예정" },
  { value: "done", label: "상담완료" },
  { value: "needed", label: "상담필요" },
];

interface StatusToggleProps {
  value: CounselStatus;
  onChange: (value: CounselStatus) => void;
  disabled?: boolean;
  label: string;
}

export default function StatusToggle({
  value,
  onChange,
  disabled,
  label,
}: StatusToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-lg bg-surface-muted p-0.5"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: 붙어 있는 막대 모양 버튼이라 input 대신 role=radio 를 쓴다.
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            className={cn(
              "rounded-md px-2 py-1.5 text-app-caption font-medium disabled:opacity-60",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-ink-strong",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
