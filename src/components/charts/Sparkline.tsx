// 연도별 등급 추이 스파크라인 — Recharts 기반.
//
// docs/chart-library-decision.md(2026-08-06)는 원래 인라인 SVG를 결정했으나, 팀 리더가
// "앞으로 다른 화면에도 차트를 만들 예정"을 확정하면서 재사용 가능한 차트 기반이 필요해져
// Recharts(3.10.1)로 이관했다. prop 계약은 이관 이전과 동일하게 유지한다 — 호출부는 손대지 않는다.
//
// ⚠ 현재 연도 축은 2025·2026 2개년이라 이 컴포넌트는 화면에서 쓰이지 않는다.
// 2점은 추세(trend)가 아니라 변화(change)이고, 아래 gradeDomain 최소 스팬 1.0 규칙이
// 0.05 차이도 칸 전체로 벌려 없는 추세를 지어낸다(명세 §8.3). 2개년 화면은
// components/charts/GradeDelta.jsx(슬로프 + Δ 배지)가 대신한다. 축이 3개년 이상으로
// 복원되면 DetailView가 다시 이쪽으로 분기하므로 파일은 그대로 둔다(삭제 금지).
//
// 데이터 계약: series 생성 책임은 src/lib/admissionResults.js(buildTrackSeries)에 있다.
// 이 컴포넌트는 그리기만 한다.
//   series: { year: number, value: number|null, displayValue: string }[]
//   label?: string  — aria 요약 문장 앞에 붙는 계열 이름
//
// 의도적으로 지키는 동작 (인라인 SVG 시절과 동일. 깨뜨리지 말 것):
//   1. 결측 연도를 건너뛰어 잇지 않는다 — Line 기본값 connectNulls=false에 의존하되 명시한다.
//      결측 연도가 중간에 끼면 선이 그 구간에서 끊긴다 — 없는 값을 이어 그리는 것보다 낫다.
//   2. x축은 series 전체 길이 기준 고정 카테고리축 — 결측이어도 칸을 유지한다(value: null도 데이터에 포함).
//   3. y축 반전 — 등급은 1이 최상이므로 작은 값이 위(YAxis reversed).
//   4. gradeDomain() 4중 규칙(±0.4 여백 / 0.5 스냅 / [1,9] 클램프 / 최소 스팬 1.0) — YAxis domain에 직접 주입.
//      auto-domain에 맡기지 않는다 — 모든 연도 값이 같으면 스팬 0이 되어 없는 추세가 생긴다.
//   5. 연도가 3개 미만이거나 값 있는 점이 1개 이하면 렌더 자체를 하지 않는다.
//   6. 결측 연도 라벨은 지우지 않고 흐리게만 둔다 — XAxis 커스텀 tick.
//   7. 접근성 — 바깥 wrapper가 role="img" + 한국어 요약 aria-label 하나만 노출한다.
//      Recharts 자체 accessibilityLayer(키보드 포커스 레이어)는 끈다(중복 노출 방지).
//   8. 폭 유동 — ResponsiveContainer. "부모 높이 0이면 차트가 사라지는" 함정을 피하려고
//      JS 높이 지정 대신 CSS aspect-ratio로 높이를 폭에서 직접 유도한다.
//   9. 호버 말풍선 — HTML Tooltip이 아니라 activeDot 안에서 점 좌표(cx,cy) 기준 SVG로 직접
//      그린다(커서 위치와 무관하게 점 좌표에 고정). 시안(Figma node 1882:2958) 실측대로 박스+
//      꼬리를 단일 union path 하나로 그린다 — rect+polygon 두 도형으로 나누면 접합부에 틈/겹침이
//      생긴다. 정확한 치수·좌표는 BALLOON 상수와 SparkActiveDot 주석에만 두고 여기서 중복
//      서술하지 않는다(중복 서술은 좌표가 바뀔 때 한쪽만 고쳐져 거짓 주석이 되기 쉽다).
//  10. 말풍선 뒤집기 — 기본은 점 위에 그리되 최상단 점처럼 위쪽 공간이 모자라면(boxTop이
//      SVG 상단 밖으로 나가면) 점 아래로 뒤집는다. margin.top을 "호버 때만 필요한 말풍선
//      전체 높이"만큼 상시 레이아웃에 청구하지 않기 위해서다(SparkActiveDot 참고).
//      X_PADDING은 첫/마지막 연도에서 박스 좌우가 카드 경계에서 잘리지 않을 여백이라
//      margin.top과 성격이 다르다 — 따로 줄이지 않는다.

