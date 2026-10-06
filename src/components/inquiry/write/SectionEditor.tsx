import type { SectionId } from "@/lib/inquiry/types";
import type { SectionRow } from "./writeLogic";

// 보고서 작성 절 하나(No.71, 72). 번호와 제목, 안내 한 줄, 입력란, 글자 수 카운터를 그린다.
type Props = {
  row: SectionRow;
  value: string;
  onChange: (id: SectionId, value: string) => void;
  /** 제출 검사에서 막힌 절. */
  invalid?: boolean;
};

export default function SectionEditor({
  row,
  value,
  onChange,
  invalid = false,
}: Props) {
  const inputId = `inquiry-section-${row.id}`;
  const hintId = `${inputId}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={inputId}
          className="text-app-body font-bold text-ink-strong"
        >
          {`${row.numeral}. ${row.title}`}
        </label>
        <span className="text-app-caption text-ink-sub">
          <span>{row.counter}</span>
          {row.short && row.count > 0 && row.shortage !== null && (
            <span className="ml-2 font-semibold text-amber-700">
              {`${row.shortage}자 부족`}
            </span>
          )}
        </span>
      </div>
      <p id={hintId} className="text-app-caption text-ink-sub">
        {row.hint}
      </p>
      <textarea
        id={inputId}
        aria-describedby={hintId}
        aria-invalid={invalid ? true : undefined}
        value={value}
        placeholder="입력"
        rows={5}
        onChange={(e) => onChange(row.id, e.target.value)}
        className="min-h-32 w-full resize-y rounded-lg border border-line bg-white px-4 py-3 text-app-body text-ink-strong outline-none focus-visible:border-ink-strong aria-invalid:border-red-500"
      />
    </div>
  );
}
