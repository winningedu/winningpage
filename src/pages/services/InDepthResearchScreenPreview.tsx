import { type MutableRefObject, useEffect, useState } from "react";
import previewDesign from "@/assets/services/research/preview-design.png";
import previewEvaluate from "@/assets/services/research/preview-evaluate.png";
import previewWrite from "@/assets/services/research/preview-write.png";
import { useInView } from "@/hooks/useInView";

const SLIDES = [
  { key: "design", label: "설계 리포트", image: previewDesign },
  { key: "write", label: "보고서 작성", image: previewWrite },
  { key: "evaluate", label: "평가 리포트", image: previewEvaluate },
];

const AUTO_ADVANCE_MS = 5000;
const PANEL_ID = "research-preview-panel";
const tabId = (index: number) => `research-preview-tab-${index}`;

// matchMedia 가 없는 환경은 모션 축소 요청이 없는 것으로 본다
function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// 심화탐구 랜딩의 화면 미리보기 캐러셀. 헤딩은 페이지의 섹션이 렌더한다.
export default function InDepthResearchScreenPreview() {
  const [rootRef, inView] = useInView() as [
    MutableRefObject<HTMLDivElement | null>,
    boolean,
  ];
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const running = inView && !hovered && !focused && !prefersReducedMotion();

  // active 를 의존성에 둬서 점 클릭 때 타이머가 처음부터 다시 시작한다
  // biome-ignore lint/correctness/useExhaustiveDependencies: active 변경이 곧 타이머 재시작 신호
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [running, active]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover와 포커스는 자동 전환을 멈추는 신호일 뿐 조작 요소가 아니다
    <div
      ref={rootRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <div className="mt-10 rounded-[1.375rem] lg:p-[2.1875rem]">
        <div className="overflow-hidden rounded-[0.3125rem] bg-white shadow-[0_0_0.0625rem_rgba(0,0,0,0.7),0_1.25rem_1.875rem_rgba(0,0,0,0.3),0_0.625rem_3.125rem_rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#DFE1E5] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ED6A5E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#F6BE4F]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#62C554]" />
            <div className="flex-1 truncate rounded-full bg-[#F1F3F4] px-4 py-1 text-center text-[0.75rem] text-[#767676]">
              https://www.winningedu.com
            </div>
          </div>
          <div
            role="tabpanel"
            id={PANEL_ID}
            aria-labelledby={tabId(active)}
            className="aspect-[1030/539] w-full bg-white"
          >
            {SLIDES.map((slide, index) => (
              <img
                key={slide.key}
                src={slide.image}
                alt={`${slide.label} 화면`}
                className="block h-full w-full object-cover object-top"
                draggable={false}
                loading={index === active ? "eager" : "lazy"}
                hidden={index !== active}
              />
            ))}
          </div>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="미리보기 화면"
        className="mt-5 flex justify-center gap-2"
      >
        {SLIDES.map((slide, index) => {
          const selected = index === active;
          return (
            <button
              key={slide.key}
              type="button"
              role="tab"
              id={tabId(index)}
              aria-selected={selected}
              aria-controls={PANEL_ID}
              aria-label={`${slide.label} 화면 보기`}
              onClick={() => setActive(index)}
              className="flex h-6 items-center px-0.5"
            >
              <span
                className={`h-[0.5625rem] rounded-full transition-all ${
                  selected ? "w-[1.625rem] bg-primary" : "w-[0.5625rem] bg-line"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
