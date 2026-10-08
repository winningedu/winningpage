// 지식 DB 엑셀 일괄 등록 화면의 판단 순수 함수. 컴포넌트(BulkPanel.tsx)는
// 상태와 호출 순서만 들고, 무엇을 반영할지는 여기서 정한다.

import {
  type DedupeItem,
  type DedupeResult,
  KNOWLEDGE_TEXT_FIELDS,
} from "../../../../../api/_lib/knowledge/dedupe.js";
import type { KnowledgeParseResult } from "./xlsx";

/**
 * 중복 검사 뒤 기본 체크 상태. 정확 일치가 있는 행은 같은 자료를 두 번 넣는 것이라
 * 기본 제외한다. 근사 일치는 경고만 띄우고 포함한 채로 둬 관리자가 고르게 한다.
 */
export function defaultSelection(
  parse: KnowledgeParseResult,
  dedupe: DedupeResult[],
): Set<number> {
  const exactRows = new Set(
    dedupe.filter((r) => r.exact.length > 0).map((r) => r.rowNo),
  );
  return new Set(
    [...parse.inserts, ...parse.updates]
      .map((row) => row.rowNo)
      .filter((rowNo) => !exactRows.has(rowNo)),
  );
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export type BulkRequest = {
  knowledgeType: string;
  inserts: Record<string, unknown>[];
  updates: Array<Record<string, unknown> & { id: string }>;
};

/**
 * 체크한 행으로 api/admin/knowledge-bulk 요청 본문 목록을 만든다. 신규와 수정을 합쳐
 * maxRows 씩 끊는다(서버 상한 MAX_BULK_ROWS 와 맞춘다).
 */
export function buildBulkRequests(
  knowledgeType: string,
  parse: KnowledgeParseResult,
  selected: Set<number>,
  maxRows: number,
): BulkRequest[] {
  const picked = [...parse.inserts, ...parse.updates].filter((row) =>
    selected.has(row.rowNo),
  );
  return chunk(picked, maxRows).map((rows) => ({
    knowledgeType,
    inserts: rows.filter((row) => !row.id).map((row) => row.values),
    updates: rows
      .filter((row) => row.id)
      .map((row) => ({ ...row.values, id: row.id as string })),
  }));
}

/**
 * 중복 검사 요청 항목. 제목과 내용 열이 둘 다 있는 행만 보낸다. 수정 파일에서 두 열을
 * 뺀 행은 비교할 본문이 없다. 수정 행은 id 를 실어 서버가 자기 자신을 빼게 한다.
 */
export function buildDedupeItems(parse: KnowledgeParseResult): DedupeItem[] {
  return [...parse.inserts, ...parse.updates]
    .filter((row) => "title" in row.values && "content" in row.values)
    .map((row) => {
      const item = { rowNo: row.rowNo } as DedupeItem;
      if (row.id) item.id = row.id;
      for (const field of KNOWLEDGE_TEXT_FIELDS) {
        const value = row.values[field];
        item[field] =
          value === null || value === undefined ? "" : String(value);
      }
      return item;
    });
}
