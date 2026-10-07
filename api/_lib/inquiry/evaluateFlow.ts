// 평가 요청의 순수 판단(부록 B 3번, 개발계획 §2 18~20). DB 와 모델 호출은 핸들러와 evaluateDb 가 한다.
import { CHECKLIST, MIN_SUBMISSION_CHARS, SECTIONS } from "./constants.js";
import { dropDeniedCausalErrors } from "./coreErrorGuard.js";
import { sourceLines } from "./extract.js";
import type { buildEvaluationPrompt } from "./prompts.js";
import {
  type AppFacts,
  buildEvaluation,
  type ModelEvaluation,
  validateModelEvaluationShape,
} from "./scoring.js";
import { canEvaluate, gateFor } from "./session.js";
import {
  checkSubmissionForEvaluation,
  type EvaluationCheck,
  stripPlaceholders,
} from "./submission.js";
import type {
  EvaluationReport,
  GradeLabel,
  LinkageType,
  SectionPlan,
  SessionStatus,
  SubmissionSections,
  ValidationIssue,
} from "./types.js";
import {
  buildRetryNote,
  TRUNCATED_RETRY_NOTE,
  validateEvaluationResponse,
} from "./validation.js";

export type FlowError = {
  ok: false;
  status: number;
  code: string;
  message: string;
  extra?: Record<string, unknown>;
};

const GATE_MESSAGES = {
  SESSION_NOT_OPEN: "이미 닫힌 세션이에요.",
  SESSION_LOCKED: "이미 확정된 세션이에요.",
  STEP_ORDER: "설계 리포트를 먼저 만들어 주세요.",
} as const;

type PassedCheck = Extract<EvaluationCheck, { ok: true }>;

/** 평가 전 검사. 모델을 부르기 전에 걸러내므로 실패해도 차감과 시도 횟수에 영향이 없다. */
export function precheckEvaluation(input: {
  session: {
    selectedTopicId: string | null;
    designReportId: string | null;
    latestEvaluationId: string | null;
    status: SessionStatus;
    evaluationCount: number;
  };
  draftSections: SubmissionSections | null;
}): { ok: true; check: PassedCheck } | FlowError {
  const gate = gateFor(input.session, "evaluation_report");
  if (!gate.ok) {
    return {
      ok: false,
      status: 409,
      code: gate.code,
      message: GATE_MESSAGES[gate.code],
    };
  }
  if (!input.draftSections) {
    return {
      ok: false,
      status: 409,
      code: "NO_SUBMISSION",
      message: "작성한 보고서가 없어요. 먼저 보고서를 저장해 주세요.",
    };
  }
  const check = checkSubmissionForEvaluation(input.draftSections);
  if (!check.ok) {
    if (check.code === "SECTION_EMPTY") {
      return {
        ok: false,
        status: 422,
        code: "SECTION_EMPTY",
        message:
          "비어 있는 절이 있어요. 8개 절을 모두 채워 주세요. 평가 횟수는 차감되지 않아요.",
        extra: { sections: check.sections },
      };
    }
    return {
      ok: false,
      status: 422,
      code: "SUBMISSION_TOO_SHORT",
      message: `분량이 부족해요. Ⅰ~Ⅶ절 합계가 ${MIN_SUBMISSION_CHARS}자 이상이어야 평가할 수 있어요. 평가 횟수는 차감되지 않아요.`,
      extra: { total: check.total, minimum: MIN_SUBMISSION_CHARS },
    };
  }
  if (!canEvaluate(input.session.evaluationCount).ok) {
    return {
      ok: false,
      status: 409,
      code: "REEVALUATION_LIMIT",
      message: "평가는 최초 1회와 재평가 3회까지 받을 수 있어요.",
    };
  }
  return { ok: true, check };
}

type PromptInput = Omit<
  Parameters<typeof buildEvaluationPrompt>[0],
  "retryNotes"
>;

/** buildEvaluationPrompt 입력(재요청 메모 제외). 모델에는 자리표시자를 지운 본문을 넘긴다(No.78). */
export function buildPromptInput(input: {
  grade: GradeLabel;
  subject: string;
  topic: PromptInput["topic"];
  design: { sections: SectionPlan[] };
  sections: SubmissionSections;
  check: PassedCheck;
  linkageType: LinkageType;
}): PromptInput {
  return {
    grade: input.grade,
    subject: input.subject,
    topic: input.topic,
    design: {
      sections: input.design.sections.map((s) => ({ id: s.id, must: s.must })),
      checklistIds: CHECKLIST.map((c) => c.id),
    },
    submission: stripPlaceholders(input.sections),
    counts: input.check.counts,
    placeholders: input.check.placeholders,
    isProvisional: input.linkageType === "interest_based_provisional",
  };
}

