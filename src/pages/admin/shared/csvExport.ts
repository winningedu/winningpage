import { formatDate } from "@/lib/time/format";
import { browserTimeZone } from "@/lib/time/zone";

// CONFIGS 필드/컬럼이 공유하는 select 옵션 형태 — 문자열 그대로거나 {value,label}.
export type FieldOption = string | { value: string; label: string };

// column.type/field.type은 이 저장소 전체 CONFIGS(다른 배치 소유분 포함)가 쓰는
// 문자열이라 여기서 리터럴 유니온으로 좁히지 않는다 — formatValue/csvBody는
// 어떤 config의 컬럼이 와도 동작해야 하는 범용 포매터다.
type CellType = string | undefined;

export function formatValue(
  value: unknown,
  type?: CellType,
  options?: FieldOption[],
): string {
  if (value === null || value === undefined || value === "") return "-";

  if (Array.isArray(options)) {
    const matched = options.find(
      (option) =>
        option && typeof option === "object" && option.value === value,
    );
    if (matched && typeof matched === "object") return matched.label;
  }

  if (type === "boolean") return value ? "사용" : "미사용";

  // 멘토 신청 내역 목록 전용 — 개인정보 최소 노출(팀장 지시). 상세 화면에서는 마스킹 없이
  // 원본 휴대폰번호를 그대로 보여준다.
  if (type === "maskedPhone") {
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 8) return String(value);
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }

  if (type === "money") return `${Number(value || 0).toLocaleString()}원`;

  if (type === "date") {
    // 달력 날짜(YYYY-MM-DD)는 시간대와 무관하므로 그대로 둔다.
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      return value;
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return String(value);
    return formatDate(date);
  }

  if (type === "datetime") {
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return String(value);
    // 보는 사람의 브라우저 시간대로 표시한다.
    return date.toLocaleString("ko-KR", {
      timeZone: browserTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return String(value);
}

export function searchable(
  row: Record<string, unknown> | null | undefined,
): string {
  return Object.values(row || {})
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? "");
  // CSV formula injection 방어 — Excel/Sheets는 따옴표로 감싼 필드여도
  // 선두 = + - @ 및 탭/CR을 수식으로 해석한다. 선행 작은따옴표로 무력화한다.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

interface CsvColumn {
  key: string;
  label: string;
  type?: CellType;
}

export function csvHeader(columns: Pick<CsvColumn, "label">[]): string {
  return columns.map((column) => csvEscape(column.label)).join(",");
}

// 행 배열 → CSV 본문 줄들. 전량 로드 경로(downloadCsv)와 청크 내보내기(입결 43k행)가
// 같은 이스케이프 규칙을 쓰도록 뽑아둔 것 — 청크 쪽은 받은 행 객체를 계속 붙들지 않고
// 줄 문자열로 접어 모은다(43k행 × 30컬럼을 통째로 메모리에 쌓지 않기 위해).
export function csvBody(
  rows: Record<string, unknown>[],
  columns: Pick<CsvColumn, "key" | "type">[],
): string {
  // CSV는 표시용이 아니라 데이터 교환용이다 — column.options를 넘기지 마라.
  // 라벨(수시/정시)로 내보내면 Supabase 재업로드 시 category CHECK 제약을 위반한다.
  return rows
    .map((row) =>
      columns
        .map((column) => csvEscape(formatValue(row[column.key], column.type)))
        .join(","),
    )
    .join("\n");
}

// 헤더/본문 문자열을 그대로 받아 파일로 떨군다. 청크 내보내기는 본문을 여러 번에
// 나눠 만든 뒤 이어 붙여 넘기므로 rows 배열을 요구하지 않는 이 형태가 필요하다.
export function downloadCsvText(
  filename: string,
  header: string,
  body: string,
): void {
  const blob = new Blob([`﻿${header}\n${body}`], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns: CsvColumn[],
): void {
  downloadCsvText(filename, csvHeader(columns), csvBody(rows, columns));
}

export function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

export function getFileNameFromUrl(value: unknown): string {
  if (!value) return "첨부파일";

  try {
    const raw =
      typeof value === "string" ? value : (value as { url: string }).url;
    const pathname = new URL(raw).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "첨부파일");
  } catch {
    return "첨부파일";
  }
}

export function formatListValue(value: unknown, type?: CellType): string {
  const list = normalizeArray(value);
  if (list.length === 0) return "-";
  if (type === "imageList") return `이미지 ${list.length}개`;
  if (type === "fileList") return `첨부파일 ${list.length}개`;
  return `${list.length}개`;
}

export function truncateText(value: unknown, maxLength = 10): string {
  if (value === null || value === undefined || value === "") return "-";
  const flat = String(value).replace(/\r?\n/g, " ");
  const chars = Array.from(flat);
  if (chars.length <= maxLength) return flat;
  return `${chars.slice(0, maxLength).join("")}…`;
}
