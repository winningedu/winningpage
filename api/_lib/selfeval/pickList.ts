// pick-records list 응답 조립(명세 No.31, 32, 144, 177~180, 195, 196). 순수 모듈이다.

import { annotateRows, evaluateSelection } from "./linkSelect.js";
import { neverLinkedIds } from "./linkWrite.js";
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

/**
 * 연결 행이 한 줄도 닿지 않은 선택 기록. 학생이 한 줄을 쓰지 않으면 생성에서 쓰지 않는다(명세 No.180).
 * 지운 행도 닿은 것으로 센다: 연계를 모두 지운 기록은 기여 항목으로만 쓰므로 여기에 들지 않는다(No.194).
 * 생성 쪽 규칙(evidenceSources.buildWriteEvidence)과 같은 함수를 쓴다.
 */
export function unlinkedIds(
  links: RecordLink[],
  supportIds: string[],
): string[] {
  return neverLinkedIds(
    supportIds,
    links.map((l) => [l.fromId, l.toId] as const),
  );
}

/**
 * 화면과 선택 규칙이 읽는 연계. 판정이 끝났으면 저장된 전부이고, 그 밖에는 학생이 그은 선만이다.
 * 학생이 그은 선은 판정 상태와 관계없이 남아 선택과 경고에 반영된다(명세 No.180, 194).
 */
export function visibleLinks(
  status: LinkStatus,
  stored: RecordLink[],
): RecordLink[] {
  return status === "ok"
    ? stored
    : stored.filter((l) => l.source === "student");
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
  // 판정이 끝났거나 학생이 선을 그었으면 연계를 쓴다. 둘 다 없으면 적합도 상위 3건 추천으로 돌아간다.
  const linked = status === "ok" || links.length > 0;
  const ev = evaluateSelection(
    rows,
    { links: linked ? links : null, targetChars },
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
      selection && linked ? unlinkedIds(links, selection.supportIds) : [],
  };
}
