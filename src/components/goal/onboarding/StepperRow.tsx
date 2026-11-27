// 하루 일정 스테퍼 행 — docs/figma-goal/00-INDEX.md §5-3 `StepperRow`.
// `label / - / value / +` 구성. 단위가 "시"(기상・취침, 시각)와 "시간"(학교체류・학원과외,
// 지속시간) 2종으로 섞여 있다(part-04 구현 노트) — unit prop으로 그대로 표기한다.
// "-"/"+"는 시안엔 12×20 텍스트 노드뿐이라 최소 24×24 버튼으로 감싼다(접근성).
type StepperRowProps = {
  label: string;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

function StepperRow({
  label,
  value,
  unit,
  onChange,
  min = 0,
  max = 24,
  step = 1,
}: StepperRowProps) {
  function decrease() {
    onChange(Math.max(min, value - step));
  }

  function increase() {
    onChange(Math.min(max, value + step));
  }

  return (
    <div className="flex items-center gap-5">
      <span className="w-25 shrink-0 text-app-label text-ink">{label}</span>
      <button
        type="button"
        onClick={decrease}
        aria-label={`${label} 줄이기`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-accent hover:text-accent"
      >
        −
      </button>
      <span className="w-12 shrink-0 text-center text-app-card-title font-medium text-ink">
        {value}
        {unit}
      </span>
      <button
        type="button"
        onClick={increase}
        aria-label={`${label} 늘리기`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition-colors hover:border-accent hover:text-accent"
      >
        +
      </button>
    </div>
  );
}

export {};
