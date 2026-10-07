// 수행평가 지식 DB 엑셀 일괄 반영의 판단과 변환 순수 함수.
// 라우트(api/performance/admin-knowledge-bulk.ts)는 이 결과를 그대로 DB 에 쓴다.
//
// 규칙
//   knowledge_type 은 파일 값과 무관하게 메뉴 고정값으로 덮는다(fixedValues 관용구).
//   허용 필드 밖의 키(id, embedding, created_at 등)는 버린다.
//   반영한 행은 embedding_status 를 pending 으로 돌려 다음 backfill 이 다시 태우게 한다.
//   search_text 는 건드리지 않는다. 임베딩 단계가 새로 조립해 덮는다.

import {
  type BulkKnowledgeType,
  isBulkKnowledgeType,
} from "./knowledgeDedupe.js";

/** 요청 한 번에 반영하는 신규와 수정 합계 상한. 클라이언트가 이 크기로 나눠 보낸다. */
export const MAX_BULK_ROWS = 500;

/** 엑셀에서 받아들이는 컬럼. 이 밖의 키는 조용히 버린다. */
export const BULK_WRITABLE_FIELDS = [
  "is_active",
  "grade",
  "subject",
  "career_field",
  "title",
  "content",
  "source",
  "source_link",
  "keywords",
  "memo",
] as const;
type WritableField = (typeof BULK_WRITABLE_FIELDS)[number];

/** DB 에서 not null 인 본문 컬럼. 신규는 전부 있어야 하고, 수정은 보낸 값이 비면 안 된다. */
export const BULK_REQUIRED_FIELDS = [
  "grade",
  "subject",
  "title",
  "content",
] as const;

function missingRequired(row: BulkRow, mode: "insert" | "update"): string[] {
  return BULK_REQUIRED_FIELDS.filter((field) => {
    if (mode === "update" && !(field in row)) return false;
    return String(row[field] ?? "").trim() === "";
  });
}

export type BulkRow = Partial<
  Record<WritableField, string | boolean | null>
> & {
  knowledge_type: BulkKnowledgeType;
  embedding_status: "pending";
  embedding_error: null;
};

export type BulkUpdate = { id: string; patch: BulkRow };

export type BulkBody = {
  knowledgeType: BulkKnowledgeType;
  inserts: BulkRow[];
  updates: BulkUpdate[];
};

function pickWritable(
  source: Record<string, unknown>,
  knowledgeType: BulkKnowledgeType,
): BulkRow {
  const row = {
    knowledge_type: knowledgeType,
    embedding_status: "pending",
    embedding_error: null,
  } as BulkRow;
  for (const field of BULK_WRITABLE_FIELDS) {
    if (!(field in source)) continue;
    const value = source[field];
    if (field === "is_active") {
      row.is_active = value === true;
    } else {
      row[field] = value === null || value === undefined ? null : String(value);
    }
  }
  return row;
}

export function validateBulkBody(
  raw: unknown,
): { ok: true; body: BulkBody } | { ok: false; reason: string } {
  const body = (raw ?? {}) as {
    knowledgeType?: unknown;
    inserts?: unknown;
    updates?: unknown;
  };
  if (!isBulkKnowledgeType(body.knowledgeType)) {
    return { ok: false, reason: "knowledgeType 이 올바르지 않습니다." };
  }
  const knowledgeType = body.knowledgeType;
  const inserts = Array.isArray(body.inserts) ? body.inserts : [];
  const updates = Array.isArray(body.updates) ? body.updates : [];
  const total = inserts.length + updates.length;
  if (total === 0) {
    return { ok: false, reason: "반영할 행이 없습니다." };
  }
  if (total > MAX_BULK_ROWS) {
    return {
      ok: false,
      reason: `신규와 수정을 합쳐 한 번에 ${MAX_BULK_ROWS}건까지 보낼 수 있습니다.`,
    };
  }

  const insertRows: BulkRow[] = [];
  for (const [index, entry] of inserts.entries()) {
    const row = pickWritable(
      (entry ?? {}) as Record<string, unknown>,
      knowledgeType,
    );
    const missing = missingRequired(row, "insert");
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `inserts[${index}] 에 필수값이 비었습니다: ${missing.join(", ")}`,
      };
    }
    insertRows.push(row);
  }

  const updateRows: BulkUpdate[] = [];
  for (const [index, entry] of updates.entries()) {
    const source = (entry ?? {}) as Record<string, unknown>;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    if (!id) {
      return { ok: false, reason: `updates[${index}] 에 id 가 없습니다.` };
    }
    const patch = pickWritable(source, knowledgeType);
    const missing = missingRequired(patch, "update");
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `updates[${index}] 에 필수값이 비었습니다: ${missing.join(", ")}`,
      };
    }
    updateRows.push({ id, patch });
  }

  return {
    ok: true,
    body: { knowledgeType, inserts: insertRows, updates: updateRows },
  };
}
