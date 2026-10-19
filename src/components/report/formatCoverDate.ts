/** 표지 날짜 표기 `2026. 10. 16` (한국 시간 기준). 값이 없거나 날짜가 아니면 null. */
export function formatCoverDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}. ${pick("month")}. ${pick("day")}`;
}

/** 기간 라벨 `2026-10-19 ~ 2026-10-25` 를 `2026. 10. 19 ~ 2026. 10. 25` 로. 두 날짜로 읽을 수 없으면 null. */
export function formatCoverPeriod(
  label: string | null | undefined,
): string | null {
  const [start, end, ...rest] = (label ?? "").split(" ~ ");
  if (rest.length > 0) return null;
  const from = formatCoverDate(start);
  const to = formatCoverDate(end);
  return from && to ? `${from} ~ ${to}` : null;
}
