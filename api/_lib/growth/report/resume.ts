// 성장설계 리포트 이어가기 크론(growth-resume)의 순수 판정 함수.
// DB 와 모델을 모른다. 어떤 회차를 이어갈지, 되돌림이 필요한지를 가려낸다.

import type { AdvanceOutcome } from "./advance.js";
import { nextStep, parseStepState, stepRecord } from "./stepState.js";
import { CLAIM_STALE_SECONDS, type StepNumber } from "./types.js";

export const RESUME_INTERVAL_MINUTES = 2;
export const RESUME_STALE_SECONDS = 120;
export const RESUME_BATCH = 3;

export type ResumeCandidateRow = {
  id: string;
  profile_id: string;
  status: string;
  step_state: unknown;
  last_activity_at: string;
};

export type ResumePick = {
  reportId: string;
  profileId: string;
  step: StepNumber;
};

export function pickResumable(
  rows: ResumeCandidateRow[],
  nowIso: string,
): ResumePick[] {
  const now = Date.parse(nowIso);
  const staleBefore = now - RESUME_STALE_SECONDS * 1000;
  const claimFresh = now - CLAIM_STALE_SECONDS * 1000;

  const candidates = rows
    .filter((r) => r.status === "in_progress")
    .filter((r) => Date.parse(r.last_activity_at) < staleBefore)
    .sort(
      (a, b) => Date.parse(a.last_activity_at) - Date.parse(b.last_activity_at),
    );

  const picks: ResumePick[] = [];
  const seenProfiles = new Set<string>();
  for (const r of candidates) {
    if (picks.length >= RESUME_BATCH) break;
    if (seenProfiles.has(r.profile_id)) continue;
    const state = parseStepState(r.step_state);
    if (state.terminal) continue;
    const step = nextStep(state);
    if (step === null) continue;
    const rec = stepRecord(state, step);
    if (
      rec.status === "running" &&
      rec.startedAt !== null &&
      Date.parse(rec.startedAt) > claimFresh
    )
      continue;
    seenProfiles.add(r.profile_id);
    picks.push({ reportId: r.id, profileId: r.profile_id, step });
  }
  return picks;
}

export type UnreversedRow = {
  id: string;
  profile_id: string;
  status: string;
  step_state: unknown;
  ledger_id: string | null;
  ledger_reversed_at: string | null;
};

/**
 * 종결 실패(step_state.terminal)로 archived 됐는데 차감이 되돌려지지 않은 회차.
 * 종결 직후 되돌림이 실패한 경우를 메운다. 90일 미활동 보관분은 되돌리지 않는다.
 */
export function pickUnreversed(
  rows: UnreversedRow[],
): { reportId: string; profileId: string }[] {
  return rows
    .filter(
      (r) =>
        r.status === "archived" &&
        parseStepState(r.step_state).terminal !== undefined &&
        r.ledger_id !== null &&
        r.ledger_reversed_at === null,
    )
    .map((r) => ({ reportId: r.id, profileId: r.profile_id }));
}

/** 로그와 응답 집계용 요약. */
export function summarizeOutcome(outcome: AdvanceOutcome): {
  kind: string;
  terminal: boolean;
} {
  const terminal =
    outcome.kind === "failure" || outcome.kind === "claim_error"
      ? outcome.terminal
      : false;
  return { kind: outcome.kind, terminal };
}
