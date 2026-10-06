// 성장설계 화면 공용 날짜 포맷. 서버 시각은 ISO 문자열이고 화면은 한국 날짜로 보여 준다.

type Options = { timeZone?: string };

/** `2026년 11월 14일`. 기본은 Asia/Seoul 기준이라 브라우저 시간대와 무관하다. 해석할 수 없으면 null. */
export function formatKoreanDate(
  iso: string | null | undefined,
  { timeZone = "Asia/Seoul" }: Options = {},
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}년 ${pick("month")}월 ${pick("day")}일`;
}
