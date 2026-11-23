import radioChecked from "@/assets/renewal/radio-checked.svg";
import radioUnchecked from "@/assets/renewal/radio-unchecked.svg";

/**
 * OptionGroup
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:13222 ("설문조사 선택한 상태")
 *
 * variant='chip' → 내용 기준 hug 폭 칩을 flex-wrap 나열 (Q1·Q2·Q8하위·Q13·Q14·Q16·Q17·Q18)
 *                  단 <640 에서는 전폭 리스트로 폴백한다 (칩 2개가 한 줄에 못 들어가는 폭).
 * variant='row'  → 전폭(w-full) 리스트 행 (Q3·Q4·Q5·Q8·Q10·Q12·Q3-C)
 *
 * 행/칩 공통 규격 (시안 실측):
 *   min-h 68 (4.25rem) / bg #FFFFFF / border 1px #D9D9D9 / radius 20 (1.25rem)
 *   padding 14·20 (0.875rem·1.25rem) / 아이콘 24 ↔ 라벨 gap 24 (1.5rem) / 행간 gap 12 (0.75rem)
 *   높이는 min-h — 375px 뷰포트에서 최장 라벨이 3줄이 되어도 넘치지 않는다.
 *   라벨 line-height 는 시안 원값(20px, 비율 1.0)을 승계하지 않고 1.4 를 쓴다 (SPEC 3.1-6 예외).
 *
 * 상태 (SPEC-fd-ver3-v2 §9-A1):
 *   selected      bg #E9F4FF / border #013262 / 라벨 #013262
 *                 (2026-07-30 에는 #F1F8FF 로 중재했으나, 2026-08-05 Figma REST 실측(1889:13222
 *                 선택 상태 시안, 선택지 프레임 fill)에서 #E9F4FF 확인되어 시안값으로 환원.
 *                 미선택 테두리도 같은 실측 근거로 #D9D9D9.)
 *   hover(미선택)  border #013262 20% + bg #FBFAFA, transition 150ms
 *   hover(선택됨)  변화 없음
 *   focus         :focus-visible 만 — outline 2px #0B84FD, offset 2px
 *   disabled      opacity 50% + cursor-not-allowed
 *   error         border #D92D20 + 하단 안내문 (스타일만, 검증 로직 없음)
 *
 * 단일 선택이면 value는 string, 복수 선택(multiple=true)이면 value는 string[].
 * - maxSelect  : 도달 시 미선택 항목을 disabled 처리하고 초과 클릭은 무시한다.
 *                도달 상태에서도 이미 선택된 항목의 해제는 계속 가능하다(자동 FIFO 교체 없음).
 * - exclusiveValues : 선택 시 같은 문항의 나머지 선택을 전부 해제하는 배타 선택지.
 *                     역방향도 성립 — 배타값이 선택된 상태에서 일반 항목을 고르면 배타값이 해제된다.
 */
type RawOption = string | { value?: string; label: string };

type OptionGroupProps = {
  options?: RawOption[];
  multiple?: boolean;
  maxSelect?: number;
  exclusiveValues?: string[];
  value?: string | string[] | null;
  onChange?: (value: string | string[]) => void;
  variant?: "row" | "chip";
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  /** accessible name of the group when the card title does not name it */
  ariaLabel?: string;
};

function normalizeOption(option: RawOption) {
  if (typeof option === "string") return { value: option, label: option };
  return { value: option.value ?? option.label, label: option.label };
}

