import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { site } from "@/config/site";
import type { PremiumBookPage } from "./bookPairing";
import {
  buildViews,
  FACE_GAP,
  FACE_PAGE,
  FACE_VOID,
  type Face,
} from "./bookPairing";
import "./book-viewer.css";

// 프리미엄 안내 책자 뷰어 — 표현 전용(presentational) 컴포넌트.
//
// 소비처가 둘이라(공개 /premium-apply, 어드민 미리보기) 데이터 페칭을 이 컴포넌트 밖으로
// 뺐다. pages/loading/error/onRetry는 전부 prop이다:
//   - 공개 페이지는 usePremiumBookPages 훅(DB 조회 + DEV 더미 폴백)으로 채운다.
//   - 어드민 미리보기는 저장 전 변환 결과(예: blob URL)를 같은 모양으로 직접 조립해 넘긴다.
// pages의 모양은 premium_book_pages 행과 동일하다: { sort_order, image_url }[].
//
// 3D 넘김의 DOM 구조는 스파이크 spike/s2-rotatey.html의 B(맞음) 데모를 전사한 것이고
// (명세 §5.1 트리와 동일), 구현 함정 ①~⑤는 book-viewer.css에 주석으로 붙여 뒀다.
// 페어링 규칙은 이 파일에 없다 — bookPairing.js의 buildViews 출력만 소비한다(§D7).

// 전환 시간(명세 §D5: 300~400ms). CSS 변수로 내려보내 JS·CSS 타이밍이 어긋나지 않게 한다.
const FLIP_MS = 360;
// 1페이지 모드는 3D가 아니라 좌우 페이드다. 이 시점에 내용을 교체하고 되들어온다.
const SINGLE_MS = 180;
// 이산 스와이프 임계값(px). 드래그 스크럽은 범위 밖이다(§D5).
const SWIPE_MIN_PX = 48;
// armed → running 승격의 rAF 폴백. 백그라운드 탭에서는 rAF가 멈추지만 setTimeout은 발화한다.
const ARM_FALLBACK_MS = 120;

const SPREAD_QUERY = "(min-width: 1024px)";
const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const WATERMARK_SRC = site.logo.stacked;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : false,
  );

  // HeroSection.jsx:190-198 패턴 — 마운트 시 1회 읽고 change 리스너를 건다.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

function FaceContent({
  face,
  failed,
  onFail,
  eager,
  hidden,
}: {
  face: Face | null;
  failed: boolean;
  onFail: (order: number, url: string) => void;
  eager?: boolean;
  hidden?: boolean;
}) {
  if (!face || face.kind === FACE_VOID) {
    return <div className="pbv-blank pbv-blank--void" />;
  }

  if (face.kind === FACE_GAP) {
    return (
      <div className="pbv-blank">
        <img
          className="pbv-watermark"
          src={WATERMARK_SRC}
          alt=""
          aria-hidden="true"
        />
      </div>
    );
  }

  const url = face.page?.image_url ?? "";
  if (!url || failed) {
    return (
      <div className="pbv-blank">
        <p className="pbv-blank-text">
          {face.order}페이지를 불러오지 못했습니다.
        </p>
      </div>
    );
  }

  return (
    <img
      className="pbv-page-img"
      src={url}
      // alt는 DB 컬럼 없이 프론트에서 생성한다(§5.3, sql/47에서 alt_text를 뺀 이유).
      alt={hidden ? "" : `프리미엄 안내 책자 ${face.order}페이지`}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable="false"
      onError={() => onFail(face.order as number, url)}
    />
  );
}

type FlipPhase = "armed" | "running";

type FlipState = {
  dir: "next" | "prev";
  targetOrder: number;
  phase: FlipPhase;
};

type BookViewerProps = {
  // pages: { sort_order, image_url }[] — premium_book_pages 행과 동일한 모양.
  pages: PremiumBookPage[];
  // loading/error: 상위(훅 또는 어드민 상태)가 넘기는 페칭 상태. 둘 다 기본값은 "이미 준비됨"이다.
  loading?: boolean;
  error?: unknown;
  // onRetry: error 상태의 "다시 시도" 버튼 핸들러. 재시도 개념이 없는 소비처는 생략해도 된다.
  onRetry?: () => void;
};

