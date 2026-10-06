// 본문 생성 단계(계획서 §2 7, 명세 No.44~52). 입력 조립은 순수 함수, 실행은 db 와 deps 를 받는다.
// 생성 성공이 첫 차감 시점이다. 재생성은 최대 3회이고, 기존 생성본이 있을 때만 횟수를 올린다.

import {
  type Db,
  insertReport,
  loadReports,
  loadSessionActivities,
} from "../db.js";
import { confirmFeeling, plainText, relinkEdited } from "../editLink.js";
import { stageLabel } from "../growth.js";
import { extractPromptKeywords } from "../promptKeywords.js";
import { buildWritePrompt, type WritePromptInput } from "../prompts.js";
import type { ReportRow, SessionRow } from "../rows.js";
import {
  type ModelStepDeps,
  type Outcome,
  runModelStep,
  type SimpleOutcome,
  type StepSpec,
} from "../runModelStep.js";
import { guardStep } from "../session.js";
import { countChars } from "../text.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type Analysis,
  type CharCount,
  type GenerationSections,
  MAX_REGENERATIONS,
  SHORT_TARGET_MAX,
} from "../types.js";
import { validateWriteResponse } from "../validation.js";
import { detailBody } from "../view.js";
import { chargeAfterSuccess, checkChargeGate, needsCharge } from "./credit.js";
import {
  activeGrowth,
  activityNameOf,
  careerOf,
  isRecord,
  isUuid,
  readAnalysis,
  reportRowOut,
  splitActivities,
  touchSession,
} from "./shared.js";

/** 생성 완료 단계. 이 값 이상이어야 편집하고 느낌 문장을 확인할 수 있다. */
const GENERATED_STEP = 4;
const MAX_EDIT_PARAGRAPHS = 6;

export type WriteResult = {
  report: ReturnType<typeof reportRowOut>;
  charged: boolean;
  regenerationsLeft: number;
  currentStep: number;
};

type ModelWrite = { sections: GenerationSections; charCount: CharCount };

// ---------------------------------------------------------------------------
// 요청 본문
// ---------------------------------------------------------------------------

export type WriteBody =
  | { sessionId: string; action: "generate" }
  | { sessionId: string; action: "edit"; paragraphs: string[] }
  | { sessionId: string; action: "confirm-feeling"; sentenceId: string };

export function validateWriteBody(
  body: unknown,
): { ok: true; body: WriteBody } | { ok: false; message: string } {
  const bad = (message: string) => ({ ok: false as const, message });
  if (!isRecord(body)) return bad("요청 형식이 올바르지 않아요.");
  const { sessionId, action } = body;
  if (!isUuid(sessionId)) return bad("sessionId 형식이 올바르지 않아요.");
  if (action === "generate") return { ok: true, body: { sessionId, action } };
  if (action === "edit") {
    const { paragraphs } = body;
    if (
      !Array.isArray(paragraphs) ||
      paragraphs.length === 0 ||
      paragraphs.length > MAX_EDIT_PARAGRAPHS ||
      paragraphs.some((p) => typeof p !== "string")
    ) {
      return bad("paragraphs 형식이 올바르지 않아요.");
    }
    return {
      ok: true,
      body: { sessionId, action, paragraphs: paragraphs as string[] },
    };
  }
  if (action === "confirm-feeling") {
    const { sentenceId } = body;
    if (typeof sentenceId !== "string" || sentenceId === "") {
      return bad("sentenceId 가 필요해요.");
    }
    return { ok: true, body: { sessionId, action, sentenceId } };
  }
  return bad("action 은 generate, edit, confirm-feeling 중 하나여야 해요.");
}

// ---------------------------------------------------------------------------
// 입력 조립(순수)
// ---------------------------------------------------------------------------

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** 보조 활동 요약. 값이 있는 항목만 "라벨: 값" 으로 " / " 로 잇는다. */
function supportSummary(r: ActivityRecordLike): string {
  const parts: [string, string][] = [
    ["주제", r.topic ?? ""],
    ["개념", r.concept ?? ""],
    ["방법", r.method ?? ""],
    ["결과", r.result ?? ""],
    ["한계", r.limitation ?? ""],
    ["수치", asStrings(r.numbers).join(", ")],
    ["자료", asStrings(r.sources).join(", ")],
  ];
  return parts
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join(" / ");
}

