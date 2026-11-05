// 콘솔 입력 칸(스펙 1.3 Input, Field). 라벨, 입력, 오류 문구를 한 묶음으로 그린다.

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TextFieldProps
  extends Omit<React.ComponentProps<"input">, "id" | "className"> {
  label: string;
  error?: string | null | undefined;
  /** 입력 칸 모양을 상태별로 덮어쓴다(읽기 전용, 잠금 등). */
  inputClassName?: string | undefined;
}

export default function TextField({
  label,
  error,
  inputClassName,
  ...inputProps
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <label htmlFor={id} className="text-app-label font-medium text-ink-sub">
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "h-auto min-h-11 rounded-lg border-line bg-background px-4 py-0 text-app-label text-ink-strong placeholder:text-ink-sub md:min-h-10 md:text-app-label",
          "aria-invalid:border-error aria-invalid:ring-0",
          inputClassName,
        )}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-app-label font-medium text-ink-danger">
          {error}
        </p>
      )}
    </div>
  );
}
