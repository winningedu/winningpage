// Seven-axis radar for the 7-stage scores (22 r19, r50). Pure SVG like
// RadarChart6; viewBox coordinates are SVG-internal, so px-free numbers here
// scale with the rem-sized box.
import { REPORT_LABELS } from "./labels";
import { joinCopyLines } from "./lineBreak";

const CX = 200;
const CY = 190;
const R_MAX = 120;
const R_LABEL = R_MAX + 30;
const SCORE_MAX = 100;
const RINGS = [0.25, 0.5, 0.75, 1];

type RadarAxis = {
  readonly label: string;
  readonly score: number;
  /** 22 r50: under-45 break mark, set by the payload (Page4 stages) */
  readonly broken?: boolean;
};

type RadarChart7Props = {
  axes: readonly RadarAxis[];
  /** 22 r19 dashed target line (Page1 radar.target) */
  target?: number;
};

function point(index: number, count: number, radius: number) {
  const angle = ((-90 + (360 / count) * index) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
}

function ring(count: number, radius: number) {
  return Array.from({ length: count }, (_, index) => {
    const { x, y } = point(index, count, radius);
    return `${x},${y}`;
  }).join(" ");
}

export default function RadarChart7({ axes, target }: RadarChart7Props) {
  const count = axes.length;
  const dataPoints = axes
    .map((axis, index) => {
      const { x, y } = point(index, count, (axis.score / SCORE_MAX) * R_MAX);
      return `${x},${y}`;
    })
    .join(" ");
  const accessibleName = axes
    .map((axis) =>
      axis.broken
        ? `${joinCopyLines(axis.label)} ${axis.score} ${REPORT_LABELS.broken}`
        : `${joinCopyLines(axis.label)} ${axis.score}`,
    )
    .join(", ");

  return (
    <svg
      viewBox="0 0 400 380"
      role="img"
      aria-label={accessibleName}
      className="h-auto w-full max-w-100"
    >
      {RINGS.map((ratio) => (
        <polygon
          key={ratio}
          points={ring(count, R_MAX * ratio)}
          fill="none"
          stroke="#e3e6ee"
          strokeWidth="1"
        />
      ))}
      {target !== undefined && (
        <polygon
          data-target-ring
          points={ring(count, (target / SCORE_MAX) * R_MAX)}
          fill="none"
          stroke="#8a90a6"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
      )}
      <polygon
        points={dataPoints}
        fill="#0b2a5b"
        fillOpacity="0.08"
        stroke="#0b2a5b"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {axes.map((axis, index) => {
        const dot = point(index, count, (axis.score / SCORE_MAX) * R_MAX);
        const label = point(index, count, R_LABEL);
        const color = axis.broken ? "#991e1e" : "#0b2a5b";
        return (
          <g
            key={axis.label}
            data-axis={axis.label}
            data-broken={axis.broken ? "true" : undefined}
          >
            <circle cx={dot.x} cy={dot.y} r="4" fill={color} />
            {/* spec row 61: red dashed ring and the 「여기서 끊김」 label under 45 */}
            {axis.broken && (
              <circle
                data-break-marker
                cx={dot.x}
                cy={dot.y}
                r="10"
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}
            <text x={label.x} y={label.y} textAnchor="middle" fontSize="13">
              <tspan x={label.x} fill={axis.broken ? color : "#6b6b6b"}>
                {joinCopyLines(axis.label)}
              </tspan>
              <tspan x={label.x} dy="16" fontWeight="700" fill={color}>
                {axis.score}
              </tspan>
              {axis.broken && (
                <tspan x={label.x} dy="15" fontSize="11" fill={color}>
                  {REPORT_LABELS.broken}
                </tspan>
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
