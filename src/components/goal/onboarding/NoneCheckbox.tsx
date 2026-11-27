import { Check } from "lucide-react";
import type { ChangeEventHandler } from "react";

// "없음" 체크박스 — docs/figma-goal/00-INDEX.md §5-3 `NoneCheckbox`. 체크 시 연결된
// 인풋을 disable 처리한다(내신/모의고사 스텝, part-01~03 "추정" 표기 그대로 구현).
type NoneCheckboxProps = {
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  label?: string;
};

function NoneCheckbox({
  checked,
  onChange,
  label = "없음",
}: NoneCheckboxProps) {
  return (
    <label className="mt-3 inline-flex cursor-pointer select-none items-center gap-2 text-app-label text-ink-sub">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          checked
            ? "border-accent bg-accent text-white"
            : "border-line bg-white text-transparent"
        }`}
      >
        <Check size={13} strokeWidth={3} />
      </span>
      {label}
    </label>
  );
}
