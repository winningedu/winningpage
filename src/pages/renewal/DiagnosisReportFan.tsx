import type { CSSProperties, RefObject } from "react";
import { useEffect, useState } from "react";
import { useInView } from "@/hooks/useInView";

// 리포트 본문 16쪽(샘플 PDF 2~17쪽). 파일명 page-01..16 순서가 곧 카드 순서다.
const PAGE_IMAGES = Object.entries(
  import.meta.glob<string>(
    "@/assets/renewal/landing/diagnosis-report/page-*.webp",
    { eager: true, import: "default" },
  ),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src);

const CENTER = (PAGE_IMAGES.length - 1) / 2;
// 가운데부터 바깥으로 한 칸마다 늦춘다. 최대 7칸 x 45ms + 0.5s 전환 = 약 0.8s.
const STAGGER_MS = 45;

// 화면 폭별 부채꼴 크기. 카드 폭, 카드 간격, 가장자리로 갈수록 내려가는 정도(o^2 배수), 카드당 회전각.
const FAN_VARS_CLASS =
  "[--fan-card:5rem] [--fan-step:0.875rem] [--fan-drop:0.06rem] [--fan-angle:2deg] sm:[--fan-card:7rem] sm:[--fan-step:1.625rem] sm:[--fan-drop:0.08rem] sm:[--fan-angle:2.5deg] lg:[--fan-card:8.5rem] lg:[--fan-step:2.75rem] lg:[--fan-drop:0.1rem] xl:[--fan-card:10rem] xl:[--fan-step:3.5rem] xl:[--fan-drop:0.11rem] xl:[--fan-angle:3deg]";

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function spreadTransform(offset: number) {
  return `translateX(calc(${offset} * var(--fan-step))) translateY(calc(${offset * offset} * var(--fan-drop))) rotate(calc(${offset} * var(--fan-angle)))`;
}

export default function DiagnosisReportFan() {
  // 동작 줄이기 설정이면 처음부터 펼친 상태로 그리고 전환도 끈다.
  const [spread, setSpread] = useState(prefersReducedMotion);
  const [ref, inView] = useInView() as [
    RefObject<HTMLDivElement | null>,
    boolean,
  ];

  // 처음 화면에 들어왔을 때 한 번만 펼친다. 벗어나도 다시 접지 않는다.
  useEffect(() => {
    if (inView) setSpread(true);
  }, [inView]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="학습진단 16개 영역 리포트 페이지 미리보기"
      data-fan={spread ? "spread" : "stacked"}
      className={`relative w-full h-[calc(var(--fan-card)*1.42+var(--fan-drop)*56.25+2.5rem)] ${FAN_VARS_CLASS}`}
    >
      {PAGE_IMAGES.map((src, index) => {
        const offset = index - CENTER;
        const style: CSSProperties = {
          transform: spread ? spreadTransform(offset) : undefined,
          transitionDelay: `${Math.floor(Math.abs(offset)) * STAGGER_MS}ms`,
        };
        const number = String(index + 1).padStart(2, "0");
        return (
          <div
            key={src}
            style={style}
            className="absolute left-1/2 top-3 ml-[calc(var(--fan-card)*-0.5)] w-(--fan-card) transition-transform duration-500 ease-out hover:z-20 motion-reduce:transition-none"
          >
            {/* 호버 들림은 안쪽 요소가 맡는다. 바깥의 펼침 지연(transitionDelay)이 호버에 섞이지 않게 분리했다. */}
            <div className="relative transition-transform duration-200 ease-out hover:-translate-y-3 motion-reduce:transition-none">
              <img
                src={src}
                alt=""
                width={360}
                height={510}
                draggable="false"
                className="block aspect-[360/510] w-full rounded-[0.25rem] bg-white shadow-[0_0.25rem_1rem_rgba(15,23,42,0.12)]"
              />
              <span className="absolute left-[8%] top-0 -translate-y-1/2 rounded-[0.25rem] bg-report-orange px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-white sm:text-[0.75rem] lg:px-2 lg:py-1">
                {number}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
