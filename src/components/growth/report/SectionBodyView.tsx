import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableBody as UiTableBody,
} from "@/components/ui/table";
import {
  NO_DATA_TEXT,
  SMALL_SAMPLE_TEXT,
  UNREACHABLE_TEXT,
} from "./reportLogic";
import type { BodyView } from "./sectionBody";

const NOTE = "mt-3 text-app-label text-ink-sub";

function Note({ text }: { text: string | null }) {
  return text ? <p className={NOTE}>{text}</p> : null;
}

function Bars({ bars }: { bars: { label: string; value: number }[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div role="img" aria-label="막대그래프" className="flex flex-col gap-2">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-app-label text-ink-sub">
            {b.label}
          </span>
          <div className="h-3 flex-1 rounded-full bg-surface-04">
            <div
              className="h-3 rounded-full bg-ink-strong"
              style={{ width: `${(b.value / max) * 100}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-app-label text-ink-strong">
            {b.value}건
          </span>
        </div>
      ))}
    </div>
  );
}

const W = 480;
const H = 160;
const PAD = 24;

function Curve({ body }: { body: Extract<BodyView, { kind: "curve" }> }) {
  const { points, maxGrade } = body;
  // 위가 1등급: 등급이 작을수록 위로 간다.
  const y = (grade: number) =>
    PAD + ((grade - 1) / (maxGrade - 1)) * (H - PAD * 2);
  const x = (i: number) =>
    points.length === 1
      ? W / 2
      : PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.average)}`)
    .join(" ");
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="학기별 평균 등급 선그래프, 위쪽이 1등급"
        className="h-auto w-full max-w-[30rem]"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-ink-strong"
        />
        {points.map((p, i) => (
          <g key={p.key}>
            <circle
              cx={x(i)}
              cy={y(p.average)}
              r={4}
              className="fill-ink-strong"
            />
            <text
              x={x(i)}
              y={H - 4}
              textAnchor="middle"
              fontSize={11}
              className="fill-ink-sub"
            >
              {p.key}
            </text>
          </g>
        ))}
      </svg>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-app-label">
        {body.actual !== null && (
          <div className="flex gap-1.5">
            <dt className="text-ink-sub">실제 평균</dt>
            <dd className="font-semibold text-ink-strong">{body.actual}</dd>
          </div>
        )}
        {body.estimate !== null && (
          <div className="flex gap-1.5">
            <dt className="text-ink-sub">추정</dt>
            <dd className="font-semibold text-ink-strong">{body.estimate}</dd>
          </div>
        )}
        {body.verdictLabel && (
          <div className="flex gap-1.5">
            <dt className="text-ink-sub">판정</dt>
            <dd className="font-semibold text-ink-strong">
              {body.verdictLabel}
            </dd>
          </div>
        )}
      </dl>
      <Note text={body.thresholdText} />
    </div>
  );
}

export default function SectionBodyView({ body }: { body: BodyView }) {
  switch (body.kind) {
    case "empty":
      return (
        <div>
          <p className="text-app-body font-semibold text-ink-sub">
            {NO_DATA_TEXT}
          </p>
          <Note text={body.reason} />
        </div>
      );
    case "prose":
      return (
        <div className="flex flex-col gap-3">
          {body.paragraphs.map((p) => (
            <p key={p} className="text-app-body text-ink-strong">
              {p}
            </p>
          ))}
          <Note text={body.note} />
        </div>
      );
    case "list":
      return (
        <ul className="flex list-disc flex-col gap-2 pl-5 text-app-body text-ink-strong">
          {body.items.map((it) => (
            <li key={it.text}>
              {it.text}
              {it.evidenceCount > 0 && (
                <span className="ml-2 text-app-caption text-ink-sub">
                  근거 {it.evidenceCount}건
                </span>
              )}
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div>
          {body.unreachable && (
            <p
              role="note"
              className="mb-3 rounded-lg bg-surface-04 p-3 text-app-label font-semibold text-ink-strong"
            >
              {UNREACHABLE_TEXT}
            </p>
          )}
          <Table>
            {body.columns && (
              <TableHeader>
                <TableRow>
                  {body.columns.map((c) => (
                    <TableHead key={c} className="text-app-label">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
            )}
            <UiTableBody>
              {body.rows.map((r) => (
                <TableRow key={r.join("|")}>
                  {r.map((c, i) => (
                    <TableCell
                      // biome-ignore lint/suspicious/noArrayIndexKey: 열 위치가 곧 식별자다
                      key={i}
                      className={`whitespace-normal text-app-body ${
                        !body.columns && i === 0
                          ? "w-40 text-ink-sub"
                          : "text-ink-strong"
                      }`}
                    >
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </UiTableBody>
          </Table>
          <Note text={body.note} />
        </div>
      );
    case "bars":
      return <Bars bars={body.bars} />;
    case "curve":
      return <Curve body={body} />;
    case "activityMap":
      return (
        <ol className="flex gap-4 overflow-x-auto pb-2">
          {body.semesters.map((s) => (
            <li
              key={s.label}
              className="min-w-40 flex-1 rounded-lg border border-border p-3"
            >
              <p className="mb-2 text-app-label font-semibold text-ink-strong">
                {s.label}
              </p>
              <ul className="flex flex-col gap-1.5">
                {s.nodes.map((n) => (
                  <li key={n.id} className="text-app-caption text-ink-sub">
                    {n.subjectGroup ? `${n.subjectGroup}, ` : ""}
                    {n.topic}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      );
    case "direction":
      return (
        <div>
          <p className="text-app-title font-bold text-ink-strong">
            {body.percent}%
            {body.verdictLabel && (
              <span className="ml-3 text-app-card-title font-semibold">
                {body.verdictLabel}
              </span>
            )}
          </p>
          {body.formula && (
            <p className="mt-1 text-app-label text-ink-sub">{body.formula}</p>
          )}
          <Note text={body.criteria} />
          {body.smallSample && <Note text={SMALL_SAMPLE_TEXT} />}
        </div>
      );
    case "growthFlow":
      return (
        <div>
          <p className="mb-3 text-app-body font-semibold text-ink-strong">
            {body.theme}
          </p>
          <ul className="grid grid-cols-3 gap-3">
            {body.subthemes.map((s) => (
              <li key={s.grade} className="rounded-lg border border-border p-3">
                <p className="text-app-label font-semibold text-ink-strong">
                  {s.grade} {s.stageLabel}
                </p>
                <p className="mt-1 text-app-label text-ink-sub">{s.text}</p>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}
