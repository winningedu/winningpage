import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import { LINK_KIND_LABELS } from "@/lib/inquiry/labels";
import type { ReportsList, ScreenStep } from "@/lib/inquiry/types";

// 보관함 목록 행 조립과 필터(순수). 키워드 검색은 없다(No.118).

export type ReportStatusKey = "confirmed" | "open" | "archived";

export type ReportRow = {
  sessionId: string;
  date: string;
  subject: string;
  topic: string;
  linkKind: string;
  score: string;
  statusKey: ReportStatusKey;
  statusLabel: "확정" | "작성 중" | "만료" | "종결";
  /** 동작 버튼 문구. 이어하기 불가(보관)면 null. */
  actionLabel: "열기" | "이어서 하기" | null;
  to: string | null;
  /** 이어하기 불가 안내(보관 행). */
  note: string | null;
};

export type StatusFilter = "all" | ReportStatusKey;

export const ALL_SUBJECTS = "전체";

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "confirmed", label: "확정" },
  { value: "open", label: "작성 중" },
  { value: "archived", label: "만료" },
];

const EMPTY = "-";

const STEP_PATHS: Record<ScreenStep, string> = {
  1: INQUIRY_PATHS.home,
  2: INQUIRY_PATHS.topics,
  3: INQUIRY_PATHS.design,
  4: INQUIRY_PATHS.write,
  5: INQUIRY_PATHS.evaluate,
  6: INQUIRY_PATHS.finalize,
};

export function resumePath(step: ScreenStep): string {
  return STEP_PATHS[step];
}

/** 서울 날짜 기준 YYYY.MM.DD. 해석할 수 없으면 "-". */
export function formatReportDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}.${pick("month")}.${pick("day")}`;
}

/** 열린 세션 행, 확정 행(최신순), 보관 행 순서. */
export function buildReportRows(list: ReportsList): ReportRow[] {
  const rows: ReportRow[] = [];

  if (list.open) {
    const o = list.open;
    rows.push({
      sessionId: o.sessionId,
      date: formatReportDate(o.lastActivityAt),
      subject: o.subject,
      topic: o.topicTitle ?? EMPTY,
      linkKind: EMPTY,
      score: EMPTY,
      statusKey: "open",
      statusLabel: "작성 중",
      actionLabel: "이어서 하기",
      to: resumePath(o.currentStep),
      note: null,
    });
  }

  for (const item of list.items) {
    rows.push({
      sessionId: item.sessionId,
      date: formatReportDate(item.completedAt),
      subject: item.subject,
      topic: item.topicTitle,
      linkKind: LINK_KIND_LABELS[item.linkKind],
      score: item.score.toFixed(1),
      statusKey: "confirmed",
      statusLabel: "확정",
      actionLabel: "열기",
      to: INQUIRY_PATHS.report(item.sessionId),
      note: null,
    });
  }

  for (const a of list.archived) {
    const terminal = a.terminal !== null;
    rows.push({
      sessionId: a.sessionId,
      date: formatReportDate(a.lastActivityAt),
      subject: a.subject,
      topic: a.topicTitle ?? EMPTY,
      linkKind: EMPTY,
      score: EMPTY,
      statusKey: "archived",
      statusLabel: terminal ? "종결" : "만료",
      actionLabel: null,
      to: null,
      note: terminal
        ? "종결된 세션이라 이어서 할 수 없어요"
        : "기간이 지나 만료돼 이어서 할 수 없어요",
    });
  }

  return rows;
}

export function subjectFilterOptions(rows: ReportRow[]): string[] {
  return [ALL_SUBJECTS, ...new Set(rows.map((r) => r.subject))];
}

export function applyFilters(
  rows: ReportRow[],
  subject: string,
  status: StatusFilter,
): ReportRow[] {
  return rows.filter(
    (r) =>
      (subject === ALL_SUBJECTS || r.subject === subject) &&
      (status === "all" || r.statusKey === status),
  );
}
