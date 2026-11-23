// 본사 대시보드 통계 라우트의 기간 쿼리. 날짜는 KST 달력 날짜(YYYY-MM-DD)이고 양 끝을 포함한다.
// 기본 기간은 이번 달 1일부터 오늘(KST). 종료일은 오늘을 넘을 수 없고 기간은 최대 731일(로그인 기록 보관 2년).

import { kstYMD } from "../../../src/lib/goal/calc/index.js";

const MAX_SPAN_DAYS = 731;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GRAINS = ["day", "week", "month"] as const;
export const MAU_MODES = ["calendar", "rolling30"] as const;
export type Grain = (typeof GRAINS)[number];
export type MauMode = (typeof MAU_MODES)[number];

function isDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function daysBetween(from: string, to: string): number {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

// 쿼리에 없으면 fallback, 허용 값이 아니면 null.
export function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T | null {
  if (value === undefined) return fallback;
  return allowed.includes(value as T) ? (value as T) : null;
}

// 올바르면 { from, to }, 아니면 화면에 보일 오류 문구.
export function parsePeriod(
  query: Record<string, unknown>,
): { from: string; to: string } | string {
  const today = kstYMD(new Date());
  const from =
    query.from === undefined ? `${today.slice(0, 8)}01` : String(query.from);
  const to = query.to === undefined ? today : String(query.to);
  if (!isDate(from) || !isDate(to)) return "날짜를 YYYY-MM-DD 로 적어 주세요.";
  if (from > to) return "시작일이 종료일보다 늦습니다.";
  if (to > today) return "종료일은 오늘을 넘을 수 없습니다.";
  if (daysBetween(from, to) + 1 > MAX_SPAN_DAYS)
    return "기간은 최대 731일입니다.";
  return { from, to };
}
