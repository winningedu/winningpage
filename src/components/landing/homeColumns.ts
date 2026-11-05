import {
  type ColumnRow,
  formatDate,
  getDisplayDate,
  getThumbnailUrl,
} from "@/pages/column/columnData";

// 홈 칼럼 박스(W1 M13~M16) 데이터 변환. 결정 22: 카테고리 '교육청소식' 글은 홈 박스에서 뺀다.
const EXCLUDED_CATEGORY = "교육청소식";
const MAX_BOXES = 4;
const YOUTUBE_ID = /^[\w-]{11}$/;

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

/** 유튜브 주소(watch, youtu.be, embed, shorts)에서 영상 ID를 읽는다. 유튜브가 아니면 null. */
export function parseYoutubeVideoId(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = parsed.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    const [, kind, value] = parsed.pathname.split("/");
    id =
      parsed.pathname === "/watch"
        ? parsed.searchParams.get("v")
        : kind === "embed" || kind === "shorts"
          ? (value ?? null)
          : null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
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