export default function OptionGroup({
  options = [],
  multiple = false,
  maxSelect,
  exclusiveValues = [],
  value,
  onChange,
  variant = "row",
  disabled = false,
  error = false,
  errorMessage,
  ariaLabel,
}: OptionGroupProps) {
  const selectedList = multiple ? (Array.isArray(value) ? value : []) : [];
  const limit = maxSelect ?? Infinity;
  const limitReached = multiple && selectedList.length >= limit;

  function handleSelect(optionValue) {
    if (!onChange || disabled) return;

    if (!multiple) {
      onChange(optionValue);
      return;
    }

    // 이미 선택된 항목 → 항상 해제 가능 (maxSelect 도달 상태에서도).
    if (selectedList.includes(optionValue)) {
      onChange(selectedList.filter((item) => item !== optionValue));
      return;
    }

    // 배타 선택지 → 나머지 전부 해제하고 이것만 남긴다.
    if (exclusiveValues.includes(optionValue)) {
      onChange([optionValue]);
      return;
    }

    // 일반 항목 → 선택 중인 배타값을 먼저 걷어낸다.
    const withoutExclusive = selectedList.filter(
      (item) => !exclusiveValues.includes(item),
    );
    if (withoutExclusive.length >= limit) return;
    onChange([...withoutExclusive, optionValue]);
  }

  // chip 은 hug 폭이라 375(가용 277px)에서는 어떤 두 칩도 한 줄에 못 들어간다. 결과가
  // "폭이 제각각인 칩이 1개씩 세로로 쌓여 우측 끝이 톱니처럼 어긋나는" 배치라, 같은 화면의
  // variant='row' 문항과 정렬 규칙이 충돌했다. <640 은 row 와 동일한 전폭 리스트로 통일한다.
  //
  // 640~767 구간: hug wrap 을 그대로 쓰면 문항별 선택지 길이 편차 때문에 칩 2개가 한 줄에
  // 못 들어가는 문항(q13·q14 등)만 단독 행이 되어 우측에 큰 공백이 남고, 다른 문항(q1·q2)과
  // 행 구성이 들쭉날쭉해진다(톱니). 이 구간은 hug 를 버리고 2열 균등 그리드로 전환해 격자를
  // 고정한다 — <640 전폭 1열 → 640~767 2열 그리드 → ≥768 hug wrap 으로 시각적으로 연속된다.
  // 그리드는 기본 align-items: stretch 라 같은 행 칩이 라벨 줄 수와 무관하게 높이를 공유한다.
  // 선택지가 홀수 개면 마지막 칩이 그리드에서 혼자 남는데, 좌측 정렬(칩 폭만 차지, 우측 공백)보다
  // 전폭 스팬이 더 자연스럽다고 실측 확인되어(q1 @640/700/767, 5지 문항) col-span-2 로 전폭 처리한다.
  // ≥768 은 flex-wrap hug 로 복귀 — align-items 기본값(normal→stretch)이 이미 같은 효과를 낸다.
  const containerClass =
    variant === "chip"
      ? "flex w-full flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:[&>*:nth-child(odd):last-child]:col-span-2 md:flex md:flex-row md:flex-wrap"
      : "flex w-full flex-col items-start gap-3";

  return (
    <div className="flex w-full flex-col items-start">
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is dynamic (group or radiogroup); both take aria-label. */}
      <div
        className={containerClass}
        role={multiple ? "group" : "radiogroup"}
        aria-label={ariaLabel}
      >
        {options.map((rawOption) => {
          const { value: optionValue, label } = normalizeOption(rawOption);
          const active = multiple
            ? selectedList.includes(optionValue)
            : value === optionValue;
          // maxSelect 도달 시 배타 선택지도 다른 미선택 항목과 동일하게 막는다(QA 행340·342) —
          // 이미 선택된 항목은 handleSelect가 상한과 무관하게 항상 해제를 허용하므로, 해제 후
          // 배타 선택지를 고르는 경로는 여전히 열려 있다.
          const blockedByLimit = limitReached && !active;
          const isDisabled = disabled || blockedByLimit;

          return (
            // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role이 동적이라 정적 분석이 놓친다 — checkbox/radio 둘 다 aria-checked를 지원한다.
            <button
              key={optionValue}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={active}
              disabled={isDisabled}
              onClick={() => handleSelect(optionValue)}
              className={`flex min-h-17 items-center gap-6 rounded-perf-modal border px-5 py-3.5 text-left transition-[background-color,border-color,color] duration-150 focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                variant === "row" ? "w-full" : "w-full md:w-auto"
              } ${
                active
                  ? "border-primary bg-[#E9F4FF]"
                  : error
                    ? "border-[#D92D20] bg-white"
                    : "border-[#D9D9D9] bg-white enabled:hover:border-primary/20 enabled:hover:bg-[#FBFAFA]"
              } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <img
                src={active ? radioChecked : radioUnchecked}
                alt=""
                aria-hidden="true"
                className="size-6 shrink-0"
              />
              <span
                className={`break-keep text-xl font-normal leading-[1.4] ${
                  active ? "text-primary" : "text-ink"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {error && errorMessage && (
        <p className="mt-3 text-[0.75rem] font-medium leading-[1.4] text-[#D92D20]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