import { useEffect, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_COLORS, CHART_FONT_SIZE } from "./chartTheme";

// buildTrackSeries()가 만드는 연도별 점 하나.
type SparkPoint = {
  year: number;
  value: number | null;
  displayValue: string;
};

// viewBox 시절과 같은 종횡비(400:112)를 유지해 시각 크기가 크게 달라지지 않게 한다.
// 이 면적은 3개년 이상 꺾은선 기준이다 — 2점짜리 그림에 쓰면 데이터-잉크 비율이 최악이라
// 2개년 축에서는 아예 이 컴포넌트를 부르지 않는다(파일 상단 주석 참고).
const ASPECT_CLASS = "aspect-400/112";

// 축 최소 길이 가드. 2개년(=2점)은 GradeDelta 몫이라 여기서는 그리지 않는다.
const MIN_SERIES_YEARS = 3;

// margin.top은 말풍선이 "뒤집히지 않는" 일반적인 경우를 위한 최소 여유(상단 그리드선/
// tick 자리)만 남긴다. 최상단 점 근처는 SparkActiveDot이 스스로 감지해 점 아래로 뒤집으므로
// 말풍선 전체 높이를 상시 청구할 필요가 없다(§10). X_PADDING은 박스 반폭(BALLOON.width/2)
// 보다 넉넉히 잡아 첫/마지막 연도에서도 좌우가 남게 한다. bottom은 연도 라벨 한 줄 자리.
const CHART_MARGIN = { top: 8, right: 22, bottom: 4, left: 4 };
const X_PADDING = { left: 20, right: 20 };
const Y_AXIS_WIDTH = 26;

const DOT_RADIUS = 6;

// 말풍선 텍스트는 시안 실측값(테마 결정이 아니다)이라 chartTheme.js 공용 토큰에 넣지 않고
// 이 컴포넌트 안에 리터럴로만 둔다. em 단위라 폰트 크기가 바뀌어도 letter-spacing이 따라간다.
const BALLOON_FONT_SIZE = 12;
const BALLOON_LETTER_SPACING = "-0.04em";

// 시안(Figma node 1882:2958)은 3글자("2.7") 기준으로 폭 32를 그렸지만, 실데이터
// displayValue는 formatGradeValue()가 항상 toFixed(2)로 만들어 4글자("2.24")로 고정이다
// (src/lib/admissionResults.js). 그래서 폭은 시안의 32가 아니라 "N.NN"(1.00~9.99) 전수의
// 실측 최대 텍스트폭(12px/weight 600/letter-spacing -0.04em 기준 "4.44" ≈ 24.34)에 시안의
// 좌우 패딩 비율(7.5×2=15, 원본 (32-17)/2에서 유도)을 더해 40으로 고정했다 — 반올림 여유
// 포함. 데이터 포맷이 고정폭이라 런타임 측정/가변폭 로직은 만들지 않는다(YAGNI).
const BALLOON = {
  width: 40,
  height: 20, // 텍스트 상하 여백 1px씩 확보(원래 18) — 세로가 빡빡해 보이는 문제 수정.
  tailHeight: 5, // 로컬 path 기준 박스 바닥(y20) ~ 꼬리 끝(y25)
  tailDotGap: 6, // 꼬리 끝 ↔ 점 상단(cy - DOT_RADIUS) 간격 — 시안 실측
  // 로컬 좌표계 40×25 (박스 0,0~40,20 · rx=4, 꼬리 밑변 15.8~24.2,20 · 꼬리 끝 20,25).
  // 원본 시안 path(32폭)의 x좌표만 40폭 기준으로 재계산한 것 — rx/꼬리 밑변 폭(±4.2)은 그대로.
  // 코너 베지어 제어점 오프셋(kappa·r=2.2091)은 원본과 동일 — 박스가 커진 만큼 직선 구간
  // (좌우 변, 하단 변, 꼬리)의 y좌표만 +2 했다.
  path: "M36 0C38.2091 0 40 1.7909 40 4V16C40 18.2091 38.2091 20 36 20H24.2L20 25L15.8 20H4C1.7909 20 0 18.2091 0 16V4C0 1.7909 1.7909 0 4 0H36Z",
};

// 등급 축 도메인. 등급은 1이 최상이므로 y를 반전한다(작은 값이 위).
// 시안 1882:2958이 2.7과 3.2를 같은 y에 그린 것은 오류라 재현하지 않는다(명세 §8).
function gradeDomain(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  let lo = Math.max(1, Math.floor((min - 0.4) * 2) / 2);
  let hi = Math.min(9, Math.ceil((max + 0.4) * 2) / 2);
  if (hi - lo < 1) {
    hi = Math.min(9, lo + 1);
    lo = Math.max(1, hi - 1);
  }
  return { lo, hi };
}

