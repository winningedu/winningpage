// 서버 계약(GET /api/admin/growth-reports)의 행 모양과 표시 변환.
export type GrowthReportTerminal = {
  reason: string;
  at: string;
  step: number;
};

export type GrowthReportProgress = {
  step: number;
  label: string;
  status: string;
  attempts: number;
};

export type GrowthReportItem = {
  id: string;
  profileId: string;
  studentName: string | null;
  email: string | null;
  status: string;
  currentStep: number;
  track: string | null;
  issuedAt: string | null;
  lastActivityAt: string | null;
  ledgerId: string | null;
  ledgerReversedAt: string | null;
  terminal: GrowthReportTerminal | null;
  progress: GrowthReportProgress[];
};

export const GROWTH_STEP_COUNT = 8;

export const GROWTH_STATUS_OPTIONS = [
  "draft",
  "in_progress",
  "completed",
  "archived",
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  in_progress: "진행 중",
  completed: "완료",
  archived: "종결",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function stepLabel(step: number): string {
  return `${step}/${GROWTH_STEP_COUNT}`;
}

export function ledgerLabel(
  row: Pick<GrowthReportItem, "ledgerId" | "ledgerReversedAt">,
): string {
  if (!row.ledgerId) return "없음";
  return row.ledgerReversedAt ? "복구됨" : "차감";
}

export function terminalLabel(terminal: GrowthReportTerminal | null): string {
  if (!terminal) return "-";
  return `${terminal.reason} (${terminal.step}단계)`;
}

export function canRecover(
  row: Pick<GrowthReportItem, "status" | "terminal">,
): boolean {
  return row.status === "archived" && row.terminal !== null;
}
