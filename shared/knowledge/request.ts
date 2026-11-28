// 수행평가 지식 DB 관리 요청 스키마(엑셀 일괄 반영, 중복 검사, 검색 테스트). 서버(api/_routes/admin/knowledge-{bulk,dedupe,search}.ts)가 validate 로 쓴다.
// 틀리면 400 VALIDATION_FAILED 이고, 한국어 사유는 errors[].message 에 실린다. 한도와 필드 목록은 contract.ts 가 정한다.

import { z } from "zod";
import {
  BULK_KNOWLEDGE_TYPES,
  BULK_REQUIRED_FIELDS,
  BULK_WRITABLE_FIELDS,
  type BulkKnowledgeType,
  type DedupeItem,
  KNOWLEDGE_TEXT_FIELDS,
  type KnowledgeTextField,
  MAX_BULK_ROWS,
  MAX_DEDUPE_ITEMS,
  SEARCH_PREVIEW_DEFAULT_LIMIT,
  SEARCH_PREVIEW_MAX_LIMIT,
  SEARCH_PREVIEW_MODES,
} from "./contract.js";

/** 수행평가 지식 테이블의 컬럼 전부. 이 밖인 키는 일괄 반영에서 400 이다. 생성 타입과 같은지는 api/_lib/knowledge/bulk.test.ts 가 컴파일로 본다. */
export const KNOWLEDGE_COLUMNS = [
  "career_field",
  "content",
  "created_at",
  "embedded_at",
  "embedding",
  "embedding_error",
  "embedding_model",
  "embedding_status",
  "grade",
  "id",
  "is_active",
  "keywords",
  "knowledge_type",
  "last_reviewed_at",
  "memo",
  "rag_use",
  "search_text",
  "source",
  "source_link",
  "subject",
  "title",
  "updated_at",
] as const;

const knowledgeTypeField = z.enum(BULK_KNOWLEDGE_TYPES, {
  error: "knowledgeType 이 올바르지 않습니다.",
});

// ---------------------------------------------------------------------------
// 일괄 반영
// ---------------------------------------------------------------------------

type WritableField = (typeof BULK_WRITABLE_FIELDS)[number];

export type BulkRow = Partial<
  Record<WritableField, string | boolean | null>
> & {
  knowledge_type: BulkKnowledgeType;
  embedding_status: "pending";
  embedding_error: null;
};

export type BulkUpdate = { id: string; patch: BulkRow };

const bulkEntry = z.record(z.string(), z.unknown());

const unknownKeys = (source: Record<string, unknown>): string[] =>
  Object.keys(source).filter(
    (key) => !(KNOWLEDGE_COLUMNS as readonly string[]).includes(key),
  );

/** 허용 필드만 남기고 knowledge_type 을 메뉴 값으로 덮고 임베딩 상태를 pending 으로 돌린다. */
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

function missingRequired(row: BulkRow, mode: "insert" | "update"): string[] {
  return BULK_REQUIRED_FIELDS.filter((field) => {
    if (mode === "update" && !(field in row)) return false;
    return String(row[field] ?? "").trim() === "";
  });
}

/** POST knowledge-bulk 본문. 신규와 수정 합계 최대 MAX_BULK_ROWS 건이다. */
export const knowledgeBulkBody = z
  .object({
    knowledgeType: knowledgeTypeField,
    inserts: z.array(bulkEntry),
    updates: z.array(bulkEntry),
  })
  .check((ctx) => {
    const { inserts, updates } = ctx.value;
    const total = inserts.length + updates.length;
    if (total === 0) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        message: "반영할 행이 없습니다.",
      });
    } else if (total > MAX_BULK_ROWS) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        message: `신규와 수정을 합쳐 한 번에 ${MAX_BULK_ROWS}건까지 보낼 수 있습니다.`,
      });
    }
  })
  .transform((body, ctx) => {
    const { knowledgeType } = body;
    const reject = (path: (string | number)[], message: string) =>
      ctx.issues.push({ code: "custom", input: body, path, message });

    const inserts: BulkRow[] = [];
    for (const [index, source] of body.inserts.entries()) {
      const keys = unknownKeys(source);
      if (keys.length > 0) {
        reject(
          ["inserts", index],
          `inserts[${index}] 에 알 수 없는 키가 있습니다: ${keys.join(", ")}`,
        );
        continue;
      }
      const row = pickWritable(source, knowledgeType);
      const missing = missingRequired(row, "insert");
      if (missing.length > 0) {
        reject(
          ["inserts", index],
          `inserts[${index}] 에 필수값이 비었습니다: ${missing.join(", ")}`,
        );
        continue;
      }
      inserts.push(row);
    }

    const updates: BulkUpdate[] = [];
    for (const [index, source] of body.updates.entries()) {
      const keys = unknownKeys(source);
      if (keys.length > 0) {
        reject(
          ["updates", index],
          `updates[${index}] 에 알 수 없는 키가 있습니다: ${keys.join(", ")}`,
        );
        continue;
      }
      const id = typeof source.id === "string" ? source.id.trim() : "";
      if (!id) {
        reject(["updates", index], `updates[${index}] 에 id 가 없습니다.`);
        continue;
      }
      const patch = pickWritable(source, knowledgeType);
      const missing = missingRequired(patch, "update");
      if (missing.length > 0) {
        reject(
          ["updates", index],
          `updates[${index}] 에 필수값이 비었습니다: ${missing.join(", ")}`,
        );
        continue;
      }
      updates.push({ id, patch });
    }
    return { knowledgeType, inserts, updates };
  });