// 데이터 점 — 상시 표시. 결측 연도는 cx/cy가 없으므로 그리지 않는다.
function SparkDot({ cx, cy }: { cx?: number; cy?: number }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={CHART_COLORS.line} />;
}

// 호버(활성) 점 — 상시 점 위(공간이 없으면 아래)에 값 말풍선을 함께 그린다. 시안에는 외곽
// 링이 없다(있으면 꼬리 끝과 겹쳐 어긋나 보인다) — 이 컴포넌트에서 그리지 않는다.
// 말풍선을 HTML Tooltip이 아니라 이 SVG 요소 안에서 cx/cy 기준으로 직접 그려, 커서가 밴드
// 안에서 좌우로 움직여도 말풍선은 점 좌표에 구조적으로 고정된다(흔들리지 않는다).
// 박스+꼬리는 BALLOON.path 하나(검은 배경)로, 텍스트는 그 위에 흰 굵은 글씨로 얹는다.
// value가 null인 연도의 activeDot은 recharts가 이미 렌더 자체를 막으므로(ActivePoints가
// y좌표 없는 포인트를 걸러냄) 이 함수까지 value==null인 채로 호출되는 경우가 없다 — 그래서
// payload.value 가드는 두지 않는다.
function SparkActiveDot({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: SparkPoint;
}) {
  if (cx == null || cy == null || !payload) return null;

  // 기본은 점 위, 꼬리가 아래로 향하게(normalBoxTop) 그린다. 최상단 점 근처처럼 이 위치가
  // SVG 상단(y=0) 밖으로 나가면(normalBoxTop < 0) 점 아래로 뒤집는다 — 꼬리 방향만 위로
  // 바뀌고 박스는 상하 대칭이라 모양은 그대로다. scale(1,-1)로 같은 path를 재사용한다.
  const normalTailTipY = cy - DOT_RADIUS - BALLOON.tailDotGap;
  const normalBoxTop = normalTailTipY - BALLOON.tailHeight - BALLOON.height;
  const flip = normalBoxTop < 0;

  const tailTipY = flip ? cy + DOT_RADIUS + BALLOON.tailDotGap : normalTailTipY;
  const boxTop = flip ? tailTipY + BALLOON.tailHeight : normalBoxTop;
  const boxLeft = cx - BALLOON.width / 2;
  const textY = boxTop + BALLOON.height / 2;

  return (
    <g>
      <path
        d={BALLOON.path}
        transform={
          flip
            ? `translate(${boxLeft}, ${boxTop + BALLOON.height}) scale(1, -1)`
            : `translate(${boxLeft}, ${boxTop})`
        }
        fill={CHART_COLORS.tooltipBg}
      />
      <text
        x={cx}
        y={textY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={BALLOON_FONT_SIZE}
        fontWeight={600}
        letterSpacing={BALLOON_LETTER_SPACING}
        fill={CHART_COLORS.tooltipText}
      >
        {payload.displayValue}
      </text>
    </g>
  );
}

// 연도 라벨 — 결측 연도는 흐리게 두되 축에서 지우지는 않는다.
function YearTick({
  x,
  y,
  payload,
  valueByYear,
}: {
  x?: number;
  y?: number;
  payload?: { value: number };
  valueByYear: Map<number, number | null>;
}) {
  const year = payload?.value;
  const hasValue = year != null && valueByYear.get(year) != null;
  return (
    <text
      x={x}
      y={(y ?? 0) + 12}
      textAnchor="middle"
      fontSize={CHART_FONT_SIZE}
      fill={hasValue ? CHART_COLORS.label : CHART_COLORS.grid}
    >
      {String(year).slice(2)}
    </text>
  );
}

type SparklineProps = {
  series?: SparkPoint[];
  label?: string;
};

export default function Sparkline({ series, label }: SparklineProps) {
  // 훅은 Rules of Hooks 때문에 아래 조기 return보다 반드시 위에 있어야 한다 — series가
  // "값 있음 → 전부 null"로 바뀌어 리렌더되면 조기 return이 훅 호출 순서를 바꿔 React가
  // "Rendered more hooks than during the previous render"로 죽는다.
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Recharts는 마우스 호버를 mouseleave로 닫아 주지만, 터치에는 "닫아 주는" 쪽이 없다
  // (touchmove로 열리기만 하고, 손을 떼거나 스크롤하거나 다른 곳을 탭해도 저절로 안 닫힌다 —
  // recharts 소스 확인: RechartsWrapper의 onTouchEnd는 사용자 콜백만 호출할 뿐 내부 상태를
  // 지우지 않는다). 원래 인라인 SVG가 갖고 있던 "바깥 탭 시 닫힘 / 스크롤 후 잔존 방지"를
  // 여기서 보강한다. React가 mouseleave를 native mouseout(relatedTarget 기반)으로 합성하므로
  // 그 native 이벤트를 그대로 흉내 낸다.
  useEffect(() => {
    const container = wrapperRef.current;
    if (!container) return undefined;

    const dismissActive = () => {
      const chartRoot = container.querySelector(".recharts-wrapper");
      chartRoot?.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          cancelable: true,
          relatedTarget: document.body,
        }),
      );
    };

    const handleOutsideTouch = (event: TouchEvent) => {
      if (container.contains(event.target as Node)) return; // 차트 안(점 재탭 포함)은 내부 로직에 맡긴다.
      dismissActive();
    };

    document.addEventListener("touchstart", handleOutsideTouch, {
      passive: true,
    });
    window.addEventListener("scroll", dismissActive, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("touchstart", handleOutsideTouch);
      window.removeEventListener("scroll", dismissActive, { capture: true });
    };
  }, []);

  const list = series ?? [];
  const points = list.filter((point) => point.value != null);

  // 아래 조기 return들은 훅이 이미 위에서 전부 호출된 뒤라 훅 순서에 영향을 주지 않는다.
  //
  // (a) 연도 축이 3개 미만이면 그리지 않는다 — 2점을 꺾은선으로 그리면 gradeDomain 최소
  //     스팬 1.0이 미세 델타를 칸 전체로 벌려 없는 추세를 만든다(§8.3). 2개년은 GradeDelta 몫.
  // (b) 값 있는 점이 1개 이하면 선이 없는 고아 점(또는 축만 남은 빈 차트)이 된다.
  //     connectNulls=false와 겹쳐 "점 하나짜리 추이"라는 거짓 그림이 나오므로 막는다.
  if (list.length < MIN_SERIES_YEARS) return null;
  if (points.length <= 1) return null;

  const { lo, hi } = gradeDomain(points.map((point) => point.value as number));
  const summary = points
    .map((point) => `${point.year}년 ${point.displayValue}등급`)
    .join(", ");
  const valueByYear = new Map(list.map((point) => [point.year, point.value]));

  return (
    <div
      ref={wrapperRef}
      role="img"
      aria-label={`${label ?? ""} 연도별 등급 추이: ${summary}`}
      className={`${ASPECT_CLASS} w-full`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={list} margin={CHART_MARGIN} accessibilityLayer={false}>
          {/* 상/하단 가로선 — YAxis의 두 tick(lo, hi)이 곧 도메인 경계이므로 그리드가
              원래의 상단 구분선/축선 역할을 그대로 겸한다. */}
          <CartesianGrid
            horizontal
            vertical={false}
            stroke={CHART_COLORS.grid}
            strokeWidth={1}
          />

          <XAxis
            dataKey="year"
            type="category"
            axisLine={false}
            tickLine={{ stroke: CHART_COLORS.grid }}
            interval={0}
            padding={X_PADDING}
            tick={<YearTick valueByYear={valueByYear} />}
          />

          <YAxis
            type="number"
            domain={[lo, hi]}
            reversed
            ticks={[lo, hi]}
            width={Y_AXIS_WIDTH}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: CHART_FONT_SIZE, fill: CHART_COLORS.label }}
          />

          {/* HTML 말풍선은 쓰지 않는다(content가 항상 null) — 이 Tooltip은 오직 hover 상태
              (activeTooltipIndex)를 만들어 activeDot을 켜는 용도로만 남긴다. 실제 말풍선은
              SparkActiveDot이 cx/cy를 기준으로 SVG에 직접 그린다(위 주석 참고). */}
          <Tooltip
            content={() => null}
            cursor={false}
            isAnimationActive={false}
          />

          <Line
            dataKey="value"
            type="linear"
            stroke={CHART_COLORS.line}
            strokeWidth={1.5}
            strokeOpacity={0.35}
            connectNulls={false}
            isAnimationActive={false}
            dot={<SparkDot />}
            activeDot={<SparkActiveDot />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
