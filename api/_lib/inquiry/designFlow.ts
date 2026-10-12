// 설계 리포트 흐름의 판단 부분(개발계획 §2 12, 13, 15, 16, 부록 B 2번). DB 와 모델을 모르는 순수 함수다.
// 주제 선택 검증, 멱등과 잠금 판정, 프롬프트 입력 조립, 응답의 서버 고정값 덮어쓰기를 맡는다.

import { PERFORMANCE_MODEL } from "../ai/gemini.js";
import type { HandoffView, SessionInfo } from "./bootstrap.js";
import { NEEDS_CHECK } from "./constants.js";
import { gateFailure, type PrecheckResult } from "./generate.js";
import {
  INQUIRY_PROMPT_VERSION,
  type NewDesignReportRow,
} from "./generateDb.js";
import type { buildDesignPrompt } from "./prompts.js";
import {
  assetMaterial,
  gateSessionOf,
  promptHandoff,
  readSessionInfo,
} from "./recommendFlow.js";
import { gateFor } from "./session.js";
import type { DesignReport, Reliability, ValidationIssue } from "./types.js";
import { validateDesignResponse } from "./validation.js";
import {
  type AssetView,
  primaryAssetOf,
  type RecordRow,
  type SessionRow,
  type TopicView,
} from "./views.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DesignBody = { sessionId: string; topicId: string };

/** POST /api/inquiry/plan-report 본문 검증. */
export function validateDesignBody(
  body: unknown,
): { ok: true; body: DesignBody } | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.sessionId !== "string" || !UUID_RE.test(raw.sessionId)) {
    return { ok: false, reason: "sessionId 가 올바르지 않아요." };
  }
  if (typeof raw.topicId !== "string" || !UUID_RE.test(raw.topicId)) {
    return { ok: false, reason: "topicId 가 올바르지 않아요." };
  }
  return { ok: true, body: { sessionId: raw.sessionId, topicId: raw.topicId } };
}

export type DesignDecision =
  | { kind: "error"; status: number; code: string; message: string }
  | { kind: "done" }
  | { kind: "proceed"; retryCharge: boolean };

/**
 * 생성 전 결정(부록 B 2번). 세션이 열려 있어야 하고, 설계가 이미 있으면 같은 주제는 저장분을 돌려주는
 * 멱등 응답, 다른 주제는 잠금이다. 없으면 topicId 가 최신 라운드 후보여야 한다.
 * 세션이 draft 면 첫 추천 때 차감하지 못한 것이므로 차감을 다시 시도하게 한다.
 */
export function decideDesign(input: {
  session: SessionRow;
  topicId: string;
  latestRoundTopicIds: string[];
}): DesignDecision {
  const { session, topicId } = input;
  const gate = gateFor(
    { ...gateSessionOf(session), selectedTopicId: topicId },
    "design_report",
  );
  if (!gate.ok) {
    const { ok: _ok, ...err } = gateFailure(gate.code);
    return { kind: "error", ...err };
  }
  if (session.design_report_id) {
    if (session.selected_topic_id === topicId) return { kind: "done" };
    const { ok: _ok, ...err } = gateFailure("SESSION_LOCKED");
    return { kind: "error", ...err };
  }
  if (!input.latestRoundTopicIds.includes(topicId)) {
    return {
      kind: "error",
      status: 409,
      code: "TOPIC_NOT_IN_ROUND",
      message:
        "지금 보이는 주제 후보에 없는 주제예요. 주제를 다시 골라 주세요.",
    };
  }
  return { kind: "proceed", retryCharge: session.status === "draft" };
}

/** 러너의 선행 조건. 결정은 decideDesign 이 이미 했으므로 열림과 기본 정보만 다시 본다. */
export function precheckDesign(
  row: SessionRow,
  topicId: string,
): { ok: true; info: SessionInfo } | Extract<PrecheckResult, { ok: false }> {
  const gate = gateFor(
    { ...gateSessionOf(row), selectedTopicId: topicId },
    "design_report",
  );
  if (!gate.ok) return gateFailure(gate.code);
  const info = readSessionInfo(row);
  if (!info) {
    return {
      ok: false,
      status: 409,
      code: "STEP_ORDER",
      message: "기본 정보를 먼저 입력해 주세요.",
    };
  }
  return { ok: true, info };
}

type DesignPromptInput = Parameters<typeof buildDesignPrompt>[0];

/**
 * buildDesignPrompt 입력(재요청 문구 제외)을 조립한다. 출발 활동은 기본 자산이고 신뢰도도 그 값이다.
 * 자산이 없으면 신뢰도 C 로 보고 요약은 주제의 경로 출발점(관심 기반)을 쓴다.
 */
export function buildDesignInput(args: {
  info: SessionInfo;
  topic: TopicView;
  assets: AssetView[];
  records: RecordRow[];
  handoff: HandoffView | null;
  planItemId: string | null;
}): Omit<DesignPromptInput, "retryNotes"> {
  const primary = primaryAssetOf(args.assets);
  const recordById = new Map(args.records.map((r) => [r.id, r]));
  const summary =
    primary?.summary && primary.summary.trim() !== ""
      ? primary.summary
      : args.topic.detail.path.from;
  const handoff = promptHandoff(args.handoff, {
    grade: args.info.gradeLabel,
    planItemId: args.planItemId,
  });
  return {
    grade: args.info.gradeLabel,
    semester: args.info.semester,
    career: args.info.career,
    subject: args.info.subject,
    topic: {
      ...args.topic.detail,
      linkKind: args.topic.linkKind,
      fit: args.topic.fit,
    },
    primaryAsset: {
      summary,
      ...(primary
        ? assetMaterial(primary, recordById)
        : { concept: null, limitation: null }),
      reliability: primary?.reliability ?? "C",
    },
    handoff: handoff
      ? {
          stageLabel: handoff.stageLabel,
          planItemTitle: handoff.planItemTitle,
        }
      : null,
  };
}

/** 응답의 자료 출처표 source, asOf 는 서버가 확인 필요로 고정한다(§2 16). */
export function finalizeDesign(design: DesignReport): DesignReport {
  return {
    ...design,
    sourceTable: design.sourceTable.map((row) => ({
      ...row,
      source: NEEDS_CHECK,
      asOf: NEEDS_CHECK,
    })),
  };
}

/** 러너의 validate 어댑터. 신뢰도 B, C 의 Ⅰ절 검사를 위해 신뢰도를 받는다. */
export function designValidator(reliability: Reliability) {
  return (
    value: unknown,
  ):
    | { ok: true; value: DesignReport }
    | { ok: false; issues: ValidationIssue[] } => {
    const r = validateDesignResponse(value, { reliability });
    return r.ok
      ? { ok: true, value: finalizeDesign(r.design) }
      : { ok: false, issues: r.issues };
  };
}

export function designReportRow(
  sessionId: string,
  userId: string,
  topicId: string,
  design: DesignReport,
): NewDesignReportRow {
  return {
    session_id: sessionId,
    profile_id: userId,
    report_type: "design",
    topic_id: topicId,
    sections: design,
    model: PERFORMANCE_MODEL,
    prompt_version: INQUIRY_PROMPT_VERSION,
  };
}
