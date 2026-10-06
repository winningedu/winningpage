// 세션 응답 조립의 판단 부분(부록 A 1번). DB 없이 입력만 보고 결정하는 순수 함수다.
import {
  buildHandoff,
  type GrowthReportRow,
  type PlanItemRow,
  pickLatestCompleted,
} from "./growthHandoff.js";
import { canStartNewSession } from "./session.js";
import type { GradeLabel, GrowthHandoff, Semester } from "./types.js";

const GRADE_LABELS: readonly GradeLabel[] = ["고1", "고2", "고3"];
const MAX_TEXT_CHARS = 80;

/** 문자열을 고1~3 학년으로 읽는다. 졸업, N수, 빈 값은 null. */
export function asGradeLabel(
  value: string | null | undefined,
): GradeLabel | null {
  return GRADE_LABELS.find((g) => g === value) ?? null;
}

export type SessionInfo = {
  gradeLabel: GradeLabel;
  semester: Semester;
  career: string;
  subject: string;
};

export type SessionBody =
  | { action: "resume" }
  | { action: "create"; info: SessionInfo };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= MAX_TEXT_CHARS ? text : null;
}

/** POST /api/inquiry/session 요청 본문 검증. info 는 trim 해서 돌려준다. */
export function validateSessionBody(
  body: unknown,
): { ok: true; body: SessionBody } | { ok: false; reason: string } {
  if (!isRecord(body))
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  if (body.action === "resume") return { ok: true, body: { action: "resume" } };
  if (body.action !== "create") {
    return { ok: false, reason: "action 은 resume 또는 create 여야 해요." };
  }
  const raw = body.info;
  if (!isRecord(raw)) return { ok: false, reason: "info 가 필요해요." };

  const gradeLabel = GRADE_LABELS.find((g) => g === raw.gradeLabel);
  if (!gradeLabel) {
    return { ok: false, reason: "학년은 고1, 고2, 고3 중 하나여야 해요." };
  }
  const semester =
    raw.semester === 1 || raw.semester === 2 ? raw.semester : null;
  if (semester === null) {
    return { ok: false, reason: "학기는 1 또는 2 여야 해요." };
  }
  const career = cleanText(raw.career);
  if (career === null) {
    return { ok: false, reason: "진로는 1자 이상 80자 이하로 적어 주세요." };
  }
  const subject = cleanText(raw.subject);
  if (subject === null) {
    return { ok: false, reason: "과목은 1자 이상 80자 이하로 적어 주세요." };
  }
  return {
    ok: true,
    body: { action: "create", info: { gradeLabel, semester, career, subject } },
  };
}

export type CreateDecision =
  | { kind: "create" }
  | { kind: "reuse"; sessionId: string; clearAssets: boolean }
  | { kind: "locked" }
  | { kind: "quota_exhausted" };

/**
 * create 요청의 처리 방식(부록 A 1번). 열린 세션이 있으면 설계 전까지 info 만 갱신한다.
 * 자산이 이미 있고 과목이 바뀌면 자산을 비운다. 없으면 잔여 회차로 새로 만들 수 있는지 본다.
 */
export function decideCreate(input: {
  openSession: {
    id: string;
    designReportId: string | null;
    subject: string;
    assetCount: number;
  } | null;
  quotaRemaining: number | null;
  info: SessionInfo;
}): CreateDecision {
  const { openSession } = input;
  if (openSession) {
    if (openSession.designReportId) return { kind: "locked" };
    return {
      kind: "reuse",
      sessionId: openSession.id,
      clearAssets:
        openSession.assetCount > 0 &&
        openSession.subject !== input.info.subject,
    };
  }
  const gate = canStartNewSession({
    openSession: false,
    quotaRemaining: input.quotaRemaining,
  });
  return gate.ok ? { kind: "create" } : { kind: "quota_exhausted" };
}

export type HandoffView = GrowthHandoff & {
  autoSelectedPlanItemId: string | null;
};

/**
 * 최신 완료 성장설계 회차의 수신 8종(부록 A 1번). 완료 회차가 없거나 학년을 알 수 없으면 null 이다.
 * 학년이 없으면 단계 불일치를 계산할 수 없어 폴백 값을 만들지 않고 비운다.
 */
export function buildHandoffForSession(input: {
  reports: GrowthReportRow[];
  planItems: PlanItemRow[];
  sessionGrade: GradeLabel | null;
  subject: string;
  nowIso: string;
}): HandoffView | null {
  if (!input.sessionGrade) return null;
  const report = pickLatestCompleted(input.reports);
  if (!report) return null;
  return buildHandoff({
    report,
    planItems: input.planItems,
    sessionGrade: input.sessionGrade,
    subject: input.subject,
    nowIso: input.nowIso,
  });
}
