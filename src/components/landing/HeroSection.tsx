import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { resolvePromotedSlugLink } from "@/hooks/useNavGroups";

/** 스와이프 판정 최소 이동 거리 (px) */
const SWIPE_THRESHOLD = 40;
/** 트랙패드 휠 좌우 이동 판정 누적 deltaX 임계값 */
const WHEEL_THRESHOLD = 40;
/** 휠 슬라이드 이동 후 연속 이동 방지 쿨다운 (ms) */
const WHEEL_COOLDOWN = 500;
/** 휠 누적값 리셋 유예 — 마지막 휠 이벤트 후 이 시간이 지나면 새 제스처로 간주 (ms) */
const WHEEL_RESET_DELAY = 300;

/**
 * DB display_seconds(초, 배너별 NOT NULL·기본 10/5)를 밀리초로 환산. 폴백 상수를 두지 않는다 —
 * 값이 유효하지 않은 행은 자동 전환을 걸지 않는다(null 반환).
 */
function secondsToMs(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value * 1000
    : null;
}

/**
 * 히어로 좌/우 캐러셀 공용 로직 — 각 캐러셀은 독립된 훅 인스턴스를 사용하므로
 * 타이머/일시정지/스와이프 상태가 서로 간섭하지 않는다.
 * - 자동 전환: setTimeout 체인 (슬라이드별 intervals[activeIndex]), hover/focus/pointerdown 일시정지
 * - 포인터 스와이프 + 트랙패드 휠 좌우 이동, 드래그 직후 링크 클릭 방지
 * - pointerPaused 고착 방지 window 폴백 리스너
 *
 * @param intervals 슬라이드별 자동 전환 간격 (ms) — index는 activeIndex와 대응 (banners.display_seconds → secondsToMs)
 */
function useHeroCarousel(slideCount: number, intervals: Array<number | null>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);

  const dragStartXRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const wheelCooldownUntilRef = useRef(0);
  const wheelLastEventAtRef = useRef(0);

  // intervals는 매 렌더 새 배열 참조로 들어올 수 있어(부모 props.map 결과) ref로만
  // 최신값을 따라가고, 아래 자동 전환 effect의 의존성 배열에는 넣지 않는다 — 배열 참조가
  // 바뀔 때마다 진행 중이던 타이머가 리셋되는 것을 막기 위함이다.
  const intervalsRef = useRef(intervals);
  intervalsRef.current = intervals;

  // 슬라이드 개수 변동 시 인덱스 보정
  useEffect(() => {
    if (activeIndex >= slideCount) setActiveIndex(0);
  }, [slideCount, activeIndex]);

  const isPaused = hoverPaused || focusPaused || pointerPaused;

  // 자동 전환: setTimeout 체인 (activeIndex 변경 시 자동 리셋, 다음 지속 시간은
  // intervals[activeIndex] — 배너별 display_seconds)
  useEffect(() => {
    if (slideCount <= 1 || isPaused) return undefined;
    const duration = intervalsRef.current[activeIndex] ?? null;
    if (duration === null) return undefined;
    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % slideCount);
    }, duration);
    return () => clearTimeout(timer);
  }, [slideCount, isPaused, activeIndex]);

  const goTo = useCallback(
    (index: number) => {
      if (slideCount === 0) return;
      setActiveIndex(((index % slideCount) + slideCount) % slideCount);
    },
    [slideCount],
  );

  // 트랙패드 휠 좌우 이동: 가로 성분 우세 시 누적 deltaX로 슬라이드 전환.
  // 이동 후 쿨다운으로 관성 스크롤 연속 전환 방지. activeIndex 변경으로 자동 전환 타이머는 리셋됨.
  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      if (slideCount <= 1) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

      const now = performance.now();
      if (now < wheelCooldownUntilRef.current) {
        wheelLastEventAtRef.current = now;
        return;
      }
      if (now - wheelLastEventAtRef.current > WHEEL_RESET_DELAY) {
        wheelAccumRef.current = 0;
      }
      wheelLastEventAtRef.current = now;

      wheelAccumRef.current += event.deltaX;
      if (Math.abs(wheelAccumRef.current) >= WHEEL_THRESHOLD) {
        goTo(activeIndex + (wheelAccumRef.current > 0 ? 1 : -1));
        wheelAccumRef.current = 0;
        wheelCooldownUntilRef.current = now + WHEEL_COOLDOWN;
      }
    },
    [activeIndex, goTo, slideCount],
  );

  // 포인터 스와이프 (터치/마우스 드래그 공용)
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    dragStartXRef.current = event.clientX;
    dragMovedRef.current = false;
    setPointerPaused(true);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (dragStartXRef.current === null) return;
    if (Math.abs(event.clientX - dragStartXRef.current) > 8) {
      dragMovedRef.current = true;
    }
  }, []);

  const handlePointerUp = useCallback(
    (event: { clientX: number }) => {
      if (dragStartXRef.current !== null) {
        const deltaX = event.clientX - dragStartXRef.current;
        if (Math.abs(deltaX) >= SWIPE_THRESHOLD && slideCount > 1) {
          goTo(activeIndex + (deltaX < 0 ? 1 : -1));
        }
      }
      dragStartXRef.current = null;
      setPointerPaused(false);
    },
    [activeIndex, goTo, slideCount],
  );

  const handlePointerCancel = useCallback(() => {
    dragStartXRef.current = null;
    dragMovedRef.current = false;
    setPointerPaused(false);
  }, []);

  // 마우스 드래그가 컨테이너 밖에서 끝나면 컨테이너에 pointerup/pointercancel이
  // 전달되지 않아 pointerPaused가 고착됨 → 드래그 중에만 window 폴백 리스너 부착
  useEffect(() => {
    if (!pointerPaused) return undefined;
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [pointerPaused, handlePointerUp, handlePointerCancel]);

  // 드래그 직후 링크 클릭 방지
  const handleSlideClick = useCallback((event: React.MouseEvent) => {
    if (dragMovedRef.current) {
      event.preventDefault();
      dragMovedRef.current = false;
    }
  }, []);

  return {
    activeIndex,
    goTo,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleSlideClick,
    onMouseEnter: () => setHoverPaused(true),
    onMouseLeave: () => setHoverPaused(false),
    onFocusCapture: () => setFocusPaused(true),
    onBlurCapture: () => setFocusPaused(false),
  };
}