export function buildWriteInput(
  session: SessionRow,
  core: { record: ActivityRecordLike; analysis: Analysis },
  supports: ActivityRecordLike[],
):
  | { ok: true; input: WritePromptInput }
  | { ok: false; code: "CONFLICTS_UNRESOLVED" } {
  // 충돌이 남아 있으면 모델이 어느 수치를 쓸지 정할 수 없다(명세 No.40).
  if (core.analysis.conflicts.some((c) => c.resolved === null)) {
    return { ok: false, code: "CONFLICTS_UNRESOLVED" };
  }
  if (session.area === null || session.school_prompt === null) {
    throw new Error("기본 입력이 비어 있는 세션은 생성할 수 없습니다.");
  }
  const snapshot = activeGrowth(session);
  const career = careerOf(session);
  return {
    ok: true,
    input: {
      core: {
        activityName: activityNameOf(core.record, session),
        analysis: core.analysis,
        activityId: core.record.id,
      },
      supports: supports.map((s) => ({
        activityId: s.id,
        activityName: activityNameOf(s, session),
        summary: supportSummary(s),
      })),
      area: session.area,
      subject: session.subject,
      activityName: session.activity_name,
      schoolPrompt: session.school_prompt,
      promptKeywords: extractPromptKeywords(session.school_prompt),
      teacherNote: session.teacher_note,
      targetChars: session.target_chars,
      mode: session.target_chars_mode,
      career: { career: career.career, department: career.department },
      growth:
        snapshot !== null && snapshot.narrativeTheme !== null
          ? {
              theme: snapshot.narrativeTheme,
              stageLabel: stageLabel(snapshot.stage),
              weakAxisGuidelines: snapshot.weakAxes.map((w) => w.guideline),
            }
          : null,
    },
  };
}

