import { useEffect, useMemo, useState } from "react";
import { useInfiniteMarquee } from "@/hooks/useInfiniteMarquee";
import { LANDING_MARQUEE_SPEED } from "./marqueeConfig";

const TRACK_TABS = [
  { key: "general", label: "일반계열" },
  { key: "medical_special", label: "의약학 · 특수계열" },
] as const;

type TrackKey = (typeof TRACK_TABS)[number]["key"];

// university_acceptances 활성 row(sort_order asc). 서브라벨은 subtitle 우선(예: '7명 합격',
// '의예과'), 없으면 count 기반 'N명 합격' 폴백.
// track 은 이 컴포넌트가 다루는 두 탭(TrackKey) 외에 "graduate"(대학원입학 프리미엄 전용,
// PremiumAcceptanceMarquee)도 DB 체크 제약상 허용된다 — 여기선 항상 걸러지고 렌더되지 않는다.
type University = {
  id: string;
  name: string;
  emblem_url?: string;
  subtitle?: string;
  count?: number | null;
  track: TrackKey | "graduate";
  sort_order?: number;
};

type AcceptanceSectionProps = {
  universities?: University[];
};

/**
 * 합격생 섹션 (명세 3.2)
 * - 타이틀 2줄 + 계열 탭(일반계열 | 의약학 · 특수계열) + 대학 카드 무한 롤링 마퀴
 * - useInfiniteMarquee 훅 사용 (화살표 없음, hover pause + 드래그/터치 스크롤 가드)
 * - 탭은 button + aria-selected, 탭 전환 시 캐러셀 위치 리셋
 * - 카드 행은 좌우 블리드(풀폭 오버플로) — 뷰포트보다 좁으면 중앙 정렬
 */
