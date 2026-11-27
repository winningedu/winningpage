// 본문 생성 단계(계획서 §2 7, 명세 No.44~52). 입력 조립은 순수 함수, 실행은 db 와 deps 를 받는다.
// 생성 성공이 첫 차감 시점이다. 재생성은 최대 3회이고, 기존 생성본이 있을 때만 횟수를 올린다.

import {
  type Db,
  insertReport,
  loadReports,
  loadSessionActivities,
} from "../db.js";
import {
  confirmFeeling,
  plainText,
  relinkEdited,
  repickEvidence,
} from "../editLink.js";
import { loadEvidenceRows, saveMemoBelongsTo } from "../evidenceDb.js";
import { buildWriteEvidence, type WriteEvidence } from "../evidenceSources.js";
import { stageLabel } from "../growth.js";
import { inferMemoBelongsTo } from "../memoBelongs.js";
import { linkStatusOf } from "../pickList.js";
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
  type Analysis,
  type CharCount,
  type GenerationSections,
  MAX_REGENERATIONS,
} from "../types.js";
import { validateWriteResponse } from "../validation.js";
import { detailBody, type SessionActivityWithRecord } from "../view.js";
import { chargeAfterSuccess, checkChargeGate, needsCharge } from "./credit.js";
import {
  activeGrowth,
  activityNameOf,
  careerOf,
  readAnalysis,
  reportRowOut,
  splitActivities,
  touchSession,
} from "./shared.js";

/** 생성 완료 단계. 이 값 이상이어야 편집하고 느낌 문장을 확인할 수 있다. */
const GENERATED_STEP = 4;

export type WriteResult = {
  report: ReturnType<typeof reportRowOut>;
  charged: boolean;
  regenerationsLeft: number;
  currentStep: number;
};

type ModelWrite = { sections: GenerationSections; charCount: CharCount };

// ---------------------------------------------------------------------------
// 입력 조립(순수)
// ---------------------------------------------------------------------------

export function buildWriteInput(
  session: SessionRow,
  core: { record: ActivityRecordLike; analysis: Analysis },
  supports: ActivityRecordLike[],
  evidence: WriteEvidence,
):
  | { ok: true; input: WritePromptInput }
  | { ok: false; code: "CONFLICTS_UNRESOLVED" } {
  // 충돌이 남아 있으면 모델이 어느 수치를 쓸지 정할 수 없다(명세 No.40).
  if (core.analysis.conflicts.some((c) => c.resolved === null)) {
    return { ok: false, code: "CONFLICTS_UNRESOLVED" };
  }
  if (session.area === null) {
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
        sourceType: evidence.prompt.coreSourceType,
      },
      // 완료되지 않은 기록은 evidence.prompt.supports 에 없으므로 프롬프트에서 빠진다.
      supports: supports.flatMap((s) => {
        const info = evidence.prompt.supports.find(
          (i) => i.activityId === s.id,
        );
        return info === undefined
          ? []
          : [
              {
                activityId: s.id,
                activityName: activityNameOf(s, session),
                sourceType: info.sourceType,
                summary: info.summary,
                link: info.link,
                linkMode: info.linkMode,
                carried: info.carried,
                items: info.items,
              },
            ];
      }),
      memos: evidence.prompt.memos,
      area: session.area,
      subject: session.subject,
      activityName: session.activity_name,
      schoolPrompt: session.school_prompt,
      promptKeywords:
        session.school_prompt === null
          ? []
          : extractPromptKeywords(session.school_prompt),
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
  evidence: WriteEvidence,
  regenerate: boolean,
):
  | { ok: true; spec: StepSpec<ModelWrite> }
  | { ok: false; code: "CONFLICTS_UNRESOLVED" } {
  const built = buildWriteInput(session, core, supports, evidence);
  if (!built.ok) return built;
  const { input } = built;
  const universities = careerOf(session).universities;
  return {
    ok: true,
    spec: {
      build: (retryNotes) => buildWritePrompt(input, retryNotes),
      validate: (value) => {
        const v = validateWriteResponse(value, {
          sources: evidence.sources,
          targetChars: session.target_chars,
          mode: session.target_chars_mode,
          universities,
          linkStates: evidence.linkStates,
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

  const rows = await loadSessionActivities(db, userId, session.id);
  const { core, supports } = splitActivities(rows);
  const evidence = await loadWriteEvidence(db, userId, session, rows);
  const built = buildWriteSpec(
    session,
    { record: core.record, analysis: readAnalysis(core.analysis) },
    supports.map((s) => s.record),
    evidence,
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

async function loadWriteEvidence(
  db: Db,
  userId: string,
  session: SessionRow,
  rows: SessionActivityWithRecord[],
): Promise<WriteEvidence> {
  const loaded = await loadEvidenceRows(
    db,
    userId,
    session.id,
    rows.map((r) => r.activity_record_id),
  );
  // 모델을 부르기 전에 소속 없는 확인, 포함 메모의 소속을 결정론으로 정해 저장한다(명세 No.188).
  const assigned = inferMemoBelongsTo(
    loaded.memos.filter((m) => m.confirmed && m.included),
    rows.map((r) => r.record),
  );
  if (assigned.size > 0) await saveMemoBelongsTo(db, session.id, assigned);
  return buildWriteEvidence(
    rows,
    loaded.extras,
    loaded.links,
    linkStatusOf(session.step_state) === "ok",
    loaded.memos.map((m) => ({
      ...m,
      belongsTo: assigned.get(m.id) ?? m.belongsTo,
    })),
  );
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

/** 학생이 한 문장의 근거를 다시 골라 edited 리포트로 쌓는다(명세 No.147). */
export async function repickSentenceEvidence(
  db: Db,
  userId: string,
  session: SessionRow,
  base: GenerationSections,
  sentenceId: string,
  picks: { refId: string; item: string }[],
): Promise<SimpleOutcome<{ report: ReturnType<typeof reportRowOut> }>> {
  if (session.current_step < GENERATED_STEP) {
    return { kind: "order", currentStep: session.current_step };
  }
  const { sources } = await loadWriteEvidence(
    db,
    userId,
    session,
    await loadSessionActivities(db, userId, session.id),
  );
  const next = repickEvidence(base, sentenceId, picks, sources);
  if (next === null) {
    return {
      kind: "rejected",
      status: 404,
      code: "SENTENCE_NOT_FOUND",
      message: "근거를 바꿀 문장을 찾을 수 없어요.",
    };
  }
  return {
    kind: "done",
    result: { report: await saveEdited(db, userId, session, next) },
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
