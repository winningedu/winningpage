import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_SPEED = 0.035; // px per ms ≈ 35px/s
const TOUCH_RESUME_DELAY = 700; // 터치 스크롤 종료 후 자동 롤링 재개 유예(ms) — 관성 스크롤과 충돌 방지 가드
const MIN_REPEAT_COUNT = 3; // 최소 반복 카피 수 (기존 Home.jsx 3배 반복과 동일)

/**
 * 무한 롤링 마퀴 공용 훅 (합격생/멘토 캐러셀 공용)
 *
 * 기존 Home.jsx AcceptanceCarousel 검증 로직 이식:
 * - 아이템 N배 반복(기본 3배) + 실측 주기(인접 카피 offsetLeft 차) 기준 normalize
 * - rAF로 scrollLeft += delta * speed (delta는 frame당 최대 50ms 캡)
 * - 초기 중앙 사이클 배치 + resize 재배치
 * - prefers-reduced-motion 설정과 무관하게 항상 자동 스크롤 (hover/drag/touch 시에만 일시정지)
 *
 * 반복 카피 수 자동 보정:
 * - 한 사이클 폭(cycleWidth)이 컨테이너 폭 대비 좁으면 3카피만으로는
 *   maxScrollLeft < 2*cycleWidth 가 되어 normalize 래핑 지점에 도달하지 못하고
 *   끝에서 영구 정지(jam)한다 → 마운트/resize 시 필요한 카피 수를 계산해 증가
 *   (needed = ceil(clientWidth / cycleWidth) + 2, 최소 3)
 *
 * pause 조건 (hover 전용 모델):
 * - hover (mouseenter/leave)만 UI pause 트리거. focus/blur는 더 이상 pause에 관여하지 않는다.
 * - 드래그 진행 중(마우스/펜 button 0 pointerdown ~ pointerup/pointercancel)에는
 *   드래그 활성 플래그로 pause를 유지한다 — 드래그 중 마우스가 컨테이너를 벗어나
 *   mouseleave가 발생해도 auto-scroll이 재개되지 않는다. 드래그 종료 시에는
 *   hover 여부에 따라 자연스럽게 재개된다.
 * - 우클릭 등 button !== 0 pointerdown은 pause 상태에 전혀 관여하지 않는다
 *   (컨텍스트 메뉴로 pointerup을 못 받아도 stuck-pause가 발생하지 않는다).
 * - 터치는 hover 이벤트가 없으므로 별도 가드를 둔다: touchstart~touchend/cancel
 *   + 짧은 유예(700ms) 동안 auto-scroll을 멈춘다. 이는 UI pause 개념이 아니라
 *   터치 관성 스크롤과 rAF 자동 스크롤의 충돌을 막기 위한 보호 장치다.
 *   (마우스 드래그는 컨테이너 밖에서 release 시 컨테이너에 pointerup이 오지 않으므로
 *    window 레벨 pointerup/pointercancel 폴백으로 드래그 종료를 놓치지 않는다)
 *
 * 수동 스크롤:
 * - 터치/트랙패드/휠: overflow-x 네이티브 스크롤 그대로 사용
 * - 데스크톱 마우스: pointerdown 후 window 레벨 pointermove로 드래그-투-스크롤
 *   (scrollLeft 증분 적용 — 자동 스크롤과 같은 좌표계라 핸드오프 자연스러움)
 * - pause 중에도 rAF 루프에서 normalize를 계속 수행해 수동 스크롤로도
 *   카피 스트립의 물리적 끝에 도달하지 않음 (무한 유지)
 *
 * @param {object} opts
 * @param {number} [opts.itemCount=0] 원본 아이템 개수 (2개 이상일 때만 자동 롤링)
 * @param {number} [opts.speed=0.035] px per ms (기본 ≈ 35px/s)
 * @param {'left'|'right'} [opts.direction='left'] 자동 스크롤 진행 방향(시각 기준).
 *   'left'(기본, 기존 동작) = 콘텐츠가 좌측으로 흐름(scrollLeft 증가).
 *   'right' = 콘텐츠가 우측으로 흐름(scrollLeft 감소, 0 근접 시 사이클 폭만큼 점프해 루프 유지).
 * @returns {{
 *   scrollRef: import('react').MutableRefObject<HTMLElement|null>,
 *   repeatIndices: number[],
 *   containerHandlers: object,
 *   recenter: () => void,
 * }}
 *   - scrollRef: overflow-x 스크롤 컨테이너에 부착
 *   - repeatIndices: 원본 인덱스를 N배 반복한 배열 — items[index]로 렌더
 *   - containerHandlers: pause/드래그 이벤트 핸들러 묶음 — 캐러셀 래퍼(또는 스크롤 컨테이너)에 spread
 *   - recenter: 가운데 사이클 시작점으로 재배치 (탭 전환 등 콘텐츠 교체 시 호출)
 */
