import { parseYoutubeVideoId } from "@/lib/youtube";
import {
  type ColumnRow,
  formatDate,
  getDisplayDate,
  getThumbnailUrl,
} from "@/pages/column/columnData";

// 홈 칼럼 박스(W1 M13~M16) 데이터 변환. 결정 22: 카테고리 '교육청소식' 글은 홈 박스에서 뺀다.
const EXCLUDED_CATEGORY = "교육청소식";
const MAX_BOXES = 4;

export type HomeColumnBox = {
  id: string | number;
  kind: "video" | "column";
  title: string;
  date: string;
  thumbnailUrl?: string;
  videoId?: string;
  durationLabel?: string;
};

function time(row: ColumnRow) {
  return new Date(getDisplayDate(row) || 0).getTime();
}

/** 교육청소식을 빼고, 추천 글 먼저 그다음 최신순으로 4건. */
export function pickHomeColumns(rows: ColumnRow[]): ColumnRow[] {
  return rows
    .filter((row) => row.category !== EXCLUDED_CATEGORY)
    .sort(
      (a, b) =>
        Number(b.is_featured === true) - Number(a.is_featured === true) ||
        time(b) - time(a),
    )
    .slice(0, MAX_BOXES);
}

/** 초를 mm:ss로. 값이 없거나 0 이하이면 null(재생 시간 칩을 그리지 않는다). */
export function formatDuration(
  seconds: number | null | undefined,
): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return null;
  const total = Math.floor(seconds);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function toHomeColumnBox(row: ColumnRow): HomeColumnBox {
  const videoId = parseYoutubeVideoId(row.link_url as string | undefined);
  const registered = getThumbnailUrl(row);
  const thumbnailUrl =
    registered ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
  const duration = videoId
    ? formatDuration(row.video_duration_seconds as number | null | undefined)
    : null;

  return {
    id: row.id,
    kind: videoId ? "video" : "column",
    title: row.title ?? "",
    date: formatDate(getDisplayDate(row)).replaceAll("-", "."),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(videoId ? { videoId } : {}),
    ...(duration ? { durationLabel: duration } : {}),
  };
}
