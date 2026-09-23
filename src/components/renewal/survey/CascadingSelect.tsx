import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

// 플레이스홀더는 Figma 시안 `1889:10708`(survey-10656.md §2.6)의 필드 표시값 원문이다
// (`건국대학교` / `경영학과` / `학생부종합` / `KU자기추천`). 안내문이 아니라 예시 값이며,
// 시안에서 4개 값 텍스트 모두 `#D7D7D7`(플레이스홀더 컬러)로 그려져 있어 미선택 상태를 나타낸다.
// 이전 문구(`대학을 선택해 주세요` 등)는 시안 근거가 없는 자체 작문이었고, 필드 가용폭 138px 에
// 실측 166~245px 라 잘리고 있었다. 시안 값은 최장 약 110px 로 절단이 발생하지 않는다.
//
// 비활성 상태 전용 문구는 시안에 없다 — 필드 모두 자기 예시 값을 그대로 표시한다
// (활성/비활성은 disabled 동작·스타일로만 구분한다).
//
// B-1 확정(2026-08-11) — 더미 `UNIVERSITY_DATA` 는 삭제됐다. 대학·학과·전형유형·세부전형명·
// 반영교과 4~5단 전부 parent(useAdmissionCascade)가 async 로 채운 options/loading/error 를
// 그대로 그린다 — 이 컴포넌트는 실데이터가 몇 종인지 전혀 알 필요가 없다(6종→11종으로 늘어도
// 무변경). `key`·`label`·`placeholder`·`options`·`loading`·`error` 를 가진 level 객체 배열을
// 그대로 받는 순수 표시·상호작용 컴포넌트다.
//
// QA 시트 행342(2026-09-02) — 대학·학과 옵션이 매우 길어 순수 드롭다운으로는 찾기 어렵다는
// 지적으로, university/department 두 단계만 검색형 콤보박스로 바꿨다. 전형 유형·세부 전형·
// 반영교과는 후보가 적어 기존 버튼+listbox 드롭다운을 그대로 유지한다. 자유 입력 문자열을 조회
// 키로 쓰지 않는다 — 후보 클릭/Enter로 확정된 값만 onChange 에 실리고, 입력을 지우거나 목록에
// 없는 문자열이면 값은 빈 문자열(미선택)로 떨어진다.
export type CascadeLevel = {
  key: string;
  label?: string;
  placeholder?: string;
  options?: string[];
  loading?: boolean;
  error?: unknown;
  onRetry?: (() => void) | null;
};

type CascadingSelectProps = {
  levels?: CascadeLevel[];
  value?: Record<string, string> | null;
  onChange?: (value: Record<string, string>) => void;
};

// university/department 는 후보가 수백 건이라 검색형 콤보박스로, 나머지(전형 유형 등)는 후보가
// 적어 기존 드롭다운으로 남긴다.
const SEARCHABLE_LEVEL_KEYS = new Set(["university", "department"]);

function resolveMeta(levels?: CascadeLevel[]) {
  return (levels ?? []).map((level) => ({
    key: level.key,
    label: level.label,
    placeholder: level.placeholder ?? "",
    options: level.options ?? [],
    loading: Boolean(level.loading),
    error: level.error ?? null,
    onRetry: typeof level.onRetry === "function" ? level.onRetry : null,
  }));
}

// 부분 일치 필터 — 대소문자·앞뒤/내부 공백을 무시한다("서울 대" 도 "서울대"에 매치).
function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function filterOptions(options: string[], query: string) {
  const trimmed = query.trim();
  if (!trimmed) return options;
  const needle = normalize(trimmed);
  return options.filter((option) => normalize(option).includes(needle));
}

