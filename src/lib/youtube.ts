const YOUTUBE_ID = /^[\w-]{11}$/;

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
