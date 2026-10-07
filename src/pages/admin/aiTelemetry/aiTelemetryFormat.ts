// AI 호출 계기판 표시 변환. 값이 없으면 빈 문자열을 돌려준다(대체 숫자를 만들지 않는다).
type Option = { value: string; label: string };

export const SERVICE_OPTIONS: Option[] = [
  { value: "performance", label: "수행평가" },
  { value: "growth", label: "성장설계" },
  { value: "inquiry", label: "심화탐구" },
  { value: "selfeval", label: "자기평가서" },
  { value: "goal", label: "목표관리" },
];

export const KIND_OPTIONS: Option[] = [
  { value: "generate", label: "생성" },
  { value: "embed", label: "임베딩" },
];

export const STATUS_OPTIONS: Option[] = [
  { value: "ok", label: "성공" },
  { value: "error", label: "오류" },
];

export function serviceLabel(key: string): string {
  return SERVICE_OPTIONS.find((o) => o.value === key)?.label ?? key;
}

export function formatUsd(value: number | null): string {
  return value === null ? "" : value.toFixed(4);
}

export function formatPercent(value: number | null): string {
  return value === null ? "" : `${value.toFixed(1)}%`;
}

export function formatInt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatMs(value: number | null): string {
  return value === null ? "" : formatInt(value);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR");
}