// banners 활성분(sort_order asc). 클릭 URL은 link_url 우선, 없으면 레거시 컬럼 button_link.
type MainBanner = {
  id?: string;
  title?: string;
  image_url: string;
  button_link?: string;
  link_url?: string;
  sort_order?: number;
  display_seconds?: number | null;
};

// home_side_banners 활성분(sort_order asc).
type SideBanner = {
  id?: string;
  title?: string;
  subtitle?: string;
  image_url?: string;
  mobile_image_url?: string;
  link_url?: string;
  open_new_window?: boolean;
  sort_order?: number;
  display_seconds?: number | null;
};

type HeroSectionProps = {
  banners?: MainBanner[];
  sideBanners?: SideBanner[];
};

/**
 * 히어로 섹션 (명세 3.1)
 * - 좌측 969×429: banners 활성분 캐러셀 — 자동 전환(배너별 display_seconds, 기본 10s,
 *   setTimeout 체인) + 카드 바깥 하단 중앙 pill 인디케이터 + 포인터 스와이프/트랙패드 휠
 *   좌우 이동 (화살표 없음). 1건뿐이면 pill·자동 전환 없이 고정 렌더. 텍스트(헤드라인/CTA)는
 *   디자이너가 이미지에 포함해 관리. 클릭 URL은 link_url 우선, 없으면 레거시 컬럼
 *   button_link(Home.jsx select 목록 참조).
 * - 우측 321×429: home_side_banners 자동 전환(배너별 display_seconds, 기본 5s, setTimeout
 *   체인) + 하단 중앙 pill 인디케이터 + 포인터 스와이프/트랙패드 휠 좌우 이동 (화살표 없음).
 *   1건뿐이면 pill·자동 전환 없이 고정
 * - 좌/우 캐러셀은 useHeroCarousel 훅의 독립 인스턴스를 사용해 타이머가 서로 간섭하지 않는다.
 * - hover/focus/pointerdown 일시정지. 자동 전환은 prefers-reduced-motion 과 무관하게 항상 동작
 */