export function buildWriteSpec(
  session: SessionRow,
  core: { record: ActivityRecordLike; analysis: Analysis },
  supports: ActivityRecordLike[],
  regenerate: boolean,
):
  | { ok: true; spec: StepSpec<ModelWrite> }
  | { ok: false; code: "CONFLICTS_UNRESOLVED" } {
  const built = buildWriteInput(session, core, supports);
  if (!built.ok) return built;
  const { input } = built;
  const universities = careerOf(session).universities;
  const allowedFields = ANALYSIS_FIELDS.filter(
    (f) => core.analysis.sources[f] !== "empty",
  );
  return {
    ok: true,
    spec: {
      build: (retryNotes) => buildWritePrompt(input, retryNotes),
      validate: (value) => {
        const v = validateWriteResponse(value, {
          coreActivityId: core.record.id,
          supportActivityIds: supports.map((s) => s.id),
          allowedFields,
          targetChars: session.target_chars,
          mode: session.target_chars_mode,
          universities,
          shortMode:
            session.target_chars !== null &&
            session.target_chars <= SHORT_TARGET_MAX,
          expectedParagraphs: supports.length > 0 ? 4 : 3,
        });
        if (!v.ok) return v;
        return {
          ok: true,
          patch: {
            current_step: GENERATED_STEP,
            report: {
              report_type: "generation",
              sections: v.sections,
              char_count: v.charCount,
              score: null,
              mandatory_fixes: null,
            },
          },
          result: { sections: v.sections, charCount: v.charCount },
          softIssues: v.softIssues,
        };
      },
      ...(regenerate && { patchOnSuccess: { regenerate_increment: true } }),
    },
  };
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

export async function runWrite(
  db: Db,
  userId: string,
  session: SessionRow,
  reports: ReportRow[],
  deps: ModelStepDeps,
): Promise<Outcome<WriteResult>> {
  if (!guardStep(session.current_step, "write").ok) {
    return { kind: "order", currentStep: session.current_step };
  }
  // 첫 생성은 횟수를 쓰지 않고, 기존 생성본이 있을 때의 생성이 재생성이다(명세 No.17, No.51).
  const regenerate =
    detailBody(session, [], reports).reports.generation !== null;
  if (regenerate && session.regenerate_count >= MAX_REGENERATIONS) {
    return { kind: "regenerate_exhausted" };
  }

  const { core, supports } = splitActivities(
    await loadSessionActivities(db, userId, session.id),
  );
  const built = buildWriteSpec(
    session,
    { record: core.record, analysis: readAnalysis(core.analysis) },
    supports.map((s) => s.record),
    regenerate,
  );
  if (!built.ok) {
    return {
      kind: "rejected",
      status: 409,
      code: built.code,
      message: "아직 정하지 않은 수치 충돌이 있어요. 먼저 해소해 주세요.",
    };
  }

  // 선점 전에 막아야 거절된 요청이 시도 횟수를 올리지 않는다.
  const gate = await checkChargeGate(db, userId, session);
  if (gate !== null) return gate;

  const out = await runModelStep(
    db,
    userId,
    session,
    "write",
    deps,
    built.spec,
  );
  if (out.kind !== "ok") return out;

  const charged = needsCharge(session)
    ? await chargeAfterSuccess(db, userId, session.id, "selfeval:write-success")
    : true;

  const saved = detailBody(
    session,
    [],
    await loadReports(db, userId, session.id),
  ).reports.generation;
  if (saved === null) throw new Error("생성한 리포트를 읽지 못했습니다.");
  return {
    kind: "ok",
    result: {
      report: {
        id: saved.id,
        revision: saved.revision,
        sections: saved.sections,
        charCount: saved.charCount,
      },
      charged,
      regenerationsLeft:
        MAX_REGENERATIONS - session.regenerate_count - (regenerate ? 1 : 0),
      currentStep: Math.max(session.current_step, GENERATED_STEP),
    },
    attempts: out.attempts,
    softIssues: out.softIssues,
  };
}

/** 학생이 고친 문단을 문장으로 다시 나눠 edited 리포트로 쌓는다(명세 No.50). */
export async function saveEdit(
  db: Db,
  userId: string,
  session: SessionRow,
  base: GenerationSections,
  paragraphs: string[],
): Promise<SimpleOutcome<{ report: ReturnType<typeof reportRowOut> }>> {
  if (session.current_step < GENERATED_STEP) {
    return { kind: "order", currentStep: session.current_step };
  }
  const linked = relinkEdited(base, paragraphs);
  if (!linked.ok) {
    return {
      kind: "rejected",
      status: 400,
      code: linked.code,
      message: linked.message,
    };
  }
  return {
    kind: "done",
    result: { report: await saveEdited(db, userId, session, linked.sections) },
  };
}

/** 느낌 문장을 학생이 확인했다고 표시한 본문을 edited 리포트로 쌓는다(명세 No.49, No.57). */
export async function confirmFeelingSentence(
  db: Db,
  userId: string,
  session: SessionRow,
  base: GenerationSections,
  sentenceId: string,
): Promise<SimpleOutcome<{ report: ReturnType<typeof reportRowOut> }>> {
  if (session.current_step < GENERATED_STEP) {
    return { kind: "order", currentStep: session.current_step };
  }
  const exists = base.paragraphs.some((p) =>
    p.sentences.some((s) => s.id === sentenceId),
  );
  if (!exists) {
    return {
      kind: "rejected",
      status: 404,
      code: "SENTENCE_NOT_FOUND",
      message: "확인할 문장을 찾을 수 없어요.",
    };
  }
  return {
    kind: "done",
    result: {
      report: await saveEdited(
        db,
        userId,
        session,
        confirmFeeling(base, sentenceId),
      ),
    },
  };
}

async function saveEdited(
  db: Db,
  userId: string,
  session: SessionRow,
  sections: GenerationSections,
) {
  const row = await insertReport(db, userId, session.id, {
    report_type: "edited",
    sections,
    char_count: countChars(plainText(sections)),
    score: null,
    mandatory_fixes: null,
  });
  await touchSession(db, userId, session.id);
  return reportRowOut(row);
}
