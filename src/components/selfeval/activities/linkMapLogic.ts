import {
  type CandidateRow,
  LINK_TYPE_LABELS,
  type LinkStrength,
  type LinkType,
  type RecordLink,
} from "@/lib/selfeval/types";

// 연계 지도 순수 로직(명세 No.185, 186, 193, 194). 서버 linkGraph.ts 의 도달 판정과 같은 규칙을
// 화면에서 미리 보여 주기 위한 사본이다. 확정은 서버가 다시 판정한다.

/** 암묵 연계는 학생이 "실제로 이어서 했어요" 를 누르기 전까지 연결 문장에 쓰지 않는다(명세 No.185, 193). */
export const needsConfirm = (l: RecordLink): boolean =>
  l.strength === "implicit" && !l.confirmed;

export const strengthLabel = (
  strength: LinkStrength | null,
  confirmed: boolean,
): string =>
  strength === "explicit"
    ? "기록에 명시"
    : confirmed
      ? "추론, 학생 확인"
      : "추론";

/** 지워지지 않은 선을 무방향으로 보고 핵심에서 닿지 않는 보조 id. 한 줄을 쓰지 않으면 생성에서 빠진다(명세 No.180). */
export function unlinkedIds(
  links: readonly RecordLink[],
  coreId: string,
  supportIds: readonly string[],
): string[] {
  const live = links.filter((l) => !l.deleted);
  const reached = new Set([coreId]);
  let frontier = [coreId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const l of live) {
        const other =
          l.fromId === id ? l.toId : l.toId === id ? l.fromId : null;
        if (other !== null && !reached.has(other)) {
          reached.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return supportIds.filter((id) => !reached.has(id));
}

const submittedOf = (r: CandidateRow): number => {
  const t = new Date(r.submittedAt ?? r.activity.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** 앞선 제출일이 from. 같으면 인자 순서를 지킨다. */
export function orderPair(
  rows: readonly CandidateRow[],
  a: string,
  b: string,
): { fromId: string; toId: string } {
  const at = (id: string) => {
    const r = rows.find((x) => x.activity.id === id);
    return r ? submittedOf(r) : 0;
  };
  return at(b) < at(a) ? { fromId: b, toId: a } : { fromId: a, toId: b };
}

export type MapEdge = {
  fromId: string;
  toId: string;
  type: LinkType;
  typeLabel: string;
  strengthLabel: string;
  needsConfirm: boolean;
  note: string | null;
};

export type MapNode = {
  id: string;
  title: string;
  col: number;
  row: number;
};

export type LinkMapLayout = {
  columns: { label: string }[];
  nodes: MapNode[];
  edges: MapEdge[];
};

const NO_SUBJECT = "과목 미기재";

/** 선택한 기록을 과목별 열, 제출일 순 행으로 놓고 두 끝이 모두 선택된 지워지지 않은 선만 남긴다(명세 No.186). */
export function layoutLinkMap(
  rows: readonly CandidateRow[],
  links: readonly RecordLink[],
): LinkMapLayout {
  const sorted = [...rows].sort((a, b) => submittedOf(a) - submittedOf(b));
  const labels: string[] = [];
  const nodes = sorted.map((r, row): MapNode => {
    const label = r.activity.courseName ?? r.activity.subject ?? NO_SUBJECT;
    if (!labels.includes(label)) labels.push(label);
    return {
      id: r.activity.id,
      title: r.activity.topic ?? r.activity.subject ?? "활동",
      col: labels.indexOf(label),
      row,
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = links
    .filter((l) => !l.deleted && ids.has(l.fromId) && ids.has(l.toId))
    .map(
      (l): MapEdge => ({
        fromId: l.fromId,
        toId: l.toId,
        type: l.type,
        typeLabel: LINK_TYPE_LABELS[l.type],
        strengthLabel: strengthLabel(l.strength, l.confirmed),
        needsConfirm: needsConfirm(l),
        note: l.note,
      }),
    );
  return { columns: labels.map((label) => ({ label })), nodes, edges };
}
