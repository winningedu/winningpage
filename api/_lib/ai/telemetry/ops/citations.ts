// 관리자 자료 인용 현황(view=citations)의 행 변환과 정렬.

import type { Database } from "../../../../../src/types/database.types.js";

export type CitationRow =
  Database["public"]["Functions"]["fn_ai_telemetry_citations"]["Returns"][number];

export type CitationItem = {
  resourceId: string;
  title: string;
  knowledgeType: string;
  isActive: boolean;
  hitCount: number;
  citedCount: number;
  lastHitAt: string | null;
  lastCitedAt: string | null;
};

export function toCitationItem(row: CitationRow): CitationItem {
  return {
    resourceId: row.resource_id,
    title: row.title,
    knowledgeType: row.knowledge_type,
    isActive: row.is_active,
    hitCount: row.hit_count,
    citedCount: row.cited_count,
    // 생성 타입은 RETURNS TABLE 컬럼을 전부 non-null 로 만들지만 left join 이라 실제로는 null 이 온다.
    lastHitAt: (row.last_hit_at as string | null) ?? null,
    lastCitedAt: (row.last_cited_at as string | null) ?? null,
  };
}

export function sortCitations(
  items: CitationItem[],
  mode: "least_cited" | "most_cited",
): CitationItem[] {
  const dir = mode === "least_cited" ? 1 : -1;
  return [...items].sort(
    (a, b) => dir * (a.citedCount - b.citedCount) || b.hitCount - a.hitCount,
  );
}
