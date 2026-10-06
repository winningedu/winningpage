// 주제 추천 흐름의 판단 부분(개발계획 §2 9, 10, 24, 부록 B 1번). DB 와 모델을 모르는 순수 함수다.
// 선행 조건, 프롬프트 입력 조립, 응답에 서버 고정값 붙이기, 차감 결정을 맡는다.

import { STAGE_LINK_RULES, TOPIC_MAX_ROUNDS } from "./constants.js";
import type { NewTopicRow } from "./generateDb.js";
import { gateFailure, type PrecheckResult } from "./generate.js";
import {
  asGradeLabel,
  type HandoffView,
  type SessionInfo,
} from "./bootstrap.js";
import type { buildTopicsPrompt } from "./prompts.js";
import { gateFor, nextRound } from "./session.js";
import { fitFor, sortTopicsByFit, stageLabel, stageOf } from "./stage.js";
import type {
  GradeLabel,
  LinkageType,
  LinkKind,
  SessionStatus,
  TopicDetail,
  Fit,
} from "./types.js";
import type { ModelTopic } from "./validation.js";
import type { AssetView, RecordRow, SessionRow, TopicRow } from "./views.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 직접 입력한 기준 주제의 길이 상한(한 줄 자산 상한 No.32 와 같은 200자). */
const SEED_TOPIC_MAX_CHARS = 200;

export type RecommendBody = { sessionId: string; seedTopic: string | null };

/** POST /api/inquiry/recommend-topics 본문 검증. seedTopic 은 trim 하고 비면 null. */
export function validateRecommendBody(
  body: unknown,
): { ok: true; body: RecommendBody } | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.sessionId !== "string" || !UUID_RE.test(raw.sessionId)) {
    return { ok: false, reason: "sessionId 가 올바르지 않아요." };
  }
  if (raw.seedTopic === undefined || raw.seedTopic === null) {
    return { ok: true, body: { sessionId: raw.sessionId, seedTopic: null } };
  }
  if (typeof raw.seedTopic !== "string") {
    return { ok: false, reason: "seedTopic 은 문자열이어야 해요." };
  }
  const seed = raw.seedTopic.trim();
  if (Array.from(seed).length > SEED_TOPIC_MAX_CHARS) {
    return {
      ok: false,
      reason: `기준 주제는 ${SEED_TOPIC_MAX_CHARS}자까지 적을 수 있어요.`,
    };
  }
  return {
    ok: true,
    body: { sessionId: raw.sessionId, seedTopic: seed === "" ? null : seed },
  };
}

/** 세션 행에서 생성에 필요한 기본 정보를 읽는다. 하나라도 비면 null(값을 지어내지 않는다). */
export function readSessionInfo(row: SessionRow): SessionInfo | null {
  const gradeLabel = asGradeLabel(row.grade_label);
  const semester =
    row.semester === 1 || row.semester === 2 ? row.semester : null;
  const career = row.career?.trim() ?? "";
  const subject = row.subject.trim();
  if (!gradeLabel || semester === null || career === "" || subject === "") {
    return null;
  }
  return { gradeLabel, semester, career, subject };
}

export function gateSessionOf(row: SessionRow) {
  return {
    selectedTopicId: row.selected_topic_id,
    designReportId: row.design_report_id,
    latestEvaluationId: row.latest_evaluation_id,
    status: row.status as SessionStatus,
  };
}

/** 추천 선행 조건: 세션 열림과 잠금, 기본 정보, 라운드 상한(부록 B 1번). */
export function precheckTopics(
  row: SessionRow,
):
  | { ok: true; round: number; info: SessionInfo }
  | Extract<PrecheckResult, { ok: false }> {
  const gate = gateFor(gateSessionOf(row), "topic_recommendation");
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
  const round = nextRound(row.topic_round_count);
  if (!round.ok) {
    return {
      ok: false,
      status: 409,
      code: round.code,
      message: "주제를 다시 추천받을 수 있는 횟수를 모두 사용했어요.",
      extra: { maxRounds: TOPIC_MAX_ROUNDS },
    };
  }
  return { ok: true, round: round.round, info };
}

const hasSummary = (a: AssetView): boolean =>
  a.summary !== null && a.summary.trim() !== "";

/** 쓸 수 있는 자산(요약이 있는 것)이 없으면 예비 주제다(No.4, §2 5). */
export function isProvisional(assets: AssetView[]): boolean {
  return !assets.some(hasSummary);
}

type TopicsPromptInput = Parameters<typeof buildTopicsPrompt>[0];

/** 성장설계 수신값을 프롬프트용으로 줄인다. 단계는 세션 학년으로 정한다(No.44). */
export function promptHandoff(
  handoff: HandoffView | null,
  ctx: { grade: GradeLabel; planItemId: string | null },
): NonNullable<TopicsPromptInput["handoff"]> | null {
  if (!handoff) return null;
  return {
    theme: handoff.theme,
    stageLabel: stageLabel(stageOf(ctx.grade)),
    subthemeText:
      handoff.subthemes.find((s) => s.grade === ctx.grade)?.text ?? null,
    weakAxes: handoff.weakAxes,
    planItemTitle:
      handoff.planItems.find((i) => i.id === ctx.planItemId)?.title ?? null,
  };
}

/**
 * 자산에서 프롬프트에 싣는 연계 재료. 기록은 개념과 한계, 인터뷰는 학생이 고른 빈틈을 한계 칸에 싣는다.
 * 한 줄 입력은 재료가 없다.
 */