export type BulkBody = z.output<typeof knowledgeBulkBody>;
/** 브라우저가 보내는 모양. */
export type KnowledgeBulkInput = z.input<typeof knowledgeBulkBody>;

// ---------------------------------------------------------------------------
// 중복 검사
// ---------------------------------------------------------------------------

const textShape = Object.fromEntries(
  KNOWLEDGE_TEXT_FIELDS.map((field) => [field, z.string().default("")]),
) as Record<KnowledgeTextField, z.ZodDefault<z.ZodString>>;

const dedupeItem = z
  .object({
    rowNo: z.int({ error: "items[].rowNo 는 정수여야 합니다." }),
    id: z.string().optional(),
    ...textShape,
  })
  .transform(({ id, ...rest }): DedupeItem => (id ? { ...rest, id } : rest));

/** POST knowledge-dedupe 본문. 최대 MAX_DEDUPE_ITEMS 건이다. id 는 수정 행일 때만 남긴다. */
export const knowledgeDedupeBody = z.object({
  knowledgeType: knowledgeTypeField,
  items: z
    .array(dedupeItem)
    .min(1, { error: "items 가 비어 있습니다." })
    .max(MAX_DEDUPE_ITEMS, {
      error: `items 는 한 번에 ${MAX_DEDUPE_ITEMS}건까지 보낼 수 있습니다.`,
    }),
});

export type DedupeBody = z.output<typeof knowledgeDedupeBody>;
export type KnowledgeDedupeInput = z.input<typeof knowledgeDedupeBody>;

// ---------------------------------------------------------------------------
// 검색 테스트
// ---------------------------------------------------------------------------

const searchText = (key: string) =>
  z
    .string({ error: `${key} 는 문자열이어야 합니다.` })
    .nullish()
    .transform((value) => value ?? "");

const limitMessage = `limit 는 1부터 ${SEARCH_PREVIEW_MAX_LIMIT} 사이 정수여야 합니다.`;

/** POST knowledge-search 본문. 비운 칸은 학생 요청 경로와 같은 기본값으로 채운다. */
export const knowledgeSearchBody = z
  .object(
    {
      knowledgeType: knowledgeTypeField,
      grade: searchText("grade"),
      subject: searchText("subject"),
      career: searchText("career"),
      selectedTopic: searchText("selectedTopic"),
      assessmentInfo: searchText("assessmentInfo"),
      includeOtherSubjects: z
        .boolean({ error: "includeOtherSubjects 는 참 거짓 값입니다." })
        .nullish(),
      limit: z
        .int({ error: limitMessage })
        .min(1, { error: limitMessage })
        .max(SEARCH_PREVIEW_MAX_LIMIT, { error: limitMessage })
        .nullish(),
      mode: z
        .enum(SEARCH_PREVIEW_MODES, {
          error: "mode 는 vector 또는 hybrid 입니다.",
        })
        .nullish(),
    },
    { error: "요청 바디가 올바르지 않습니다." },
  )
  .transform((body) => ({
    ...body,
    // 기본값은 학생 요청 경로와 같다. 주제 추천은 다른 과목을 포함하고 자료 검색은 뺀다.
    includeOtherSubjects:
      body.includeOtherSubjects ?? body.knowledgeType === "topic_pattern",
    limit: body.limit ?? SEARCH_PREVIEW_DEFAULT_LIMIT,
    mode: body.mode ?? "hybrid",
  }));

export type SearchPreviewBody = z.output<typeof knowledgeSearchBody>;
export type KnowledgeSearchInput = z.input<typeof knowledgeSearchBody>;