export default function HeroSection({
  banners = [],
  sideBanners = [],
}: HeroSectionProps) {
  const leftSlides = banners.filter((item) => item.image_url);
  const leftSlideCount = leftSlides.length;
  const rightSlides = sideBanners.filter(
    (item) => item.image_url || item.mobile_image_url,
  );
  const rightSlideCount = rightSlides.length;

  // leftSlides/rightSlides는 매 렌더 새로 .filter()된 배열이라 아래 map 결과도 매번 새
  // 참조가 되지만, useHeroCarousel은 intervals를 ref로만 추적해 자동 전환 타이머를
  // 리셋시키지 않으므로 여기서 별도 메모이제이션은 필요 없다.
  const leftCarousel = useHeroCarousel(
    leftSlideCount,
    leftSlides.map((s) => secondsToMs(s.display_seconds)),
  );
  const rightCarousel = useHeroCarousel(
    rightSlideCount,
    rightSlides.map((s) => secondsToMs(s.display_seconds)),
  );

  if (leftSlideCount === 0 && rightSlideCount === 0) return null;

  return (
    <section aria-label="메인 히어로" className="w-full">
      {/* lg 가로 배치: gap 18px(1101x480 시안 원값)→1.125rem
          좌 73.89%(813.28/1100.6) + 우 24.47%(269.32/1100.6)
          lg 상단 패딩: 헤더 하단→배너 120px→7.5rem. pb는 0 — 다음 섹션 pt에서 갭 처리(섹션 수직 리듬 규칙) */}
      <div className="mx-auto flex w-full max-w-content flex-col items-center gap-10 px-5 py-8 sm:px-8 lg:flex-row lg:items-start lg:justify-center lg:gap-4.5 lg:pb-0 lg:pt-30">
        {/* 좌측 캐러셀 969×429 + 카드 바깥 하단 인디케이터 */}
        {leftSlideCount > 0 && (
          <div className="flex w-full flex-col items-center lg:basis-[73.89%] lg:grow lg:shrink-0">
            {/* 프레임 배경은 투명 — 여기는 slideCount > 0 가드 안이라 항상 배너가 있고,
                배너가 모서리 라운드를 구운 투명 PNG로 올라오면 프레임에 깔린 색이
                모서리 초승달로 비친다(2026-08-31 QA: 네이비 잔상). 배너가 0장이면
                섹션 자체가 렌더되지 않으므로 플레이스홀더 배경이 필요한 경로가 없다. */}
            <section
              aria-roledescription="carousel"
              aria-label="메인 배너"
              className="relative w-full touch-pan-y select-none overflow-hidden rounded-[1.64rem] aspect-969/429 hero-reveal-left"
              onMouseEnter={leftCarousel.onMouseEnter}
              onMouseLeave={leftCarousel.onMouseLeave}
              onFocusCapture={leftCarousel.onFocusCapture}
              onBlurCapture={leftCarousel.onBlurCapture}
              onPointerDown={leftCarousel.handlePointerDown}
              onPointerMove={leftCarousel.handlePointerMove}
              onPointerUp={leftCarousel.handlePointerUp}
              onPointerCancel={leftCarousel.handlePointerCancel}
              onWheel={leftCarousel.handleWheel}
            >
              <div
                className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{
                  transform: `translateX(-${leftCarousel.activeIndex * 100}%)`,
                }}
              >
                {leftSlides.map((banner, index) => {
                  // link_url 우선, 없으면 레거시 button_link (Home.jsx select 목록 참조).
                  // DB에 저장된 구 라우트('/gallery' 등)는 승격 매핑으로 신 라우트 치환 —
                  // 매핑에 없는 값은 원본 그대로 통과하므로 외부 URL에도 안전하다.
                  // ('/free-diagnosis'는 이 매핑이 아니라 App.jsx의 <Navigate replace> 라우트가 처리한다.)
                  const clickUrl = resolvePromotedSlugLink(
                    banner.link_url || banner.button_link || "",
                  );
                  const label = banner.title || `메인 배너 ${index + 1}`;
                  const isActive = index === leftCarousel.activeIndex;

                  const image = (
                    <img
                      src={banner.image_url}
                      alt={label}
                      width="969"
                      height="429"
                      draggable="false"
                      // LCP 대상은 첫 슬라이드만 — 설치된 React 19는 camelCase fetchPriority를
                      // 그대로 지원한다(React 18에서 소문자로 우회하던 관례는 더 이상 필요 없다).
                      {...(index === 0 ? { fetchPriority: "high" } : {})}
                      className="h-full w-full object-cover"
                    />
                  );

                  let content = image;
                  if (clickUrl) {
                    content = clickUrl.startsWith("/") ? (
                      <Link
                        to={clickUrl}
                        aria-label={label}
                        tabIndex={isActive ? 0 : -1}
                        draggable="false"
                        onClick={leftCarousel.handleSlideClick}
                        className="block h-full w-full"
                      >
                        {image}
                      </Link>
                    ) : (
                      <a
                        href={clickUrl}
                        aria-label={label}
                        tabIndex={isActive ? 0 : -1}
                        draggable="false"
                        onClick={leftCarousel.handleSlideClick}
                        className="block h-full w-full"
                      >
                        {image}
                      </a>
                    );
                  }

                  return (
                    <div
                      key={banner.id ?? index}
                      className="h-full w-full flex-none"
                      aria-hidden={!isActive}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 페이지네이션 인디케이터 — 카드 바깥 아래, 카드 기준 가로 중앙 (2건 이상일 때만)
                lg 배너→인디케이터 간격: 시안 35px×0.8347=29.21→1.83rem */}
            {leftSlideCount > 1 && (
              <div className="mt-3 flex items-center gap-2.5 hero-reveal-indicator lg:mt-[1.83rem]">
                {leftSlides.map((banner, index) => (
                  <button
                    key={banner.id ?? index}
                    type="button"
                    aria-label={`${index + 1}번째 메인 배너로 이동`}
                    aria-current={index === leftCarousel.activeIndex}
                    onClick={() => leftCarousel.goTo(index)}
                    className={`relative h-3 w-3 rounded-full transition-colors duration-300 after:absolute after:-inset-4 after:content-[''] ${
                      index === leftCarousel.activeIndex
                        ? "bg-primary"
                        : "bg-[#D9D9D9]"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 우측 캐러셀 321×429 + 카드 바깥 하단 인디케이터 */}
        {rightSlideCount > 0 && (
          <div className="flex w-full max-w-80.25 flex-col items-center md:max-w-104 lg:max-w-none lg:basis-[24.47%] lg:grow lg:shrink-0">
            {/* 좌측 캐러셀과 같은 이유로 프레임 배경(네이비 그라데이션) 제거 — 투명 PNG
                배너의 모서리·하단 반투명 영역으로 비쳐 보였다. */}
            <section
              aria-roledescription="carousel"
              aria-label="이벤트 배너"
              className="relative w-full touch-pan-y select-none overflow-hidden rounded-[1.64rem] aspect-321/429 hero-reveal-right"
              onMouseEnter={rightCarousel.onMouseEnter}
              onMouseLeave={rightCarousel.onMouseLeave}
              onFocusCapture={rightCarousel.onFocusCapture}
              onBlurCapture={rightCarousel.onBlurCapture}
              onPointerDown={rightCarousel.handlePointerDown}
              onPointerMove={rightCarousel.handlePointerMove}
              onPointerUp={rightCarousel.handlePointerUp}
              onPointerCancel={rightCarousel.handlePointerCancel}
              onWheel={rightCarousel.handleWheel}
            >
              <div
                className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{
                  transform: `translateX(-${rightCarousel.activeIndex * 100}%)`,
                }}
              >
                {rightSlides.map((slide, index) => {
                  const image = (
                    <picture className="block h-full w-full">
                      {slide.mobile_image_url && (
                        <source
                          media="(max-width: 768px)"
                          srcSet={slide.mobile_image_url}
                        />
                      )}
                      <img
                        src={slide.image_url || slide.mobile_image_url}
                        alt={slide.title || `이벤트 배너 ${index + 1}`}
                        width="321"
                        height="429"
                        draggable="false"
                        className="h-full w-full object-cover"
                      />
                    </picture>
                  );

                  return (
                    <div
                      key={slide.id ?? index}
                      className="h-full w-full flex-none"
                      aria-hidden={index !== rightCarousel.activeIndex}
                    >
                      {slide.link_url ? (
                        <a
                          href={slide.link_url}
                          target={slide.open_new_window ? "_blank" : undefined}
                          rel={
                            slide.open_new_window
                              ? "noopener noreferrer"
                              : undefined
                          }
                          tabIndex={
                            index === rightCarousel.activeIndex ? 0 : -1
                          }
                          draggable="false"
                          onClick={rightCarousel.handleSlideClick}
                          className="block h-full w-full"
                          aria-label={slide.title || `이벤트 배너 ${index + 1}`}
                        >
                          {image}
                        </a>
                      ) : (
                        image
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 페이지네이션 인디케이터 — 카드 바깥 아래, 카드 기준 가로 중앙 (2건 이상일 때만)
                lg 배너→인디케이터 간격: 시안 35px×0.8347=29.21→1.83rem */}
            {rightSlideCount > 1 && (
              <div className="mt-3 flex items-center gap-2.5 hero-reveal-indicator lg:mt-[1.83rem]">
                {rightSlides.map((slide, index) => (
                  <button
                    key={slide.id ?? index}
                    type="button"
                    aria-label={`${index + 1}번째 배너로 이동`}
                    aria-current={index === rightCarousel.activeIndex}
                    onClick={() => rightCarousel.goTo(index)}
                    className={`relative h-3 w-3 rounded-full transition-colors duration-300 after:absolute after:-inset-4 after:content-[''] ${
                      index === rightCarousel.activeIndex
                        ? "bg-primary"
                        : "bg-[#D9D9D9]"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
