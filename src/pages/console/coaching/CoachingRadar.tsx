// 6축 레이더. 점수가 없는 축은 꼭짓점을 가운데에 두고 이름과 상태를 회색으로 쓴다.

import type { Axis } from "./types";

const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 100;
const RINGS = [0.25, 0.5, 0.75, 1];

function point(index: number, count: number, ratio: number) {
  // 위쪽에서 시계 방향
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * ratio,
    y: CENTER + Math.sin(angle) * RADIUS * ratio,
  };
}

const toPoints = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export function axisStatusText(axis: Axis): string {
  if (axis.status === "scored") return `${axis.score}점`;
  if (axis.status === "before_eval") return "평가 전";
  return axis.missingServices.length > 0
    ? `${axis.missingServices.join(", ")} 미이용`
    : "자료 없음";
}

export default function CoachingRadar({ axes }: { axes: Axis[] }) {
  const n = axes.length;
  const data = axes.map((a, i) =>
    point(i, n, a.status === "scored" ? (a.score as number) / 100 : 0),
  );
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="6축 종합 진단 레이더"
      className="w-full max-w-[18.75rem]"
    >
      {RINGS.map((r) => (
        <polygon
          key={r}
          points={toPoints(axes.map((_, i) => point(i, n, r)))}
          className="fill-none stroke-line"
        />
      ))}
      {axes.map((a, i) => {
        const edge = point(i, n, 1);
        return (
          <line
            key={a.key}
            x1={CENTER}
            y1={CENTER}
            x2={edge.x}
            y2={edge.y}
            className="stroke-line"
          />
        );
      })}
      <polygon
        points={toPoints(data)}
        className="fill-primary/20 stroke-primary"
      />
      {axes.map((a, i) =>
        a.status === "scored" ? (
          <circle
            key={a.key}
            cx={data[i]?.x}
            cy={data[i]?.y}
            r={3}
            className="fill-primary"
          />
        ) : null,
      )}
      {axes.map((a, i) => {
        const label = point(i, n, 1.25);
        return (
          <text
            key={a.key}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            className={
              a.status === "scored"
                ? "fill-ink-strong text-[0.6875rem] font-semibold"
                : "fill-ink-sub text-[0.6875rem]"
            }
          >
            {a.name}
          </text>
        );
      })}
    </svg>
  );
}