export default function BookViewer({
  pages,
  loading = false,
  error = null,
  onRetry,
}: BookViewerProps) {
  // 현재 위치는 뷰 인덱스가 아니라 페이지(sort_order) 앵커로 들고 있다.
  // spread ↔ 1페이지 모드가 바뀌어도 보고 있던 페이지가 유지된다.
  const [anchorOrder, setAnchorOrder] = useState(1);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [failedOrders, setFailedOrders] = useState<Set<number>>(
    () => new Set(),
  );

  const flipRef = useRef<FlipState | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const isSpread = useMediaQuery(SPREAD_QUERY);
  const reducedMotion = useMediaQuery(REDUCE_MOTION_QUERY);

  const book = useMemo(() => buildViews(pages), [pages]);
  const { views, lastOrder, viewIndexByOrder, faceByOrder } = book;

  const status = (() => {
    if (loading) return "loading";
    if (error) return "error";
    if (lastOrder === 0) return "empty";
    return "ready";
  })();

  // 책이 바뀌면 앵커를 범위 안으로 되돌린다.
  useEffect(() => {
    setAnchorOrder((prev) =>
      Math.min(Math.max(prev, 1), Math.max(lastOrder, 1)),
    );
  }, [lastOrder]);

  const viewIndex = viewIndexByOrder.get(anchorOrder) ?? 0;
  const currentView = views[viewIndex] ?? null;

  const hasPrev = isSpread ? viewIndex > 0 : anchorOrder > 1;
  const hasNext = isSpread
    ? viewIndex < views.length - 1
    : anchorOrder < lastOrder;

  const commitFlip = useCallback(() => {
    const token = flipRef.current;
    if (!token) return;
    flipRef.current = null;
    setAnchorOrder(token.targetOrder);
    setFlip(null);
  }, []);

  const step = useCallback(
    (dir: "next" | "prev") => {
      if (status !== "ready") return;
      if (flipRef.current) return; // 진행 중인 넘김이 끝날 때까지 입력을 무시한다

      let targetOrder: number | null = null;
      if (isSpread) {
        const targetIndex = dir === "next" ? viewIndex + 1 : viewIndex - 1;
        const targetView = views[targetIndex];
        if (!targetView) return;
        targetOrder = targetView.primaryOrder;
      } else {
        const next = dir === "next" ? anchorOrder + 1 : anchorOrder - 1;
        if (next < 1 || next > lastOrder) return;
        targetOrder = next;
      }

      // reduced-motion은 0ms 즉시 전환이다. 애니메이션을 걸지 않으므로 transitionend도 없고,
      // 여기서 바로 커밋한다(§5.3).
      if (reducedMotion) {
        setAnchorOrder(targetOrder);
        return;
      }

      flipRef.current = {
        dir,
        targetOrder,
        phase: isSpread ? "armed" : "running",
      };
      // armed(각도 0) 프레임은 3D 잎이 있는 spread 모드에만 필요하다. 1페이지 모드는 페이드라
      // 무대에 올릴 0도 프레임이 없어, arm을 거치면 rAF 의존만 늘고 얻는 게 없다.
      setFlip({ dir, targetOrder, phase: isSpread ? "armed" : "running" });
    },
    [status, isSpread, viewIndex, views, anchorOrder, lastOrder, reducedMotion],
  );

  // armed(각도 0) 프레임이 실제로 페인트된 뒤에 각도를 바꿔야 트랜지션이 발화한다.
  // 폴백 타이머를 함께 거는 이유: 백그라운드 탭에서는 rAF가 멈춰 armed에 갇히는데, 커밋
  // 타이머는 running에서만 걸리므로 flipRef가 찬 채로 입력이 영구히 잠긴다.
  useEffect(() => {
    if (flip?.phase !== "armed") return undefined;
    const promote = () =>
      setFlip((prev) =>
        prev && prev.phase === "armed" ? { ...prev, phase: "running" } : prev,
      );
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(promote);
    });
    const fallback = window.setTimeout(promote, ARM_FALLBACK_MS);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.clearTimeout(fallback);
    };
  }, [flip]);

  // 커밋 시점을 transitionend에서 분리한다. 백그라운드 탭·합성 실패·중단처럼 transitionend가
  // 아예 발화하지 않는 경로가 있고, 1페이지 모드에는 3D leaf 자체가 없다.
  useEffect(() => {
    if (flip?.phase !== "running") return undefined;
    const delay = isSpread ? FLIP_MS + 80 : SINGLE_MS;
    const id = window.setTimeout(commitFlip, delay);
    return () => window.clearTimeout(id);
  }, [flip, isSpread, commitFlip]);

  // 모드나 모션 설정이 바뀌면 진행 중인 넘김을 즉시 확정한다 — leaf DOM이 사라지면
  // transitionend가 오지 않아 입력이 영구히 잠긴다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) isSpread/reducedMotion은 effect 안에서 읽지 않는 트리거 전용 값 — 모드·모션 설정이 바뀔 때마다 진행 중인 넘김을 확정시키기 위한 재실행 신호다.
  useEffect(() => {
    commitFlip();
  }, [isSpread, reducedMotion, commitFlip]);

  useEffect(
    () => () => {
      flipRef.current = null;
    },
    [],
  );

  const handleImageError = useCallback((order: number, url: string) => {
    console.error(`프리미엄 책자 ${order}페이지 이미지 로드 실패:`, url);
    setFailedOrders((prev) => {
      if (prev.has(order)) return prev;
      const next = new Set(prev);
      next.add(order);
      return next;
    });
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step("prev");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step("next");
      // Home/End는 여러 뷰를 건너뛴다. 잎 1장으로 표현할 수 없는 이동이라 넘김 없이 즉시 점프한다.
    } else if (event.key === "Home") {
      event.preventDefault();
      if (!flipRef.current) setAnchorOrder(1);
    } else if (event.key === "End") {
      event.preventDefault();
      if (!flipRef.current && lastOrder > 0) setAnchorOrder(lastOrder);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    step(dx < 0 ? "next" : "prev");
  }

  // 넘김 중에는 정지 면과 잎 앞/뒷면의 배치가 달라진다.
  //   전진 — 좌측은 그대로, 우측은 다음 뷰의 우측이 미리 드러나고, 잎이 그 위를 덮는다.
  //   후진 — 그 거울상.
  const frame = useMemo(() => {
    const targetView =
      flip && isSpread
        ? views[viewIndexByOrder.get(flip.targetOrder) ?? viewIndex]
        : null;

    if (!isSpread) {
      return {
        left: faceByOrder.get(anchorOrder) ?? null,
        right: null as Face | null,
        leaf: null as { front: Face; back: Face } | null,
      };
    }

    if (!currentView) return { left: null, right: null, leaf: null };
    if (!flip || !targetView) {
      return { left: currentView.left, right: currentView.right, leaf: null };
    }

    if (flip.dir === "next") {
      return {
        left: currentView.left,
        right: targetView.right,
        leaf: { front: currentView.right, back: targetView.left },
      };
    }
    return {
      left: targetView.left,
      right: currentView.right,
      leaf: { front: currentView.left, back: targetView.right },
    };
  }, [
    flip,
    isSpread,
    views,
    viewIndexByOrder,
    viewIndex,
    currentView,
    faceByOrder,
    anchorOrder,
  ]);

  // 현재 spread 2장은 화면에 있으니 eager, 다음 spread 2장만 이 슬롯에서 미리 받는다(§5.1).
  // 나머지 페이지는 DOM에 넣지 않는다 — 슬롯이 0×0이라도 뷰포트 '안'이라 브라우저가
  // loading="lazy"를 지연시키지 않고, 전 페이지를 넣으면 16장이 통째로 첫 페인트에 실린다.
  const preloadFaces = useMemo(() => {
    if (status !== "ready") return [] as Face[];
    const visible = new Set(
      [frame.left, frame.right, frame.leaf?.front, frame.leaf?.back]
        .filter(
          (face): face is Face => Boolean(face) && face?.kind === FACE_PAGE,
        )
        .map((face) => face.order),
    );
    const nextView = views[viewIndex + 1];
    let wanted: number[];
    if (isSpread) {
      wanted = nextView
        ? [nextView.left, nextView.right]
            .filter((f) => f.kind === FACE_PAGE)
            .map((f) => f.order as number)
        : [];
    } else {
      wanted = [anchorOrder + 1];
    }

    const out: Face[] = [];
    for (const order of wanted) {
      if (visible.has(order)) continue;
      const face = faceByOrder.get(order);
      // 결번·구조적 부재는 받을 것이 없고, image_url은 default ''라 빈 값이 실재한다
      // (sql/47_premium_book.sql:43) — 그대로 넘기면 <img src="">가 나간다.
      if (!face || face.kind !== FACE_PAGE || !face.page?.image_url) continue;
      out.push(face);
    }
    return out;
  }, [status, frame, views, viewIndex, faceByOrder, isSpread, anchorOrder]);

  const statusLabel = useMemo(() => {
    if (status !== "ready") return "";
    const orders = isSpread
      ? [currentView?.left, currentView?.right]
          .filter(
            (face): face is Face => Boolean(face) && face?.kind !== FACE_VOID,
          )
          .map((face) => face.order)
      : [anchorOrder];
    if (orders.length === 0) return `${lastOrder} 페이지`;
    return `${orders.join("-")} / ${lastOrder} 페이지`;
  }, [status, isSpread, currentView, anchorOrder, lastOrder]);

  const stageClass = [
    "pbv-stage",
    isSpread ? "pbv-stage--spread" : "pbv-stage--single",
    !isSpread && flip ? `pbv-stage--leaving-${flip.dir}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const arrowClass =
    "pbv-arrow flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3] text-white shadow-[0_0.167rem_0.5rem_rgba(0,0,0,0.10)] transition hover:bg-[#cfcfcf] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    // relative + z-10: .pbv-stage가 더 이상 넘김 잎을 클리핑하지 않으므로(book-viewer.css
    // .pbv-stage 주석), 뷰포트를 넘는 잎이 뒤에 오는 상담 섹션(정적 배치) 아래로 숨지 않게
    // 이 섹션에 로컬 스태킹 컨텍스트를 만든다. Header.jsx:508 fixed 헤더가 z-50이라
    // 그보다 낮은 z-10을 써서 헤더 위로는 절대 올라가지 않는다.
    <section className="relative z-10 mx-auto flex max-w-content justify-center px-6 pb-16">
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset은 브라우저 기본 border/padding/margin이 있어 리셋 없이 바꾸면 시각 회귀가 생긴다. role="group" + aria-label로 이미 접근성 요건은 충족한다. */}
      <div
        className="pbv-viewport"
        style={
          {
            "--pbv-flip-ms": `${FLIP_MS}ms`,
            "--pbv-single-ms": `${SINGLE_MS}ms`,
          } as CSSProperties
        }
        role="group"
        aria-label="프리미엄 안내 책자"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: onKeyDown으로 페이지 넘김을 키보드로 조작하기 위해 포커스 가능해야 한다.
        tabIndex={0}
        onKeyDown={handleKeyDown}
        // 스와이프는 stage가 아니라 이 층에서 받는다. 1페이지 모드의 화살표는 stage 위에
        // 겹쳐 있지만 DOM 형제라, stage에 걸면 화살표에서 시작한 스와이프가 통째로 사라진다.
        // 버튼 탭은 dx≈0이라 handlePointerUp이 먼저 빠져나가므로 onClick과 겹치지 않는다.
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerRef.current = null;
        }}
      >
        <button
          type="button"
          disabled={status !== "ready" || !hasPrev}
          onClick={() => step("prev")}
          aria-label="이전 페이지"
          className={`${arrowClass} pbv-arrow--prev`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className={stageClass}>
          {status === "ready" ? (
            <>
              <div className="pbv-spread">
                <div className="pbv-page pbv-page--left">
                  <FaceContent
                    face={frame.left}
                    failed={
                      frame.left
                        ? failedOrders.has(frame.left.order as number)
                        : false
                    }
                    onFail={handleImageError}
                    eager
                  />
                </div>
                <div className="pbv-page pbv-page--right">
                  <FaceContent
                    face={frame.right}
                    failed={
                      frame.right
                        ? failedOrders.has(frame.right.order as number)
                        : false
                    }
                    onFail={handleImageError}
                    eager
                  />
                </div>

                {frame.leaf ? (
                  // 전환 중에만 존재하는 잎. 최종 상태는 정지 면과 상태 안내가 전달하므로
                  // 스크린리더에서는 숨긴다.
                  <div
                    className={[
                      "pbv-flipper",
                      `pbv-flipper--${flip?.dir}`,
                      flip?.phase === "armed" ? "pbv-flipper--armed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      {
                        "--pbv-flip": flip?.phase === "running" ? "1" : "0",
                      } as CSSProperties
                    }
                    aria-hidden="true"
                    onTransitionEnd={(event) => {
                      if (
                        event.propertyName === "transform" &&
                        event.target === event.currentTarget
                      ) {
                        commitFlip();
                      }
                    }}
                  >
                    <div className="pbv-face pbv-face--front">
                      <FaceContent
                        face={frame.leaf.front}
                        failed={
                          frame.leaf.front
                            ? failedOrders.has(frame.leaf.front.order as number)
                            : false
                        }
                        onFail={handleImageError}
                        eager
                        hidden
                      />
                    </div>
                    <div className="pbv-face pbv-face--back">
                      <FaceContent
                        face={frame.leaf.back}
                        failed={
                          frame.leaf.back
                            ? failedOrders.has(frame.leaf.back.order as number)
                            : false
                        }
                        onFail={handleImageError}
                        eager
                        hidden
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* 명세 §5.1 트리의 오버레이 4종. 종이 텍스처·바닥 그림자는 §7 1-8(Figma 에셋)
                  대기라 지금은 빈 슬롯이다 — 트리와 DOM을 1:1로 유지해 누락과 구분한다. */}
              <div className="pbv-overlays" aria-hidden="true">
                <div className="pbv-paper-texture" />
                <div className="pbv-gutter-shadow" />
                <div className="pbv-edge-highlight" />
                <div className="pbv-floor-shadow" />
              </div>

              <div className="pbv-preload" aria-hidden="true">
                {preloadFaces.map((face) => (
                  <img
                    key={face.order}
                    src={face.page?.image_url}
                    alt=""
                    loading="eager"
                    decoding="async"
                    // 여기서 실패를 잡아두면 그 페이지로 넘어가기 전에 플레이스홀더가 확정된다.
                    onError={() =>
                      handleImageError(
                        face.order as number,
                        face.page?.image_url ?? "",
                      )
                    }
                  />
                ))}
              </div>
            </>
          ) : (
            // loading / error / empty 전부 stage 안에서 그린다 — stage가 aspect-ratio로
            // 높이를 잡고 있으므로 상태가 바뀌어도 아래 상담 섹션이 밀리지 않는다(CLS 0, §5.1).
            <div className="pbv-state" role="status">
              {status === "loading" ? (
                <p className="text-base font-semibold text-ink">
                  안내 책자를 불러오는 중입니다.
                </p>
              ) : null}
              {status === "error" ? (
                <>
                  <p className="text-base font-semibold text-red-600">
                    안내 책자를 불러오지 못했습니다.
                  </p>
                  <p className="text-sm font-medium text-red-400">
                    잠시 후 다시 시도해 주세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => onRetry?.()}
                    className="mt-2 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                  >
                    다시 시도
                  </button>
                </>
              ) : null}
              {status === "empty" ? (
                <p className="text-base font-semibold text-ink">
                  안내 책자를 준비 중입니다.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={status !== "ready" || !hasNext}
          onClick={() => step("next")}
          aria-label="다음 페이지"
          className={`${arrowClass} pbv-arrow--next`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <p className="sr-only" role="status" aria-live="polite">
          {statusLabel}
        </p>
      </div>
    </section>
  );
}
