import { parseYoutubeVideoId } from "@/components/landing/homeColumns";

export const COLUMN_KINDS = ["영상", "칼럼"] as const;

export type ColumnKind = (typeof COLUMN_KINDS)[number];

// 연결주소가 유튜브 영상 주소면 영상, 아니면 칼럼(홈 박스와 같은 규칙).
export function getColumnKind(row: { link_url?: unknown }): ColumnKind {
  const linkUrl = typeof row.link_url === "string" ? row.link_url : undefined;
  return parseYoutubeVideoId(linkUrl) ? "영상" : "칼럼";
}
