import { site } from "@/config/site";
import { parseYoutubeVideoId } from "@/lib/youtube";

export const COLUMN_KINDS = ["영상", "칼럼"] as const;

export type ColumnKind = (typeof COLUMN_KINDS)[number];

// 재생 가능한 영상 행인지의 단일 판단: 사이트의 영상 기능이 켜져 있고 연결주소가 유튜브 영상 주소일 때만 ID를 돌려준다.
export function getVideoId(row: Record<string, unknown>): string | null {
  if (!site.features.columnVideo) return null;
  return parseYoutubeVideoId(
    typeof row.link_url === "string" ? row.link_url : undefined,
  );
}

export function getColumnKind(row: Record<string, unknown>): ColumnKind {
  return getVideoId(row) ? "영상" : "칼럼";
}
