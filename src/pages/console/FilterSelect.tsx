// 회색 상자에 값을 보이는 선택 칸(스펙 0.4). inline 은 라벨이 상자 안에, stacked 는 상자 위에 있다.

import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

interface FilterSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: "inline" | "stacked";
}

export default function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  variant = "inline",
}: FilterSelectProps) {
  const id = useId();
  const inline = variant === "inline";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {!inline && (
        <label htmlFor={id} className="text-app-label font-medium text-ink-sub">
          {label}
        </label>
      )}
      <div
        className={cn(
          "relative flex h-11 items-center gap-2 rounded-lg bg-surface-muted px-3 md:h-10",
          disabled && "opacity-40",
        )}
      >
        {inline && (
          <label htmlFor={id} className="shrink-0 text-app-label text-ink-sub">
            {label}
          </label>
        )}
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 appearance-none bg-transparent pr-5 text-app-label font-semibold text-ink-strong outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 size-4 text-ink-sub"
        />
      </div>
    </div>
  );
}
