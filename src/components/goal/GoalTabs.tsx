import type { KeyboardEvent } from "react";
import { useRef } from "react";

type GoalTab = { value: string; label: string };

type GoalTabsProps = {
  tabs: GoalTab[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  gap?: string;
  variant?: "text" | "boxed";
};

// 목표관리 앱 텍스트 탭 — docs/figma-goal/00-INDEX.md §5-4 (표에 별도 행 없음, part-11 §213/
// part-13 §65 실측). 사용처 2곳:
//   - 성장 리포트 `주간`/`월간` (각 42×31, x=372/446, 피치 74)
//   - 학습방향 리포트 `내신 리포트`/`정시 리포트` (각 108×31, gap 20)
// 언더라인·배경 없음(시안 기준) — 활성은 진한 색+볼드(ink.strong), 비활성은 회색(ink.sub)으로만
// 구분한다. 폭은 고정하지 않고 hug(콘텐츠 폭) + gap으로 구현, 실제 피치/gap은 화면마다 다르므로
// gap prop으로 열어둔다(기본값은 두 사용처의 근사 중간값이 아니라 성장 리포트 쪽 74px 피치 −
// 42px 탭폭 = 32px(2rem)를 채택 — (추정)).
//
// variant="boxed": 성장 리포트 주간/월간처럼 선택 상태를 더 뚜렷이 보여야 할 때 쓰는 테두리 박스형
// (QA3 행69). 선택은 accent 테두리 + accent 글자, 비선택은 회색 테두리 + ink-sub 글자.
//
// 접근성: role="tablist"/"tab" + aria-selected, 좌우 방향키로 탭 이동(roving tabindex).
export default function GoalTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
  gap = "2rem",
  variant = "text",
}: GoalTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const el = tabRefs.current[index];
    if (el) el.focus();
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = (index + 1) % tabs.length;
      // 모듈 연산으로 항상 배열 범위 안의 인덱스만 나온다.
      onChange(tabs[next]!.value);
      focusTab(next);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = (index - 1 + tabs.length) % tabs.length;
      // 모듈 연산으로 항상 배열 범위 안의 인덱스만 나온다.
      onChange(tabs[prev]!.value);
      focusTab(prev);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex w-fit items-center"
      style={{ gap }}
    >
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={
              variant === "boxed"
                ? `h-9 w-fit shrink-0 rounded-lg border px-4 text-app-body leading-[1.3] transition-colors ${
                    selected
                      ? "border-accent font-bold text-accent"
                      : "border-[#E3E3E3] font-normal text-ink-sub"
                  }`
                : `h-7.75 w-fit shrink-0 text-app-body leading-[1.3] transition-colors ${
                    selected
                      ? "font-bold text-ink-strong"
                      : "font-normal text-ink-sub"
                  }`
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
