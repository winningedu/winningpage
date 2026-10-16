// 서버 계약(GET /api/admin/inquiry-sessions)의 행 모양과 표시 변환.
export type InquiryTerminal = {
  reason: string;
  at: string;
  mode: string;
};

export type InquiryModeState = {
  status: string;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  issues: unknown[];
};

export type InquirySessionItem = {
  id: string;
  profileId: string;
  studentName: string | null;
  email: string | null;
  status: string;
  currentStep: number;
  subject: string;
  topicTitle: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  ledgerId: string | null;
  ledgerReversedAt: string | null;
  terminal: InquiryTerminal | null;
  generation: {
    modes: Record<string, InquiryModeState>;
    terminal: InquiryTerminal | null;
  };
  evaluationCount: number;
  topicRoundCount: number;
};

export const INQUIRY_STEP_COUNT = 6;

export const INQUIRY_STATUS_OPTIONS = [
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

// 서버 GenerationMode 와 같은 순서.
const MODE_LABELS: [string, string][] = [
  ["topic_recommendation", "주제 추천"],
  ["design_report", "설계 리포트"],
  ["evaluation_report", "평가 리포트"],
];

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function stepLabel(step: number): string {
  return `${step}/${INQUIRY_STEP_COUNT}`;
}

export function ledgerLabel(
  row: Pick<InquirySessionItem, "ledgerId" | "ledgerReversedAt">,
): string {
  if (!row.ledgerId) return "없음";
  return row.ledgerReversedAt ? "복구됨" : "차감";
}

function modeLabel(mode: string): string {
  return MODE_LABELS.find(([key]) => key === mode)?.[1] ?? mode;
}

export function terminalLabel(terminal: InquiryTerminal | null): string {
  if (!terminal) return "-";
  return `${terminal.reason} (${modeLabel(terminal.mode)})`;
}

export function canRecover(
  row: Pick<InquirySessionItem, "status" | "terminal">,
): boolean {
  return row.status === "archived" && row.terminal !== null;
}

function issueText(issue: unknown): string {
  return typeof issue === "string" ? issue : JSON.stringify(issue);
}

export type InquiryModeRow = {
  mode: string;
  label: string;
  status: string;
  attempts: number;
  issues: string[];
};

export function modeRows(row: InquirySessionItem): InquiryModeRow[] {
  return MODE_LABELS.map(([mode, label]) => {
    const state = row.generation.modes[mode];
    return {
      mode,
      label,
      status: state?.status ?? "pending",
      attempts: state?.attempts ?? 0,
      issues: (state?.issues ?? []).map(issueText),
    };
  });
}
