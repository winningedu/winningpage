// pick-records list 응답 조립(명세 No.31, 32, 144, 177~180, 195, 196). 순수 모듈이다.

import { buildLinkGraph } from "./linkGraph.js";
import { annotateRows, evaluateSelection } from "./linkSelect.js";
import { assignRoles } from "./pick.js";
import { parseStepState } from "./session.js";
import type { CandidateRow, RecordLink } from "./types.js";

/** pending: 아직 판정 전, ok: 판정 끝, unchecked: 호출 실패나 시도 소진(명세 No.196). */
export type LinkStatus = "pending" | "ok" | "unchecked";

export function linkStatusOf(stepState: unknown): LinkStatus {
  const status = parseStepState(stepState).steps.link?.status;
  if (status === "ok") return "ok";
  return status === "failed" ? "unchecked" : "pending";
}

/** 핵심과 같은 덩어리로 이어지지 않은 선택 기록. 학생이 한 줄을 쓰지 않으면 생성에서 쓰지 않는다(명세 No.180). */
export function unlinkedIds(
  links: RecordLink[],
  coreId: string,
  supportIds: string[],
): string[] {
  const graph = buildLinkGraph(links, coreId);
  return supportIds.filter((id) => !graph.has(id));
}

export type PickSelection = { coreId: string; supportIds: string[] };

export function composePickList(input: {
  rows: CandidateRow[];
  links: RecordLink[];
  status: LinkStatus;
  selection: PickSelection | null;
  targetChars: number | null;
}) {
  const { rows, links, status, selection, targetChars } = input;
  const ev = evaluateSelection(
    rows,
    { links: status === "ok" ? links : null, targetChars },
    selection?.coreId,
  );
  const auto = selection
    ? null
    : {
        coreId: ev.coreId,
        supportIds: ev.supportIds,
        coreMismatch: ev.coreMismatch,
        noneAboveThreshold: ev.noneAboveThreshold,
      };
  const marked =
    selection ??
    (ev.coreId ? { coreId: ev.coreId, supportIds: ev.supportIds } : null);
  const annotated = annotateRows(rows, ev);
  return {
    candidates: marked
      ? assignRoles(annotated, marked.coreId, marked.supportIds)
      : annotated,
    auto,
    links,
    linkStatus: status,
    linkUnchecked: status === "unchecked",
    maxSelect: ev.maxSelect,
    excludedIds:
      selection && status === "ok"
        ? unlinkedIds(links, selection.coreId, selection.supportIds)
        : [],
  };
}