export default function AcceptanceSection({
  universities = [],
}: AcceptanceSectionProps) {
  const trackCounts = useMemo(
    () => ({
      general: universities.filter((item) => item.track === "general").length,
      medical_special: universities.filter(
        (item) => item.track === "medical_special",
      ).length,
    }),
    [universities],
  );

  const [selectedTrack, setSelectedTrack] = useState<TrackKey>("general");

  // 선택 탭 데이터가 0건이면 데이터가 있는 탭으로 폴백
  const activeTrack: TrackKey =
    trackCounts[selectedTrack] > 0
      ? selectedTrack
      : (TRACK_TABS.find((tab) => trackCounts[tab.key] > 0)?.key ??
        selectedTrack);

  const activeUniversities = useMemo(
    () => universities.filter((item) => item.track === activeTrack),
    [universities, activeTrack],
  );

  const { scrollRef, repeatIndices, containerHandlers, recenter } =
    useInfiniteMarquee({
      itemCount: activeUniversities.length,
      speed: LANDING_MARQUEE_SPEED,
      direction: "right",
    });

  // 탭 전환 시 캐러셀 위치 리셋 (중앙 사이클로 재배치 — 훅의 동적 repeatCount 반영)
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) activeTrack은 effect 안에서 읽지 않는 트리거 전용 값 — 탭이 바뀔 때마다 recenter를 다시 부르기 위한 재실행 신호다.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => recenter());
    return () => window.cancelAnimationFrame(frame);
  }, [activeTrack, recenter]);

  if (universities.length === 0) return null;

  // 2개 이상일 때만 N배 반복 마퀴(기본 3배, 훅이 폭에 맞춰 자동 증가), 이하면 원본만 정적 렌더
  const isMarquee = activeUniversities.length > 1;
  const renderIndices = isMarquee
    ? repeatIndices
    : activeUniversities.map((_, index) => index);

  return (
    <section aria-label="합격생" className="overflow-hidden bg-white">
      <div className="pb-0 pt-7 sm:pt-11 lg:pt-20">
        {/* 헤더 + 탭 */}
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          <h2 className="break-keep text-[1.5rem] font-semibold leading-[1.25] tracking-[-0.03rem] sm:text-[1.75rem] lg:text-[2rem] lg:tracking-[-0.04rem]">
            <span className="block text-primary">인서울부터 과기원까지</span>
            <span className="block text-ink">
              합격생 선배님들의 압도적 선택
            </span>
          </h2>

          <div
            role="tablist"
            aria-label="합격 계열 선택"
            className="mt-6 flex items-center gap-6 sm:gap-10"
          >
            {TRACK_TABS.map((tab, tabIndex) => {
              const isActive = activeTrack === tab.key;
              const isEmpty = trackCounts[tab.key] === 0;

              return (
                <div
                  key={tab.key}
                  className="flex items-center gap-6 sm:gap-10"
                >
                  {tabIndex > 0 && (
                    <span aria-hidden="true" className="h-7.5 w-px bg-line" />
                  )}
                  <button
                    type="button"
                    role="tab"
                    id={`acceptance-tab-${tab.key}`}
                    aria-selected={isActive}
                    aria-controls="acceptance-panel"
                    disabled={isEmpty}
                    onClick={() => setSelectedTrack(tab.key)}
                    className={`relative text-[1.5rem] leading-[1.3] tracking-[-0.03rem] transition-colors duration-200 ease-(--ease-out-quart) max-lg:after:absolute max-lg:after:-top-2.5 max-lg:after:-bottom-2.5 max-lg:after:inset-x-0 max-lg:after:content-[''] ${
                      isActive
                        ? "font-semibold text-ink"
                        : "font-medium text-line"
                    } ${
                      isEmpty
                        ? "cursor-not-allowed opacity-60"
                        : "hover:text-[#8a8a8a] focus-visible:text-[#8a8a8a]"
                    }`}
                  >
                    {tab.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 대학 카드 무한 롤링 (좌우 풀폭 블리드) */}
        <div
          id="acceptance-panel"
          role="tabpanel"
          aria-labelledby={`acceptance-tab-${activeTrack}`}
          className="mx-auto mt-6 w-full max-w-[120rem]"
          {...containerHandlers}
        >
          <div
            ref={scrollRef as React.RefObject<HTMLDivElement>}
            className="landing-marquee-mask w-full cursor-grab overflow-x-auto [-ms-overflow-style:none] scrollbar-none active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
          >
            <ul
              key={activeTrack}
              className={`panel-fade flex w-max min-w-full items-center gap-5 px-5 sm:px-8 ${
                isMarquee ? "" : "justify-center"
              }`}
            >
              {renderIndices.map((itemIndex, renderIndex) => {
                const university = activeUniversities[itemIndex];
                if (!university) return null;

                const cycle = Math.floor(
                  renderIndex / activeUniversities.length,
                );
                const isClone = isMarquee && cycle !== 1;

                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: 무한 마퀴 클론이라 같은 university.id가 여러 번 반복된다 — renderIndex로 각 클론 사본을 구분한다.
                    key={`${university.id}-${renderIndex}`}
                    aria-hidden={isClone || undefined}
                    className={`flex h-75 w-50 shrink-0 flex-col items-center gap-6 rounded-4xl pt-13 ${
                      activeTrack === "medical_special"
                        ? "bg-[#e9f4ff]"
                        : "bg-surface-footer"
                    }`}
                  >
                    {university.emblem_url ? (
                      <img
                        src={university.emblem_url}
                        alt={isClone ? "" : `${university.name} 엠블럼`}
                        width="120"
                        height="120"
                        loading="lazy"
                        // MentorCard 렌더 스케일(156/210≈0.743)과 어울리도록 기존 120px(h/w-30)을
                        // 같은 비율로 축소(120×0.743≈89px→h/w-22).
                        className="h-22 w-22 object-contain"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-22 w-22 rounded-full bg-[#eef0f3]"
                      />
                    )}
                    <p className="w-full px-2 text-center text-[1.25rem] font-medium leading-[1.3] text-ink">
                      {university.name}
                    </p>
                    <p className="text-center text-[1rem] font-normal leading-[1.3] text-ink">
                      {university.subtitle ??
                        (university.count != null
                          ? `${university.count}명 합격`
                          : "")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
