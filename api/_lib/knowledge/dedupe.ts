// 수행평가 지식 DB 중복 감지 순수 함수. 브라우저(엑셀 업로드 미리보기)와
// 서버(api/admin/knowledge-dedupe.ts)가 이 파일 하나를 같이 import 해
// 정규화 규칙이 두 벌로 갈라지지 않게 한다. 그래서 node 전용 모듈을 쓰지 않는다.

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{P}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 제목과 내용을 정확 일치 비교용 문자열로 접는다. */
export function normalizeForHash(title: string, content: string): string {
  return `${normalizeText(title)}\n${normalizeText(content)}`;
}

/**
 * 정규화한 제목과 내용의 SHA-256 hex. Web Crypto(crypto.subtle)를 써서 브라우저와
 * node 양쪽에서 같은 값을 낸다.
 */
export async function contentHash(
  title: string,
  content: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeForHash(title, content));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

type HashSource = { title: string | null; content: string | null };

/**
 * 1차 정확 일치. 기존 행 전체의 해시를 메모리에서 한 번 계산해 신규 행마다 대조한다.
 * 같은 knowledge_type 행이 수천 건 수준이라 DB 쪽 해시 컬럼 없이도 충분하다.
 */
export async function matchExactDuplicates<
  E extends HashSource & { id: string },
>(
  items: Array<{ rowNo: number } & HashSource>,
  existing: E[],
): Promise<
  Array<{ rowNo: number; exact: Array<{ id: string; title: string }> }>
> {
  const byHash = new Map<string, Array<{ id: string; title: string }>>();
  for (const row of existing) {
    const hash = await contentHash(row.title ?? "", row.content ?? "");
    const bucket = byHash.get(hash) ?? [];
    bucket.push({ id: row.id, title: row.title ?? "" });
    byHash.set(hash, bucket);
  }

  const results: Array<{
    rowNo: number;
    exact: Array<{ id: string; title: string }>;
  }> = [];
  for (const item of items) {
    const hash = await contentHash(item.title ?? "", item.content ?? "");
    results.push({ rowNo: item.rowNo, exact: byHash.get(hash) ?? [] });
  }
  return results;
}

/** 일괄 등록 대상 knowledge_type. admin-embed 의 RAG_KNOWLEDGE_TYPES 와 같은 2종이다. */
export const BULK_KNOWLEDGE_TYPES = [
  "topic_pattern",
  "verified_resource",
] as const;
export type BulkKnowledgeType = (typeof BULK_KNOWLEDGE_TYPES)[number];

export function isBulkKnowledgeType(
  value: unknown,
): value is BulkKnowledgeType {
  return (BULK_KNOWLEDGE_TYPES as readonly unknown[]).includes(value);
}

/** 근사 비교가 행마다 임베딩을 1회 호출하므로 요청 한 번의 상한을 둔다. */
export const MAX_DEDUPE_ITEMS = 200;

/** 검색 텍스트 공식(buildKnowledgeSearchText)이 읽는 본문 필드. */
export const KNOWLEDGE_TEXT_FIELDS = [
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
export type KnowledgeTextField = (typeof KNOWLEDGE_TEXT_FIELDS)[number];

export type DedupeItem = { rowNo: number; id?: string } & Record<
  KnowledgeTextField,
  string
>;

export type DedupeBody = {
  knowledgeType: BulkKnowledgeType;
  items: DedupeItem[];
};

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function validateDedupeBody(
  raw: unknown,
): { ok: true; body: DedupeBody } | { ok: false; reason: string } {
  const body = (raw ?? {}) as { knowledgeType?: unknown; items?: unknown };
  if (!isBulkKnowledgeType(body.knowledgeType)) {
    return { ok: false, reason: "knowledgeType 이 올바르지 않습니다." };
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, reason: "items 가 비어 있습니다." };
  }
  if (body.items.length > MAX_DEDUPE_ITEMS) {
    return {
      ok: false,
      reason: `items 는 한 번에 ${MAX_DEDUPE_ITEMS}건까지 보낼 수 있습니다.`,
    };
  }

  const items: DedupeItem[] = [];
  for (const entry of body.items) {
    const source = (entry ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(source.rowNo)) {
      return { ok: false, reason: "items[].rowNo 는 정수여야 합니다." };
    }
    const item = { rowNo: source.rowNo as number } as DedupeItem;
    for (const field of KNOWLEDGE_TEXT_FIELDS) {
      item[field] = textOf(source[field]);
    }
    if (typeof source.id === "string" && source.id) item.id = source.id;
    items.push(item);
  }
  return { ok: true, body: { knowledgeType: body.knowledgeType, items } };
}

/**
 * 근사 중복 판정 기준 코사인 유사도. 정책값이다.
 * 근거: 2026 RAG 중복 감지 관행(정확 해시 1차, 임베딩 0.95 2차), 검토 문서 2026-10-07.
 */
export const KNOWLEDGE_NEAR_DUPLICATE_THRESHOLD = 0.95;

export type NearMatch = { id: string; title: string; similarity: number };

export type DedupeResult = {
  rowNo: number;
  exact: Array<{ id: string; title: string }>;
  near: NearMatch[];
};

export type DedupeDeps = {
  /** 같은 knowledge_type 의 기존 행 전체(title, content 만). */
  existing: Array<{ id: string } & HashSource>;
  /**
   * 행 하나를 임베딩한다. 라우트가 buildKnowledgeSearchText 와 embedText 로 채운다.
   * 이 파일은 브라우저도 import 하므로 임베딩 모듈을 직접 끌어오지 않는다.
   */
  embed: (
    item: DedupeItem & { knowledge_type: BulkKnowledgeType },
  ) => Promise<number[]>;
  /** 임계값 이상인 기존 행을 유사도 내림차순으로 돌려준다(fn_knowledge_near_duplicates). */
  searchNear: (
    embedding: number[],
    minSimilarity: number,
  ) => Promise<NearMatch[]>;
};

/**
 * 2단계 중복 감지. 1차는 정규화 해시 정확 일치, 2차는 임베딩 근사 일치다.
 * 근사 목록에서는 이미 정확 일치로 잡힌 행과, 수정 행 자기 자신(item.id)을 뺀다.
 */
export async function detectKnowledgeDuplicates(
  body: DedupeBody,
  deps: DedupeDeps,
): Promise<DedupeResult[]> {
  const exactByRow = await matchExactDuplicates(body.items, deps.existing);
  const results: DedupeResult[] = [];
  for (const [index, item] of body.items.entries()) {
    const selfId = item.id ?? null;
    const exact = (exactByRow[index]?.exact ?? []).filter(
      (match) => match.id !== selfId,
    );
    const exactIds = new Set(exact.map((match) => match.id));
    const embedding = await deps.embed({
      ...item,
      knowledge_type: body.knowledgeType,
    });
    const near = (
      await deps.searchNear(embedding, KNOWLEDGE_NEAR_DUPLICATE_THRESHOLD)
    ).filter((match) => match.id !== selfId && !exactIds.has(match.id));
    results.push({ rowNo: item.rowNo, exact, near });
  }
  return results;
}