export function useInfiniteMarquee({
  itemCount = 0,
  speed = DEFAULT_SPEED,
  direction = "left",
}: {
  itemCount?: number;
  speed?: number;
  direction?: "left" | "right";
} = {}) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  // window.setTimeout()의 실제 반환값(number)을 기준으로 타입을 잡는다 — 이 프로젝트는
  // @types/node가 함께 실려 있어 `typeof setTimeout`류 타입 추출은 Node의 Timeout으로
  // 잡히지만, 브라우저 런타임에서 실제 호출/반환값은 number다.
  const touchResumeTimerRef = useRef<number | undefined>(undefined);
  const detachWindowReleaseRef = useRef<(() => void) | null>(null);
  const dragLastXRef = useRef(0);
  const hoveringRef = useRef(false);
  const draggingRef = useRef(false);
  const touchActiveRef = useRef(false);
  const carryRef = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const directionRef = useRef(direction);
  directionRef.current = direction;

  const [repeatCount, setRepeatCount] = useState(MIN_REPEAT_COUNT);
  const repeatCountRef = useRef(repeatCount);
  repeatCountRef.current = repeatCount;

  const enabled = itemCount > 1;
  const itemCountRef = useRef(itemCount);
  itemCountRef.current = itemCount;

  const repeatIndices = useMemo(() => {
    if (itemCount <= 0) return [];
    const base = Array.from({ length: itemCount }, (_, index) => index);
    return Array.from({ length: repeatCount }, () => base).flat();
  }, [itemCount, repeatCount]);

  // 반복 카피 수 보정: 사이클 폭이 좁으면 래핑 가능하도록 카피 수 증가 (증가만, 축소 없음)
  // enabled(itemCount > 1) 가드 필수 — 소비자는 1건일 때 원본만 정적 렌더하므로
  // DOM에 카피가 없고, scrollWidth/repeatCount 기반 계산이 무한 증가 루프에 빠진다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: itemCount/repeatCount는 effect 안에서 ref(itemCountRef/repeatCountRef)로만 읽는다 — 값이 바뀔 때 재계산을 트리거하기 위한 목적으로 deps에 남겨둔다.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !enabled) return undefined;

    const updateRepeatCount = () => {
      const cycleWidth = measureCycleWidth(
        container,
        itemCountRef.current,
        repeatCountRef.current,
      );
      const { clientWidth } = container;
      if (!cycleWidth || !clientWidth) return;
      const needed = Math.max(
        MIN_REPEAT_COUNT,
        Math.ceil(clientWidth / cycleWidth) + 2,
      );
      if (needed > repeatCountRef.current) {
        setRepeatCount(needed);
      }
    };

    const frame = window.requestAnimationFrame(updateRepeatCount);
    window.addEventListener("resize", updateRepeatCount);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateRepeatCount);
    };
  }, [enabled, itemCount, repeatCount]);

  // 초기 중앙 사이클 배치 + resize 재배치 (1건 정적 렌더 시에는 불필요 — enabled 가드)
  // biome-ignore lint/correctness/useExhaustiveDependencies: itemCount/repeatCount는 effect 안에서 ref(itemCountRef/repeatCountRef)로만 읽는다 — 값이 바뀔 때 재배치를 트리거하기 위한 목적으로 deps에 남겨둔다.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !enabled) return undefined;

    const positionAtMiddle = () => {
      const cycleWidth = measureCycleWidth(
        container,
        itemCountRef.current,
        repeatCountRef.current,
      );
      if (cycleWidth) {
        container.scrollTo({ left: cycleWidth, behavior: "auto" });
      }
    };

    const frame = window.requestAnimationFrame(positionAtMiddle);
    window.addEventListener("resize", positionAtMiddle);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionAtMiddle);
    };
  }, [enabled, itemCount, repeatCount]);

  // rAF 자동 스크롤
  useEffect(() => {
    if (!enabled) return undefined;

    let previousTime = performance.now();

    const animate = (currentTime) => {
      const container = scrollRef.current;
      const delta = Math.min(currentTime - previousTime, 50);
      previousTime = currentTime;

      const isPaused =
        hoveringRef.current || draggingRef.current || touchActiveRef.current;

      if (container) {
        if (!isPaused) {
          // 서브픽셀 증분 소실 방지용 캐리 (scrollLeft 정수 반올림 환경 보정)
          carryRef.current += delta * speedRef.current;
          const step = Math.trunc(carryRef.current);
          if (step !== 0) {
            carryRef.current -= step;
            container.scrollLeft +=
              directionRef.current === "right" ? -step : step;
          }
        } else {
          carryRef.current = 0;
        }
        // pause 중 수동 스크롤(휠/트랙패드/드래그)도 같은 scrollLeft 좌표계이므로
        // 항상 normalize — 사용자가 카피 스트립 물리적 끝에 도달하는 것을 방지.
        // 래핑은 실측 주기(cycleWidth)의 정확한 배수라 시각적으로 seamless.
        normalizeScrollPosition(
          container,
          itemCountRef.current,
          repeatCountRef.current,
        );
      }

      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [enabled]);

  // 언마운트 시 타이머/프레임/window 리스너 정리
  useEffect(
    () => () => {
      window.cancelAnimationFrame(animationFrameRef.current);
      window.clearTimeout(touchResumeTimerRef.current);
      detachWindowReleaseRef.current?.();
      detachWindowReleaseRef.current = null;
    },
    [],
  );

  // 가운데 사이클 시작점으로 재배치 (탭 전환 등 콘텐츠 교체 시 소비 측에서 호출)
  const recenter = useCallback(() => {
    const container = scrollRef.current;
    if (!container || itemCountRef.current <= 1) return;
    const cycleWidth = measureCycleWidth(
      container,
      itemCountRef.current,
      repeatCountRef.current,
    );
    if (cycleWidth) {
      container.scrollTo({ left: cycleWidth, behavior: "auto" });
    }
  }, []);

  const containerHandlers = useMemo(() => {
    // 터치 스크롤 종료 후 짧은 유예를 두고 auto-scroll 재개 (관성 스크롤 충돌 방지 가드,
    // hover pause와 무관한 별도 개념)
    const scheduleTouchResume = () => {
      window.clearTimeout(touchResumeTimerRef.current);
      touchResumeTimerRef.current = window.setTimeout(() => {
        touchActiveRef.current = false;
        normalizeScrollPosition(
          scrollRef.current,
          itemCountRef.current,
          repeatCountRef.current,
        );
      }, TOUCH_RESUME_DELAY);
    };

    // 데스크톱 마우스/펜 드래그-투-스크롤: 증분(delta) 방식이라
    // 드래그 중 normalize 래핑이 일어나도 앵커가 어긋나지 않음
    const handleDragMove = (event) => {
      const container = scrollRef.current;
      if (!container) return;
      const deltaX = event.clientX - dragLastXRef.current;
      dragLastXRef.current = event.clientX;
      container.scrollLeft -= deltaX;
      normalizeScrollPosition(
        container,
        itemCountRef.current,
        repeatCountRef.current,
      );
    };

    const detachWindowRelease = () => {
      detachWindowReleaseRef.current?.();
      detachWindowReleaseRef.current = null;
    };

    // 컨테이너 밖 release 폴백 포함 공용 release 처리 (중복 호출 무해)
    // 드래그는 release 즉시 해제하고, hover 여부에 따라 자연스럽게 재개된다.
    // 터치는 관성 스크롤 충돌 방지를 위해 짧은 유예를 두고 재개한다.
    const handleRelease = () => {
      detachWindowRelease();
      draggingRef.current = false;
      if (touchActiveRef.current) {
        scheduleTouchResume();
      }
    };

    return {
      onMouseEnter: () => {
        hoveringRef.current = true;
      },
      onMouseLeave: () => {
        hoveringRef.current = false;
      },
      onPointerDown: (event) => {
        const isTouch = event.pointerType === "touch";
        const isDragPointer = !isTouch && event.button === 0;

        // 우클릭 등 button !== 0 pointerdown은 pause 상태에 전혀 관여하지 않는다.
        // (컨텍스트 메뉴로 pointerup을 못 받아도 stuck-pause가 발생하지 않는다)
        if (!isDragPointer && !isTouch) return;

        window.clearTimeout(touchResumeTimerRef.current);

        if (isTouch) {
          touchActiveRef.current = true;
        }

        // 터치는 네이티브 스크롤(관성 포함)을 그대로 쓰고,
        // 마우스/펜만 드래그-투-스크롤 활성화 (스크롤바 숨김 보완)
        if (isDragPointer) {
          draggingRef.current = true;
          event.preventDefault(); // 드래그 중 텍스트 선택 방지
          dragLastXRef.current = event.clientX;
        }

        // 마우스 드래그가 컨테이너 밖에서 끝나도 release 되도록 window 폴백 등록
        detachWindowRelease();
        if (isDragPointer) {
          window.addEventListener("pointermove", handleDragMove);
        }
        window.addEventListener("pointerup", handleRelease);
        window.addEventListener("pointercancel", handleRelease);
        detachWindowReleaseRef.current = () => {
          window.removeEventListener("pointermove", handleDragMove);
          window.removeEventListener("pointerup", handleRelease);
          window.removeEventListener("pointercancel", handleRelease);
        };
      },
      onPointerUp: handleRelease,
      onPointerCancel: handleRelease,
      // 이미지 네이티브 드래그가 드래그-투-스크롤을 가로채지 않도록 차단
      onDragStart: (event) => {
        event.preventDefault();
      },
    };
  }, []);

  return { scrollRef, repeatIndices, containerHandlers, recenter };
}

/**
 * 반복 주기(한 카피의 실제 폭)를 DOM에서 실측한다.
 *
 * scrollWidth / repeatCount 근사는 트랙의 좌우 padding과 카피 경계를 가로지르는
 * flex gap이 scrollWidth에 섞여 랩마다 (2*pad - gap)/repeatCount px씩 시각적
 * 점프를 만든다. 같은 원본 인덱스의 인접 카피 간 offsetLeft 차이는 padding/gap
 * 구성과 무관하게 정확한 주기다.
 *
 * 트랙 탐색: scrollRef가 래퍼(div > ul)에 붙는 경우가 있어 단일 자식 래퍼를
 * 통과해 반복 아이템을 직접 담는 요소를 찾는다.
 */
function measureCycleWidth(
  container: HTMLElement | null,
  itemCount: number,
  repeatCount = MIN_REPEAT_COUNT,
) {
  if (!container) return 0;

  let track: Element = container;
  while (track && track.children.length === 1) {
    // while 조건이 length === 1을 보장하므로 children[0]은 항상 존재.
    track = track.children[0]!;
  }

  const items = track?.children as HTMLCollectionOf<HTMLElement> | undefined;
  if (itemCount > 0 && items && items.length > itemCount) {
    // 위 조건(items.length > itemCount)이 두 인덱스 모두의 존재를 보장.
    const cycleWidth = items[itemCount]!.offsetLeft - items[0]!.offsetLeft;
    if (cycleWidth > 0) return cycleWidth;
  }

  // 폴백: 아직 카피가 렌더되지 않았거나 측정 불가한 경우 기존 근사값
  return container.scrollWidth / repeatCount;
}

function normalizeScrollPosition(
  container: HTMLElement | null,
  itemCount: number,
  repeatCount = MIN_REPEAT_COUNT,
) {
  if (!container) return;

  const cycleWidth = measureCycleWidth(container, itemCount, repeatCount);
  if (!cycleWidth) return;

  if (container.scrollLeft >= cycleWidth * 2) {
    container.scrollLeft -= cycleWidth;
  } else if (container.scrollLeft < cycleWidth * 0.5) {
    container.scrollLeft += cycleWidth;
  }
}
