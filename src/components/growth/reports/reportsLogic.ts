import type {
  LastTerminal,
  OpenReportSummary,
  ReportListItem,
} from "@/lib/growth/api";
import { GROWTH_PATHS } from "../growthPaths";

/**
 * 미완 회차의 이어하기 목적지.
 * 목록 응답의 open 에는 설문 답 수가 없어 설문 완료 여부를 알 수 없다. 생성이 시작되기 전이면
 * 학생 조사 화면으로 보내고, 그 화면이 저장된 진행 위치로 복원한다.
 */
export function openTarget(open: OpenReportSummary): string {
  return open.currentStep > 0 ? GROWTH_PATHS.generate : GROWTH_PATHS.survey;
}

export type OpenCardView = {
  statusLabel: "작성 중" | "생성 중";
  progressLabel: string;
};

export function deriveOpenCard(open: OpenReportSummary): OpenCardView {
  if (open.currentStep === 0) {
    return { statusLabel: "작성 중", progressLabel: "학생 조사 중" };
  }
  const done = open.progress.filter((p) => p.status === "done").length;
  return {
    statusLabel: "생성 중",
    progressLabel: `${open.progress.length}단계 중 ${done}단계 완료`,
  };
}

function issuedTime(item: ReportListItem): number | null {
  if (!item.issuedAt) return null;
  const t = new Date(item.issuedAt).getTime();
  return Number.isNaN(t) ? null : t;
}

/** 발행일 내림차순. 발행일이 없는 항목은 뒤로 보낸다. 원본은 바꾸지 않는다. */
export function sortReportItems(items: ReportListItem[]): ReportListItem[] {
  return [...items].sort((a, b) => {
    const ta = issuedTime(a);
    const tb = issuedTime(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  });
}

/** 실행계획 경로는 서버가 최신 완료 회차를 쓰므로 정렬 후 첫 카드만 활성이다. */
export function planAvailability(index: number): {
  enabled: boolean;
  href: string | null;
} {
  return index === 0
    ? { enabled: true, href: GROWTH_PATHS.plan }
    : { enabled: false, href: null };
}

/** 종결 안내. 종결 뒤에 새 미완 회차가 시작돼 있으면 이어하기 카드가 우선이라 숨긴다. */
export function terminalNotice(
  lastTerminal: LastTerminal | null,
  open: OpenReportSummary | null,
): { reason: string; at: string } | null {
  if (!lastTerminal) return null;
  if (
    open &&
    new Date(open.lastActivityAt).getTime() >
      new Date(lastTerminal.at).getTime()
  ) {
    return null;
  }
  return { reason: lastTerminal.reason, at: lastTerminal.at };
}

/** `2026년 11월 14일`. 잘못된 값이면 빈 문자열. */
export function formatKoreanDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