/** 재요청 메모. 잘림이면 분량 축소 문구만, 아니면 검증 문제 목록(부록 B-1 retryPrompt). */
export function retryNotesFor(
  issues: ValidationIssue[],
  truncated: boolean,
): string[] {
  return truncated ? [TRUNCATED_RETRY_NOTE] : buildRetryNote(issues);
}

/** 점수 계산에 쓰는 앱 사실. 글자 수는 판정용이라 자리표시자를 뺀 값이다. */
export function buildAppFacts(input: {
  sections: SubmissionSections;
  check: PassedCheck;
  designSourceTableRows: number;
  isProvisional: boolean;
}): AppFacts {
  const intro = SECTIONS.find((s) => s.id === "I")?.recommendedChars;
  if (intro == null) throw new Error("SECTIONS 의 I 절 권장 분량이 없습니다.");
  const { sections } = input;
  const judged = stripPlaceholders(sections);
  return {
    counts: input.check.strippedCounts,
    placeholders: input.check.placeholders,
    introMinChars: intro,
    questionText: sections.II,
    hasNumbersInResults: /[0-9]/.test(`${judged.IV}\n${judged.V}`),
    sourceLineCount: sourceLines(sections.VIII).length,
    isProvisional: input.isProvisional,
    designSourceTableRows: input.designSourceTableRows,
  };
}

/** 모델 응답 검증. 응답 검증기와 평가 계약 모양 검사를 둘 다 통과해야 ok 다. */
export function validateEvaluation(
  value: unknown,
):
  | { ok: true; value: ModelEvaluation }
  | { ok: false; issues: ValidationIssue[] } {
  const checked = validateEvaluationResponse(value);
  if (!checked.ok) return { ok: false, issues: checked.issues };
  const shaped = validateModelEvaluationShape(checked.evaluation);
  if (!shaped) {
    return {
      ok: false,
      issues: [
        {
          code: "evaluation_shape",
          message: "평가 응답이 정해진 모양과 달라요.",
        },
      ],
    };
  }
  // 인과를 부정한 문장을 인과 단정으로 읽은 오판은 목록에서 빼고, 점수는 buildEvaluation 이 다시 계산한다.
  return {
    ok: true,
    value: { ...shaped, coreErrors: dropDeniedCausalErrors(shaped.coreErrors) },
  };
}

export type EvaluationReportInsert = {
  session_id: string;
  profile_id: string;
  report_type: "evaluation";
  topic_id: string | null;
  submission_id: string;
  sections: EvaluationReport;
  score: number;
  label: string;
  model: string;
  prompt_version: string;
};

/** inquiry_reports 평가 행. 서버 계산(buildEvaluation)을 거친 본문만 저장한다. */
export function buildEvaluationRow(input: {
  sessionId: string;
  userId: string;
  submissionId: string;
  topicId: string | null;
  model: string;
  promptVersion: string;
  evaluation: ModelEvaluation;
  facts: AppFacts;
}): EvaluationReportInsert {
  const report = buildEvaluation(input.evaluation, input.facts);
  return {
    session_id: input.sessionId,
    profile_id: input.userId,
    report_type: "evaluation",
    topic_id: input.topicId,
    submission_id: input.submissionId,
    sections: report,
    score: report.total,
    label: report.label,
    model: input.model,
    prompt_version: input.promptVersion,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

/** 요청 본문 { sessionId }. */
export function parseEvaluateBody(
  body: unknown,
): { ok: true; sessionId: string } | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  }
  const { sessionId } = body as Record<string, unknown>;
  if (!isUuid(sessionId)) {
    return { ok: false, reason: "sessionId 가 올바르지 않아요." };
  }
  return { ok: true, sessionId };
}

/** inquiry_reports.prompt_version 에 남기는 평가 프롬프트 판. 프롬프트를 바꾸면 올린다. */
export const EVALUATION_PROMPT_VERSION = "inquiry-evaluation-v2";
