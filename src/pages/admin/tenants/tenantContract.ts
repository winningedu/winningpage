// 기관 목록의 계약 표시(결정 102.1, 102.13). 삭제 가능일은 유예 종료 다음 날이다(fn_anonymize_expired_b2b_members 와 같은 규칙).

const MOU_LABELS: Record<string, string> = {
  pending: "협약 전",
  signed: "협약 중",
  ended: "협약 종료",
};

export function mouLabel(status: string | null | undefined): string {
  return (status && MOU_LABELS[status]) || "-";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
}

function addDays(ymd: string, days: number): string {
  return new Date((dayNumber(ymd) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** 지금 KST 날짜(YYYY-MM-DD). */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

interface DdayInput {
  contractEnd: string | null;
  graceEnds: string | null;
  /** app_settings.contract_grace_days. 유예 종료일이 비었을 때만 쓴다. */
  defaultGraceDays: number | null;
  today: string;
}

/** 목록의 삭제 D-day 문구. 계약 종료일이 없으면 null. */
export function deletionDdayText(input: DdayInput): string | null {
  const { contractEnd, graceEnds, defaultGraceDays, today } = input;
  if (!contractEnd) return null;
  const graceEnd =
    graceEnds ??
    (defaultGraceDays === null ? null : addDays(contractEnd, defaultGraceDays));
  if (!graceEnd) return "유예 종료일 미정";
  const deletableFrom = dayNumber(addDays(graceEnd, 1));
  const now = dayNumber(today);
  if (now < deletableFrom) return `삭제 가능일 D-${deletableFrom - now}`;
  return `삭제 가능, 계약 종료 후 ${now - dayNumber(contractEnd)}일 지남`;
}