export default function CascadingSelect({
  levels,
  value,
  onChange,
}: CascadingSelectProps) {
  const currentValue = value || {};
  const meta = resolveMeta(levels);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 검색형(combobox) 입력 필드의 key → DOM 노드. 모바일 키보드가 올라올 때 openCombobox에서
  // scrollIntoView 호출 대상을 찾는 데만 쓴다(버튼형 드롭다운은 키보드가 뜨지 않아 대상 없음).
  const inputRefsByKey = useRef<Record<string, HTMLInputElement | null>>({});

  // 콤보박스(검색형) 전용 상태 — key 별 입력 중인 텍스트와 키보드 하이라이트 인덱스.
  // 값이 확정(선택)되면 이 입력 텍스트는 지우고 currentValue[key] 를 그대로 표시에 쓴다.
  const [queryByKey, setQueryByKey] = useState<Record<string, string>>({});
  const [activeOptionIndex, setActiveOptionIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (openIndex === null) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpenIndex(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenIndex(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openIndex]);

  function handleSelect(index: number, option: string) {
    // index는 항상 meta.map 콜백에서 전달되어 범위 내(noUncheckedIndexedAccess 대응).
    const key = meta[index]!.key;
    const next: Record<string, string> = {
      ...currentValue,
      [key]: option,
    };
    for (let i = index + 1; i < meta.length; i += 1) {
      next[meta[i]!.key] = "";
    }
    onChange?.(next);
    setOpenIndex(null);
    setActiveOptionIndex(null);
    setQueryByKey((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  }

  // 콤보박스를 닫을 때(포커스 이탈·Escape·다른 필드 열기) 확정 없이 남은 입력 텍스트를 정리한다 —
  // 목록에 없는 문자열을 조회 키로 흘려보내지 않기 위해 값 자체는 이미 handleSelect 에서만 바뀐다.
  function closeCombobox(index: number) {
    const key = meta[index]!.key;
    setOpenIndex(null);
    setActiveOptionIndex(null);
    setQueryByKey((prev) => {
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  }

  // 열 때는 입력 텍스트를 항상 비운다 — 이미 선택된 값이 있어도(재변경 시) 전체 목록을 바로
  // 훑어볼 수 있게 하기 위해서다(선택값을 채워 두면 그 값 하나로만 즉시 좁혀져 재탐색이 막힌다).
  // 닫힌 상태의 표시값은 별개로 `selected` 를 그대로 쓴다(위 value prop 참고).
  function openCombobox(index: number) {
    setOpenIndex(index);
    setActiveOptionIndex(null);
    const key = meta[index]!.key;
    setQueryByKey((prev) => ({ ...prev, [key]: "" }));
    // 모바일 키보드가 올라오며 목록이 화면 밖으로 밀리는 문제를 완화 — 열 때 입력 필드를 한 번
    // 화면 중앙으로 맞춘다. jsdom엔 scrollIntoView가 없어 optional call로 무시되게 한다.
    inputRefsByKey.current[key]?.scrollIntoView?.({
      block: "center",
      behavior: "smooth",
    });
  }

  // 4열 고정 그리드는 228×4 + 20×3 = 972 를 요구한다. lg(1024) 에서 카드 내부 가용 폭은
  // 1024 − 64(sm:px-8) − 80(카드 sm:px-10) = 870 뿐이라 그리드가 카드 밖으로 튀어나갔다.
  // wide(74rem/1184) 부터는 컨테이너가 max-w-content(1164) 로 고정되어 가용 폭이
  // 1164 − 64 − 120 = 980 ≥ 972 가 되므로 여기서 4열을 켠다.
  // 1184 미만은 sm(640) 부터의 2×2 를 유지한다 — 3열은 4번째 필드만 홀로 남아 계단식 순서가 깨진다.
  // 2열 트랙에는 상한 22rem(352) 을 건다. 순수 1fr 이면 1024 에서 필드 하나가 427px 까지 벌어져
  // (시안 228 대비 1.87배) `건국대학교` 같은 짧은 값 하나에 과대한 폭이 배정되고 문항 밀도가 무너진다.
  // 640(235) · 768(299) 은 상한 미만이라 현행 폭 그대로다. 최장 표시값 `KU자기추천`(20px 약 110px)은
  // 235px 필드의 가용 텍스트 폭 147px 안에 들어가 절단이 없다. <640 은 1열 세로 4단 (§9-A5).
  return (
    <div
      ref={containerRef}
      // B-1(2026-08-11) — 5단째(반영교과/영역)는 후보 2개 이상일 때만 meta 에 추가되므로 wide 트랙도
      // meta.length 에 맞춰 5열로 좁혀 그린다(4열 972 규격과 같은 산식: 11rem×5+1.25rem×4=60rem≈960px).
      className={`grid w-full max-w-248 grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,22rem))] wide:gap-5 ${
        meta.length >= 5
          ? "wide:grid-cols-[repeat(5,11rem)]"
          : "wide:grid-cols-[repeat(4,14.25rem)]"
      }`}
    >
      {meta.map((level, index) => {
        const selected = currentValue[level.key] || "";
        const options = level.options;
        const searchable = SEARCHABLE_LEVEL_KEYS.has(level.key);
        // index>0일 때만 평가되므로 index-1은 항상 0 이상 범위 내(noUncheckedIndexedAccess 대응).
        const enabled =
          index === 0 || Boolean(currentValue[meta[index - 1]!.key]);
        const isOpen = openIndex === index;
        const listboxId = `cascade-listbox-${level.key}`;
        const query = queryByKey[level.key] ?? "";
        const filteredOptions = searchable
          ? filterOptions(options, query)
          : options;
        const activeOptionId =
          isOpen && searchable && activeOptionIndex !== null
            ? `cascade-option-${level.key}-${activeOptionIndex}`
            : undefined;
        const buttonToneClassName = (() => {
          if (!enabled)
            return "cursor-not-allowed border-line bg-[#F5F5F5] text-line";
          if (isOpen) return "border-primary bg-white text-ink-title";
          if (selected)
            return "border-primary bg-white text-ink-title hover:border-[#B0B0B0]";
          return "border-line bg-white text-line hover:border-[#B0B0B0]";
        })();

        return (
          <div key={level.key} className="relative flex min-w-0 flex-col gap-2">
            <p
              className={`text-base font-medium leading-5 ${
                enabled ? "text-ink" : "text-line"
              }`}
            >
              {level.label}
            </p>

            {searchable ? (
              <div className="relative">
                <input
                  type="text"
                  ref={(el) => {
                    inputRefsByKey.current[level.key] = el;
                  }}
                  role="combobox"
                  aria-label={level.label}
                  aria-haspopup="listbox"
                  aria-expanded={isOpen}
                  aria-controls={listboxId}
                  {...(activeOptionId
                    ? { "aria-activedescendant": activeOptionId }
                    : {})}
                  autoComplete="off"
                  disabled={!enabled}
                  placeholder={level.placeholder}
                  value={isOpen ? query : selected}
                  onFocus={() => enabled && openCombobox(index)}
                  onClick={() => enabled && !isOpen && openCombobox(index)}
                  onChange={(event) => {
                    if (!enabled) return;
                    if (!isOpen) setOpenIndex(index);
                    setActiveOptionIndex(null);
                    setQueryByKey((prev) => ({
                      ...prev,
                      [level.key]: event.target.value,
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (!enabled) return;
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      if (!isOpen) {
                        openCombobox(index);
                        return;
                      }
                      setActiveOptionIndex((prev) => {
                        const count = filteredOptions.length;
                        if (count === 0) return null;
                        if (prev === null) return 0;
                        return (prev + 1) % count;
                      });
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (!isOpen) return;
                      setActiveOptionIndex((prev) => {
                        const count = filteredOptions.length;
                        if (count === 0) return null;
                        if (prev === null) return count - 1;
                        return (prev - 1 + count) % count;
                      });
                    } else if (event.key === "Enter") {
                      if (!isOpen) return;
                      event.preventDefault();
                      if (
                        activeOptionIndex !== null &&
                        filteredOptions[activeOptionIndex] !== undefined
                      ) {
                        handleSelect(
                          index,
                          filteredOptions[activeOptionIndex]!,
                        );
                      }
                    } else if (event.key === "Escape") {
                      closeCombobox(index);
                    }
                  }}
                  onBlur={(event) => {
                    // 컨테이너 안 다음 포커스 대상(옵션 버튼)으로 옮겨가는 blur는 mousedown 핸들러가
                    // 이미 클릭을 처리하므로 여기서 닫아도 선택 동작과 경합하지 않는다.
                    if (
                      containerRef.current &&
                      event.relatedTarget instanceof Node &&
                      containerRef.current.contains(event.relatedTarget)
                    ) {
                      return;
                    }
                    closeCombobox(index);
                  }}
                  className={`h-17 w-full rounded-perf-modal border py-5 pl-5 pr-12 text-left text-xl font-normal leading-5 transition-[background-color,border-color,color] duration-150 placeholder:text-line focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent/30 ${buttonToneClassName}`}
                />
                {/* chevron: lucide-react ChevronDown 24 유지 (§7 C-7 — 별도 SVG 추출 안 함) */}
                <ChevronDown
                  size={24}
                  aria-hidden="true"
                  className={`pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180 text-primary" : ""} ${
                    !enabled
                      ? "text-line"
                      : selected
                        ? "text-primary"
                        : "text-line"
                  }`}
                />
              </div>
            ) : (
              <button
                type="button"
                disabled={!enabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => enabled && setOpenIndex(isOpen ? null : index)}
                className={`flex h-17 w-full items-center justify-between gap-6 rounded-perf-modal border px-5 text-left text-xl font-normal leading-5 transition-[background-color,border-color,color] duration-150 focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent/30 ${buttonToneClassName}`}
              >
                <span className="truncate">
                  {selected || level.placeholder}
                </span>
                {/* chevron: lucide-react ChevronDown 24 유지 (§7 C-7 — 별도 SVG 추출 안 함) */}
                <ChevronDown
                  size={24}
                  className={`shrink-0 transition-transform duration-150 ${isOpen ? "rotate-180 text-primary" : ""} ${
                    !enabled
                      ? "text-line"
                      : selected
                        ? "text-primary"
                        : "text-line"
                  }`}
                />
              </button>
            )}

            {isOpen && (
              // QA 시트 2차 행57 — positioning(absolute/top)은 이 plain wrapper가 전담한다.
              // ScrollArea(OverlayScrollbars 호스트) 자신에 걸면 overlayscrollbars.css의
              // `[data-overlayscrollbars]{position:relative}`(@layer 밖, 언레이어드)가
              // Tailwind `@layer utilities`의 `.absolute`를 항상 이겨 목록이 정상 흐름에
              // 남아 카드 바닥까지 밀려난다(실측 재현 완료) — align-items:stretch 문제가 아니다.
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30">
                <ScrollArea
                  id={listboxId}
                  role="listbox"
                  aria-label={level.label}
                  className="max-h-72 rounded-2xl border border-[#EDEDED] bg-white p-2 shadow-[0_1rem_2.5rem_rgba(15,23,42,0.12)]"
                >
                  {(() => {
                    if (level.loading)
                      return (
                        <p className="px-4 py-3 text-base text-[#808080]">
                          불러오는 중입니다…
                        </p>
                      );
                    if (level.error)
                      // 재시도 콜백이 있으면(대학 단계) 다시 조회할 수 있게 버튼을 함께 준다 —
                      // 없으면(하위 단계) 상위 선택을 바꾸면 자연히 재조회되므로 안내만 남긴다.
                      return (
                        <div className="flex flex-col gap-2 px-4 py-3">
                          <p className="text-base text-[#C23B3B]">
                            목록을 불러오지 못했습니다.
                          </p>
                          {level.onRetry && (
                            <button
                              type="button"
                              onClick={() => level.onRetry?.()}
                              className="inline-flex min-h-11 w-fit items-center rounded-xl border border-primary px-4 py-2 text-base font-medium text-primary transition hover:bg-[#F1F8FF] focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent/30"
                            >
                              다시 시도
                            </button>
                          )}
                        </div>
                      );

                    if (searchable) {
                      if (options.length === 0)
                        return (
                          <p className="px-4 py-3 text-base text-[#808080]">
                            선택 가능한 옵션이 없습니다.
                          </p>
                        );
                      if (filteredOptions.length === 0)
                        return (
                          <p className="px-4 py-3 text-base text-[#808080]">
                            일치하는 {level.label ?? "항목"}이 없어요.
                          </p>
                        );
                      return filteredOptions.map((option, optionIndex) => {
                        const isSelected = option === selected;
                        const isActive = optionIndex === activeOptionIndex;
                        return (
                          <button
                            key={option}
                            id={`cascade-option-${level.key}-${optionIndex}`}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            // mousedown에서 preventDefault 해야 input이 blur 되지 않는다(blur가
                            // click보다 먼저 발생해 열린 목록이 click 전에 닫히는 걸 막는다).
                            // 실제 선택 확정은 표준 클릭 시맨틱을 유지하기 위해 onClick에서 한다.
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelect(index, option)}
                            onMouseEnter={() =>
                              setActiveOptionIndex(optionIndex)
                            }
                            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-base transition hover:bg-[#F1F8FF] ${
                              isSelected || isActive
                                ? "bg-[#F1F8FF] font-medium text-primary"
                                : "text-ink"
                            }`}
                          >
                            <span className="truncate">{option}</span>
                            {isSelected && (
                              <Check
                                size={18}
                                className="shrink-0 text-primary"
                              />
                            )}
                          </button>
                        );
                      });
                    }

                    if (options.length === 0)
                      return (
                        <p className="px-4 py-3 text-base text-[#808080]">
                          선택 가능한 옵션이 없습니다.
                        </p>
                      );
                    return options.map((option) => {
                      const isSelected = option === selected;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelect(index, option)}
                          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-base transition hover:bg-[#F1F8FF] ${
                            isSelected
                              ? "bg-[#F1F8FF] font-medium text-primary"
                              : "text-ink"
                          }`}
                        >
                          <span className="truncate">{option}</span>
                          {isSelected && (
                            <Check
                              size={18}
                              className="shrink-0 text-primary"
                            />
                          )}
                        </button>
                      );
                    });
                  })()}
                </ScrollArea>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
