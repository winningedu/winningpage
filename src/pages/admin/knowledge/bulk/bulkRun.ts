// 엑셀 일괄 등록의 서버 호출 순서. 중복 검사와 반영(뒤이은 임베딩 backfill)을 차례로 부르고
// 진행과 결과를 bulkFlow 액션으로 알린다. 화면에 보이는 진행 문구와 오류 문구는 여기서 만든다.

import { MAX_BULK_ROWS } from "../../../../../api/_lib/knowledge/bulk.js";
import type { DedupeResult } from "../../../../../api/_lib/knowledge/dedupe.js";
import {
  postEmbedBackfill,
  postKnowledgeBulk,
  postKnowledgeDedupe,
} from "../api";
import { runBackfillUntilDone } from "./backfillLoop";
import type { BulkAction } from "./bulkFlow";
import {
  buildBulkRequests,
  buildDedupeItems,
  chunk,
  defaultSelection,
} from "./plan";
import type { KnowledgeParseResult } from "./xlsx";

// 중복 검사는 행마다 임베딩을 1회 부른다. 서버 상한(200건)보다 작게 끊어 한 요청이
// 함수 실행 상한(60초) 안에 끝나게 한다.
const DEDUPE_CHUNK = 50;

type Dispatch = (action: BulkAction) => void;

export async function runDedupe({
  knowledgeType,
  parse,
  dispatch,
}: {
  knowledgeType: string;
  parse: KnowledgeParseResult;
  dispatch: Dispatch;
}): Promise<void> {
  const items = buildDedupeItems(parse);
  const merged = new Map<number, DedupeResult>();
  const progressText = () => `중복 검사 중 ${merged.size} / ${items.length}행`;
  dispatch({ type: "dedupeStarted", progress: progressText() });
  for (const part of chunk(items, DEDUPE_CHUNK)) {
    dispatch({ type: "progress", text: progressText() });
    const result = await postKnowledgeDedupe(knowledgeType, part);
    if (!result.ok) {
      dispatch({
        type: "dedupeFailed",
        message: `중복 검사에 실패했습니다: ${result.message}`,
      });
      return;
    }
    for (const found of result.data) merged.set(found.rowNo, found);
  }
  dispatch({
    type: "dedupeSucceeded",
    dedupe: merged,
    selected: defaultSelection(parse, [...merged.values()]),
  });
}

/** 반영을 마치면(성공이든 실패든) onReload 로 목록을 다시 읽게 한다. 이미 반영된 묶음이 있을 수 있다. */
export async function runApply({
  knowledgeType,
  parse,
  selected,
  dispatch,
  onReload,
}: {
  knowledgeType: string;
  parse: KnowledgeParseResult;
  selected: ReadonlySet<number>;
  dispatch: Dispatch;
  onReload: () => void;
}): Promise<void> {
  const requests = buildBulkRequests(
    knowledgeType,
    parse,
    new Set(selected),
    MAX_BULK_ROWS,
  );
  let inserted = 0;
  let updated = 0;
  const fail = (message: string) => {
    onReload();
    dispatch({
      type: "applyFailed",
      message: `반영에 실패했습니다. 이미 반영된 묶음은 되돌려지지 않습니다(신규 ${inserted}건, 수정 ${updated}건 반영됨): ${message}`,
    });
  };
  const applyText = () => `반영 중 ${inserted + updated} / ${selected.size}행`;
  dispatch({ type: "applyStarted", progress: applyText() });
  for (const request of requests) {
    dispatch({ type: "progress", text: applyText() });
    const result = await postKnowledgeBulk(request);
    if (!result.ok) return fail(result.message);
    inserted += result.data.inserted;
    updated += result.data.updated;
  }
  dispatch({ type: "progress", text: "임베딩 중" });
  const backfill = await runBackfillUntilDone(postEmbedBackfill, (p) =>
    dispatch({
      type: "progress",
      text: `임베딩 중 ${p.embedded}건 완료 (${p.rounds}회차)`,
    }),
  );
  if (!backfill.ok) return fail(backfill.message);
  onReload();
  const { embedded, lastFailed } = backfill.data;
  const failedNote =
    lastFailed > 0
      ? ` 임베딩 실패 ${lastFailed}건은 목록에서 사유를 확인하세요.`
      : "";
  dispatch({
    type: "applySucceeded",
    message: `반영 완료: 신규 ${inserted}건, 수정 ${updated}건, 임베딩 ${embedded}건.${failedNote}`,
  });
}
