import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_FONT_SIZE } from "@/components/charts/chartTheme";
import GoalCard from "@/components/goal/GoalCard";

// "학업 성취도 변화 추이" 카드(1076×408 = 67.25rem×25.5rem) — 4012:22399 정본(재조사,
// docs/figma-goal/resurvey/4012-22399-목표관리-대시보드.md §학업 성취도 변화 추이).
// 국/수/영 3계열 막대 시안(#15/#20, 예전 part-05)은 폐기됐다 — 그 시안은 회차별 과목
// 백분위 추이였지만 실제 데이터 소스(goal_probability_logs)는 과목이 아니라 "이상/최소
// 목표대학 수시/정시 합격확률" 4계열 시계열이라 데이터 모양 자체가 다르다.
//
// 계열: 이상_수시 · 이상_정시 · 최소_수시 · 최소_정시 (goal_probability_logs
// ideal_susi/ideal_jungsi/min_susi/min_jungsi, api/_routes/goal/student.js가
// probabilityHistory 배열로 내려준다 — 오래된 순).
//
// Y축 0~100(눈금 0/25/50/75/100, 시안 실측), X축은 기록 시각("11/21 9:40" 포맷).
// 호버 툴팁은 시각 + 4계열 % 값을 보여준다(시안: "05/02 10:15 기록" + 계열별 "XX.X%").
//
// 색: 과목 팔레트(subjectTokens)와 무관한 별도 4색 — 이 차트는 과목이 아니라 확률
// 계열이라 과목 색을 재사용하면 의미가 어긋난다(임무 지시). 기존 우측 레일
// TargetUniversityRail의 수시=파랑/정시=초록 색 정체성을 그대로 이어받아, 각 계열 안에서
// 이상(진하게)·최소(연하게)로 톤만 가른다 — 수시 파랑 계열(이상 진한 파랑/최소 연한 파랑),
// 정시 초록 계열(이상 진한 초록/최소 연한 초록).
const SERIES = [
  { key: "idealSusi", label: "이상_수시", color: "#1D63B3" },
  { key: "idealJungsi", label: "이상_정시", color: "#2E8B57" },
  { key: "minSusi", label: "최소_수시", color: "#5AA6F0" },
  { key: "minJungsi", label: "최소_정시", color: "#6FC98A" },
];

const Y_TICKS = [0, 25, 50, 75, 100];

// X축·툴팁 공용 시각 라벨 — "11/21 9:40"(월/일 시:분, 시안 실측 그대로 시는 0패딩 없음).
function formatTimeLabel(isoString: string) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// 계열별 % 표시 — 소수 1자리(시안 툴팁 실측 "20.0%").
function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

// goal_probability_logs 이력 1건 — api/_routes/goal/student.js probabilityHistory 원소.
type AchievementPoint = {
  recordedAt: string;
  idealSusi?: number | null;
  idealJungsi?: number | null;
  minSusi?: number | null;
  minJungsi?: number | null;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
};

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-md px-3 py-2 text-app-caption leading-normal"
      style={{
        backgroundColor: CHART_COLORS.tooltipBg,
        color: CHART_COLORS.tooltipText,
      }}
    >
      <p className="font-semibold">{label} 기록</p>
      {SERIES.map((series) => {
        const point = payload.find((entry) => entry.dataKey === series.key);
        if (!point || point.value == null) return null;
        return (
          <p key={series.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.label} {formatPercent(point.value)}
          </p>
        );
      })}
    </div>
  );
}

type AchievementChartProps = {
  data?: AchievementPoint[] | null;
};

export default function AchievementChart({ data }: AchievementChartProps) {
  const history = Array.isArray(data) ? data : [];
  // QA 행327 — 온보딩 직후엔 goal_probability_logs 스냅샷이 1건뿐이라 추세선을 그릴 순
  // 없지만(비교 대상 없음), 그렇다고 빈 상태로 접으면 "확률이 아예 안 잡혔다"처럼 보인다.
  // 1건이어도 그 시점의 초기값은 실데이터이니 점 하나로라도 보여준다(Recharts는 Line에
  // 데이터가 1개면 연결선 없이 dot만 그린다 — 그 자체로 "초기값" 렌더가 자연스럽다).
  // 0건(기록 자체가 없음)일 때만 빈 상태 문구로 접는다.
  const hasData = history.length >= 1;

  // 정시 rate가 없는 학생(jungsiAvailable=false)은 idealJungsi/minJungsi가 전 구간 null이다.
  // 그런 계열을 범례·라인에 그대로 두면 "값이 0"처럼 보이므로, 전 구간 null인 계열은
  // 통째로 숨긴다(연결선/범례 모두 미노출) — 값이 간헐적으로만 비는 경우는
  // connectNulls로 이어 그린다(중간 결측 1건 때문에 계열 전체를 숨기지 않는다).
  const visibleSeries = hasData
    ? SERIES.filter((series) =>
        history.some((point) => point[series.key] != null),
      )
    : [];

  const chartData = hasData
    ? history.map((point) => ({
        ...point,
        label: formatTimeLabel(point.recordedAt),
      }))
    : [];

  return (
    <GoalCard
      tone="neutral"
      className="flex h-102 w-full flex-col gap-4 px-8 py-7"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-app-card-title font-bold text-ink-strong">
          학업 성취도 변화 추이
        </h3>
        {hasData && (
          <ul className="flex items-center gap-5">
            {visibleSeries.map((series) => (
              <li
                key={series.key}
                className="flex items-center gap-2 text-app-label text-ink"
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: series.color }}
                />
                {series.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasData ? (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke={CHART_COLORS.grid}
                strokeWidth={1}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: CHART_COLORS.label, fontSize: CHART_FONT_SIZE }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={Y_TICKS}
                axisLine={false}
                tickLine={false}
                width={32}
                tick={{ fill: CHART_COLORS.label, fontSize: CHART_FONT_SIZE }}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }}
              />
              {visibleSeries.map((series) => (
                <Line
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: series.color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-app-body leading-[1.4] text-ink-sub">
          기록이 쌓이면 추이가 표시됩니다.
        </div>
      )}
    </GoalCard>
  );
}