export function assetMaterial(
  a: AssetView,
  recordById: ReadonlyMap<string, RecordRow>,
): { concept: string | null; limitation: string | null } {
  if (a.kind === "record") {
    const rec = a.activityRecordId
      ? recordById.get(a.activityRecordId)
      : undefined;
    return {
      concept: rec?.concept ?? null,
      limitation: rec?.limitation ?? null,
    };
  }
  if (a.kind === "interview" && a.gaps.length > 0) {
    return { concept: null, limitation: a.gaps.join(", ") };
  }
  return { concept: null, limitation: null };
}

/**
 * buildTopicsPrompt 입력(재요청 문구 제외)을 조립한다. 요약이 없는 자산은 쓰지 않고,
 * 쓸 자산이 없으면 예비 주제로 보낸다. 인터뷰의 한계 칸에는 학생이 고른 빈틈을 싣는다.
 */
export function buildTopicsInput(args: {
  info: SessionInfo;
  assets: AssetView[];
  records: RecordRow[];
  excludedTitles: string[];
  seedTopic: string | null;
  handoff: HandoffView | null;
  planItemId: string | null;
}): Omit<TopicsPromptInput, "retryNotes"> {
  const recordById = new Map(args.records.map((r) => [r.id, r]));
  const sorted = [...args.assets]
    .sort((a, b) => a.position - b.position)
    .filter(hasSummary);
  const rules = STAGE_LINK_RULES[args.info.gradeLabel];
  return {
    grade: args.info.gradeLabel,
    semester: args.info.semester,
    career: args.info.career,
    subject: args.info.subject,
    assets: sorted.map((a) => ({
      kind: a.kind,
      reliability: a.reliability,
      summary: a.summary ?? "",
      ...assetMaterial(a, recordById),
    })),
    primaryAssetIndex: 0,
    excludedTitles: args.excludedTitles,
    seedTopic: args.seedTopic,
    recommendedKinds: [...rules.recommended],
    discouragedKinds: [...rules.discouraged],
    handoff: promptHandoff(args.handoff, {
      grade: args.info.gradeLabel,
      planItemId: args.planItemId,
    }),
  };
}

export type FinalTopic = {
  idx: number;
  linkKind: LinkKind;
  linkageType: LinkageType;
  fit: Fit;
  detail: TopicDetail;
};

/**
 * 응답 주제 3개에 서버 고정값을 붙인다(No.124). 적합도와 연계 허용값은 서버 계산값이고,
 * 비권장 유형일 때만 모델의 fitReason 을 남기며, 확인 질문은 예비 주제에만 남긴다.
 * 권장 먼저 정렬하고 idx 를 1부터 매긴다.
 */
export function finalizeTopics(
  topics: ModelTopic[],
  opts: { grade: GradeLabel; provisional: boolean },
): FinalTopic[] {
  const linkageType: LinkageType = opts.provisional
    ? "interest_based_provisional"
    : "direct";
  const withFit = topics.map(({ linkKind, ...rest }) => {
    const fit = fitFor(opts.grade, linkKind);
    return {
      linkKind,
      linkageType,
      fit,
      detail: {
        ...rest,
        fitReason: fit === "off" ? rest.fitReason : null,
        followUpQuestions: opts.provisional ? rest.followUpQuestions : [],
      } satisfies TopicDetail,
    };
  });
  return sortTopicsByFit(withFit).map((t, i) => ({ idx: i + 1, ...t }));
}

export function topicRowsOf(
  sessionId: string,
  userId: string,
  round: number,
  topics: FinalTopic[],
): NewTopicRow[] {
  return topics.map((t) => ({
    session_id: sessionId,
    profile_id: userId,
    round,
    idx: t.idx,
    link_kind: t.linkKind,
    linkage_type: t.linkageType,
    fit: t.fit,
    detail: t.detail,
  }));
}

/** 차감 결과 해석. 거절과 예외(null)는 막지 않고 charged false 로 통과한다(§2 10). */
export function interpretCharge(
  result: { status: string; charged: boolean } | null,
): { charged: boolean; markInProgress: boolean } {
  const charged =
    result !== null && (result.charged || result.status === "already_charged");
  return { charged, markInProgress: charged };
}

/**
 * 저장 직후 차감까지의 순서. 세션이 draft(차감 이력 없음)일 때만 차감을 시도한다.
 * 저장이 던지면 차감하지 않고 그대로 던진다.
 */
export async function persistRecommendation(
  io: {
    saveTopicRound: (rows: NewTopicRow[]) => Promise<TopicRow[]>;
    consume: () => Promise<{ status: string; charged: boolean }>;
    markInProgress: () => Promise<void>;
  },
  input: { status: string; rows: NewTopicRow[] },
): Promise<{ topics: TopicRow[]; charged: boolean }> {
  const topics = await io.saveTopicRound(input.rows);
  if (input.status !== "draft") return { topics, charged: false };
  let result: { status: string; charged: boolean } | null = null;
  try {
    result = await io.consume();
  } catch (e) {
    console.error("inquiry 차감 실패:", e);
  }
  const decision = interpretCharge(result);
  if (!decision.charged && result !== null) {
    console.warn("inquiry 차감 거절:", result.status);
  }
  if (decision.markInProgress) await io.markInProgress();
  return { topics, charged: decision.charged };
}
