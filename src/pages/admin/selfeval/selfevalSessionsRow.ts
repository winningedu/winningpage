// 서버 계약(GET /api/admin/selfeval-sessions)의 행 모양과 표시 변환.
export type SelfevalTerminal = {
  reason: string;
  at: string;
  step: string | null;
};

export type SelfevalProgress = {
  step: string;
  label: string;
  status: string;
  attempts: number;
};

export type SelfevalSessionItem = {
  id: string;
  profileId: string;
  studentName: string | null;
  email: string | null;
  status: string;
  currentStep: number;
  academicYear: number | null;
  semester: number | null;
  area: string | null;
  subject: string | null;
  activityName: string | null;
  regenerateCount: number;
  ledgerId: string | null;
  ledgerReversedAt: string | null;
  terminal: SelfevalTerminal | null;
  progress: SelfevalProgress[];
  lastActivityAt: string | null;
  completedAt: string | null;
};

export type SelfevalActivity = {
  activityRecordId: string;
  role: string;
  fitScore: number | null;
  analysisSource: string | null;
};

export type SelfevalReportRevision = {
  id: string;
  type: string;
  revision: number;
  score: number | null;
  createdAt: string;
};

export type SelfevalSessionDetail = {
  studentName: string | null;
  email: string | null;
  terminal: SelfevalTerminal | null;
  progress: SelfevalProgress[];
  activities: SelfevalActivity[];
  reports: SelfevalReportRevision[];
};

export const SELFEVAL_STEP_COUNT = 6;

export const SELFEVAL_STATUS_OPTIONS = [
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

const AREA_LABELS: Record<string, string> = {
  subject: "교과",
  autonomy: "자율",
  club: "동아리",
  career: "진로",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function areaLabel(area: string | null): string {
  if (!area) return "-";
  return AREA_LABELS[area] ?? area;
}

export function stepLabel(step: number): string {
  return `${step}/${SELFEVAL_STEP_COUNT}`;
}

export function ledgerLabel(
  row: Pick<SelfevalSessionItem, "ledgerId" | "ledgerReversedAt">,
): string {
  if (!row.ledgerId) return "없음";
  return row.ledgerReversedAt ? "복구됨" : "차감";
}

export function terminalLabel(terminal: SelfevalTerminal | null): string {
  if (!terminal) return "-";
  return terminal.step
    ? `${terminal.reason} (${terminal.step})`
    : terminal.reason;
}

export function canRecover(
  row: Pick<SelfevalSessionItem, "status" | "terminal">,
): boolean {
  return row.status === "archived" && row.terminal !== null;
}
