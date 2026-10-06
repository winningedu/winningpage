import type { StepProgress } from "@/lib/growth/api";
import type { GenerationState } from "./generationEngine";
import { STEP_LABELS } from "./stepLabels";

// 리포트 생성 화면의 표시 규칙(순수). 훅 상태를 문구와 배지로 바꾼다.

export const MAX_ATTEMPTS = 10;
export const PRICING_PATH = "/pricing?service=growth";

export type StepBadge = "완료" | "진행 중" | "대기" | "실패";
export type GenerationAction = "retry" | "start" | "pricing" | "report";

export function completedCount(progress: StepProgress[]): number {
  return progress.filter((p) => p.status === "done").length;
}

export function stepBadge(state: GenerationState, step: number): StepBadge {
  if (state.progress.find((p) => p.step === step)?.status === "done") {
    return "완료";
  }
  if (step !== state.currentStep) return "대기";
  if (state.phase === "running" || state.phase === "waiting") return "진행 중";
  if (state.phase === "failed" || state.phase === "terminal") return "실패";
  return "대기";
}

export type GenerationNotice = {
  tone: "info" | "error" | "success";
  title: string;
  body: string;
  action: GenerationAction | null;
  /** "n / 10". 실패류에만 있다. */
  attemptsLabel: string | null;
  issues: string[];
};

export function summarizeIssues(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  const out: string[] = [];
  for (const issue of issues) {
    let text: string | null = null;
    if (typeof issue === "string") text = issue;
    else if (typeof issue === "object" && issue !== null) {
      const o = issue as Record<string, unknown>;
      for (const key of ["message", "reason", "description"]) {
        if (typeof o[key] === "string") {
          text = o[key] as string;
          break;
        }
      }
    }
    if (text && text.trim() !== "") out.push(text.trim());
    if (out.length === 3) break;
  }
  return out;
}

function stepName(step: number): string {
  return `${step}단계 ${STEP_LABELS[step] ?? ""}`.trim();
}

/** 진행 중이고 안내할 것이 없으면 null. resumedDone 은 화면에 들어올 때 이미 끝나 있던 단계 수다. */
export function describeGeneration(
  state: GenerationState,
  resumedDone: number,
): GenerationNotice | null {
  const base = { action: null, attemptsLabel: null, issues: [] as string[] };
  const attemptsLabel =
    state.attempts > 0 ? `${state.attempts} / ${MAX_ATTEMPTS}` : null;
  const code = state.errorCode;

  switch (state.phase) {
    case "idle":
      return null;
    case "running":
      if (resumedDone > 0) {
        return {
          ...base,
          tone: "info",
          title: `${resumedDone}단계까지 만들어 두었어요`,
          body: `창을 닫아 멈췄던 곳부터 이어서 만들어요. ${stepName(state.currentStep)}을 진행하고 있어요.`,
        };
      }
      return null;
    case "waiting":
      return {
        ...base,
        tone: "info",
        title: `${stepName(state.currentStep)}을 만들고 있어요`,
        body: "같은 단계가 이미 진행 중이에요. 잠시 뒤 자동으로 이어서 확인해요.",
      };
    case "done":
      return {
        ...base,
        tone: "success",
        title: "리포트가 완성됐어요",
        body: "잠시 뒤 리포트로 이동해요.",
        action: "report",
      };
    case "failed": {
      if (code === "NO_ENTITLEMENT") {
        return {
          ...base,
          tone: "error",
          title: "이용권이 필요해요",
          body: `이용권을 구입한 뒤 돌아오면 ${state.currentStep}단계부터 이어서 만들어요.`,
          action: "pricing",
        };
      }
      if (code === "STEP_VALIDATION_FAILED") {
        return {
          tone: "error",
          title: `${stepName(state.currentStep)} 결과가 검증을 통과하지 못했어요`,
          body: "검증에 걸려 다시 요청했지만 통과하지 못했어요. 다시 시도해 주세요.",
          action: "retry",
          attemptsLabel,
          issues: summarizeIssues(state.issues),
        };
      }
      return {
        tone: "error",
        title: `${stepName(state.currentStep)}에서 응답을 받지 못했어요`,
        body: `다시 시도하면 ${state.currentStep}단계부터 이어서 만들어요.`,
        action: "retry",
        attemptsLabel,
        issues: [],
      };
    }
    case "terminal": {
      const money = state.charged
        ? "이용권은 복구됐어요."
        : "이용권은 차감되지 않았어요.";
      if (code === "REPORT_LOCKED") {
        return {
          ...base,
          tone: "error",
          title: "이 회차는 더 진행할 수 없어요",
          body: `이미 닫힌 회차예요. ${money}`,
          action: "start",
        };
      }
      return {
        tone: "error",
        title: "시도 횟수 10회를 모두 썼어요",
        body: `이 회차는 더 진행할 수 없어요. ${money}`,
        action: "start",
        attemptsLabel,
        issues: [],
      };
    }
  }
}

export function entitlementStatus(
  state: GenerationState,
): { label: string; note: string | null } | null {
  const charged =
    state.charged ??
    (state.progress.find((p) => p.step === 1)?.status === "done" ? true : null);
  if (state.phase === "terminal") {
    return charged
      ? { label: "복구됨", note: "1회 되돌림" }
      : { label: "차감 안 됨", note: null };
  }
  if (charged) return { label: "사용 중", note: "1회 차감" };
  return null;
}
