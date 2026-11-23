import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CandidateRow, LinkType, RecordLink } from "@/lib/selfeval/types";
import LinkNoteForm from "./LinkNoteForm";
import { layoutLinkMap, orderPair } from "./linkMapLogic";

// 연계 지도(명세 No.185, 186, 193, 194). 선택한 기록을 과목별 열, 제출일 순 행에 놓고 연계 선을 긋는다.
// 저장된 연계에서만 그리므로 선택을 바꾸면 모델 호출 없이 다시 그린다. 380px 폭에서는 카드 안에서 가로로 민다.
// 좌표 한 칸은 1rem 이다(svg 폭을 rem 으로 주고 viewBox 를 같은 수로 둔다).

const COL_W = 11;
const ROW_H = 5;
const NODE_W = 9.5;
const NODE_H = 3.25;
const HEAD_H = 2;
const PAD = 0.75;

type Props = {
  rows: readonly CandidateRow[];
  links: readonly RecordLink[];
  busy: boolean;
  onDelete: (fromId: string, toId: string) => void;
  onConfirm: (fromId: string, toId: string) => void;
  onAdd: (input: {
    fromId: string;
    toId: string;
    type: LinkType;
    note: string;
  }) => void;
};

const SELECT =
  "h-9 rounded-lg border border-line/60 bg-white px-2 text-app-label text-ink";

export default function LinkMap({
  rows,
  links,
  busy,
  onDelete,
  onConfirm,
  onAdd,
}: Props) {
  const map = layoutLinkMap(rows, links);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const titleOf = (id: string) => {
    const n = map.nodes.find((x) => x.id === id);
    return n === undefined ? id : (n.title ?? n.label);
  };
  const nodeOf = (id: string) => map.nodes.find((n) => n.id === id);
  const width = map.columns.length * COL_W + PAD * 2;
  const height = HEAD_H + map.nodes.length * ROW_H + PAD;
  const center = (id: string) => {
    const n = nodeOf(id);
    return n
      ? {
          x: PAD + n.col * COL_W + NODE_W / 2,
          y: HEAD_H + n.row * ROW_H + NODE_H / 2,
        }
      : { x: 0, y: 0 };
  };

  return (
    <section
      aria-label="연계 지도"
      className="rounded-xl border border-line/60 bg-white px-5 py-4"
    >
      <h2 className="text-app-card-title font-bold text-ink-strong">
        연계 지도
      </h2>
      <p className="mt-1 text-app-label text-ink-sub">
        고른 기록이 서로 어떻게 이어지는지 보여 줘요. 지운 선은 다시 쓰지
        않아요.
      </p>
      <div className="mt-3 overflow-x-auto">
        <div
          className="relative"
          style={{ width: `${width}rem`, height: `${height}rem` }}
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0"
            width={`${width}rem`}
            height={`${height}rem`}
            viewBox={`0 0 ${width} ${height}`}
          >
            {map.edges.map((e) => {
              const p = center(e.fromId);
              const q = center(e.toId);
              return (
                <g key={`${e.fromId}:${e.toId}`}>
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke="currentColor"
                    className="text-primary"
                    strokeWidth={0.125}
                    strokeDasharray={e.needsConfirm ? "0.4 0.3" : undefined}
                  />
                  <text
                    x={(p.x + q.x) / 2}
                    y={(p.y + q.y) / 2}
                    textAnchor="middle"
                    fontSize={0.6875}
                    className="fill-ink-strong"
                  >
                    {`${e.typeLabel}, ${e.strengthLabel}`}
                  </text>
                </g>
              );
            })}
          </svg>
          {map.columns.map((c, i) => (
            <p
              key={c.label}
              className="absolute text-app-caption font-semibold text-ink-sub"
              style={{ left: `${PAD + i * COL_W}rem`, top: 0 }}
            >
              {c.label}
            </p>
          ))}
          {map.nodes.map((n) => (
            <p
              key={n.id}
              className="absolute overflow-hidden rounded-lg border border-line/60 bg-surface-04 px-2 py-1 text-app-caption text-ink-strong"
              style={{
                left: `${PAD + n.col * COL_W}rem`,
                top: `${HEAD_H + n.row * ROW_H}rem`,
                width: `${NODE_W}rem`,
                height: `${NODE_H}rem`,
              }}
            >
              {n.title}
            </p>
          ))}
        </div>
      </div>

      {map.edges.length === 0 ? (
        <p className="mt-3 text-app-label text-ink-sub">이어진 선이 없어요</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {map.edges.map((e) => (
            <li
              key={`${e.fromId}:${e.toId}`}
              aria-label={`${titleOf(e.fromId)}과 ${titleOf(e.toId)}`}
              className="rounded-lg bg-surface-04 px-3 py-2"
            >
              <p className="text-app-label text-ink-strong">
                {titleOf(e.fromId)} 와 {titleOf(e.toId)}
              </p>
              <p className="text-app-caption text-ink-sub">
                {`${e.typeLabel}, ${e.strengthLabel}`}
              </p>
              {e.note && (
                <p className="text-app-caption text-ink-sub">{e.note}</p>
              )}
              {e.needsConfirm && (
                <p className="mt-1 text-app-caption text-ink-sub">
                  확인하기 전에는 연결 문장 없이 참고 항목으로만 써요
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {e.needsConfirm && (
                  <Button
                    type="button"
                    size="lg"
                    className="h-8 px-3 text-app-caption"
                    disabled={busy}
                    onClick={() => onConfirm(e.fromId, e.toId)}
                  >
                    실제로 이어서 했어요
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-8 px-3 text-app-caption"
                  disabled={busy}
                  onClick={() => onDelete(e.fromId, e.toId)}
                >
                  선 지우기
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {map.nodes.length >= 2 && (
        <fieldset
          aria-label="새 선 긋기"
          className="mt-4 flex flex-col gap-2 border-t border-line/60 pt-3"
        >
          <p className="text-app-label font-semibold text-ink-strong">
            새 선 긋기
          </p>
          <LinkNoteForm
            submitLabel="선 긋기"
            busy={busy}
            disabled={a === "" || b === "" || a === b}
            onSubmit={(input) => onAdd({ ...orderPair(rows, a, b), ...input })}
          >
            {(
              [
                ["앞 기록", a, setA],
                ["뒤 기록", b, setB],
              ] as const
            ).map(([label, value, set]) => (
              <label
                key={label}
                className="flex flex-col gap-1 text-app-caption text-ink-sub"
              >
                {label}
                <select
                  className={SELECT}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                >
                  <option value="">기록 고르기</option>
                  {map.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title ?? n.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </LinkNoteForm>
        </fieldset>
      )}
    </section>
  );
}
