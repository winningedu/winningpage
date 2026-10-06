// 분석 단계(11항목, 계획서 §2 6, 명세 No.37~43). 입력 조립은 순수 함수, 실행은 db 와 deps 를 받는다.
// 값이 기록에서 왔는지(record), 학생이 쓴 것인지(student)는 서버가 결정론으로 가른다.

import { classifyFieldSources, mergeStudentEdits } from "../analysisSources.js";
import { detectConflicts, resolveConflict } from "../conflict.js";
import {
  type Db,
  loadSessionActivities,
  updateSession,
  updateSessionActivityAnalysis,
} from "../db.js";
import { buildAnalyzePrompt } from "../prompts.js";
import type { SessionRow } from "../rows.js";
import {
  type ModelStepDeps,
  type Outcome,
  runModelStep,
  type SimpleOutcome,
  type StepSpec,
} from "../runModelStep.js";
import { guardStep } from "../session.js";
import {
  type ActivityRecordLike,
  ANALYSIS_FIELDS,
  type Analysis,
  type AnalysisField,
  type AnalysisSource,
} from "../types.js";
import { validateAnalyzeResponse } from "../validation.js";
import { isRecord, isUuid, readAnalysis, splitActivities } from "./shared.js";

/** 분석 완료 단계. 이 값 이상이어야 분석을 고치거나 충돌을 정할 수 있다. */
const ANALYZED_STEP = 3;

export type AnalyzeResult = {
  analysis: Analysis;
  analysisSource: AnalysisSource;
  currentStep: number;
};

// ---------------------------------------------------------------------------
// 요청 본문
// ---------------------------------------------------------------------------

export type AnalyzeBody =
  | { sessionId: string; action: "run" }
  | {
      sessionId: string;
      action: "save";
      edits: Partial<Record<AnalysisField, string>>;
    }
  | {
      sessionId: string;
      action: "resolve-conflict";
      index: number;
      choice: "a" | "b";
    };

export function validateAnalyzeBody(
  body: unknown,
): { ok: true; body: AnalyzeBody } | { ok: false; message: string } {
  const bad = (message: string) => ({ ok: false as const, message });
  if (!isRecord(body)) return bad("요청 형식이 올바르지 않아요.");
  const { sessionId, action } = body;
  if (!isUuid(sessionId)) return bad("sessionId 형식이 올바르지 않아요.");
  if (action === "run") return { ok: true, body: { sessionId, action } };
  if (action === "save") {
    const { edits } = body;
    if (!isRecord(edits)) return bad("edits 가 필요해요.");
    const clean: Partial<Record<AnalysisField, string>> = {};
    for (const [key, value] of Object.entries(edits)) {
      if (
        !(ANALYSIS_FIELDS as readonly string[]).includes(key) ||
        typeof value !== "string"
      ) {
        return bad("edits 항목 형식이 올바르지 않아요.");
      }
      clean[key as AnalysisField] = value;
    }
    return { ok: true, body: { sessionId, action, edits: clean } };
  }
  if (action === "resolve-conflict") {
    const { index, choice } = body;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      (choice !== "a" && choice !== "b")
    ) {
      return bad("index 와 choice 형식이 올바르지 않아요.");
    }
    return { ok: true, body: { sessionId, action, index, choice } };
  }
  return bad("action 은 run, save, resolve-conflict 중 하나여야 해요.");
}

// ---------------------------------------------------------------------------
// 입력 조립(순수)
// ---------------------------------------------------------------------------

export function buildAnalyzeSpec(
  core: { record: ActivityRecordLike; analysisSource: AnalysisSource | null },
  supports: ActivityRecordLike[],
  session: SessionRow,
): StepSpec<AnalyzeResult> {
  if (session.area === null) {
    throw new Error("작성 영역이 없는 세션은 분석할 수 없습니다.");
  }
  const area = session.area;
  return {
    build: (retryNotes) =>
      buildAnalyzePrompt(
        {
          record: core.record,
          area,
          subject: session.subject,
          activityName: session.activity_name,
        },
        retryNotes,
      ),
    validate: (value) => {
      const v = validateAnalyzeResponse(value, { record: core.record });
      if (!v.ok) return v;
      const analysis: Analysis = {
        values: v.values,
        sources: classifyFieldSources(v.values, core.record),
        conflicts: detectConflicts(core.record, supports),
      };
      return {
        ok: true,
        // current_step 은 RPC 가 greatest 로만 올려 재분석이 단계를 내리지 않는다.
        patch: {
          current_step: ANALYZED_STEP,
          analyses: [
            {
              activity_record_id: core.record.id,
              analysis,
              analysis_source: "model",
            },
          ],
        },
        result: {
          analysis,
          analysisSource: "model",
          currentStep: Math.max(session.current_step, ANALYZED_STEP),
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

export async function runAnalyze(
  db: Db,
  userId: string,
  session: SessionRow,
  deps: ModelStepDeps,
): Promise<Outcome<AnalyzeResult>> {
  const guard = guardStep(session.current_step, "analyze");
  if (!guard.ok) return { kind: "order", currentStep: session.current_step };

  const { core, supports } = splitActivities(
    await loadSessionActivities(db, userId, session.id),
  );

  // 직접 입력한 활동은 이미 11항목으로 쪼개 저장돼 있다. 모델 없이 단계만 올린다(명세 No.26).
  if (core.analysis_source === "student") {
    const currentStep = Math.max(session.current_step, ANALYZED_STEP);
    if (session.current_step < ANALYZED_STEP) {
      await updateSession(db, userId, session.id, {
        current_step: ANALYZED_STEP,
      });
    }
    return {
      kind: "ok",
      result: {
        analysis: readAnalysis(core.analysis),
        analysisSource: "student",
        currentStep,
      },
      attempts: 0,
      softIssues: [],
    };
  }

  return runModelStep(
    db,
    userId,
    session,
    "analyze",
    deps,
    buildAnalyzeSpec(
      { record: core.record, analysisSource: core.analysis_source },
      supports.map((s) => s.record),
      session,
    ),
  );
}

/** 학생이 고친 항목만 다시 분류해 저장한다(명세 No.38, 42). */
export async function saveAnalysis(
  db: Db,
  userId: string,
  session: SessionRow,
  edits: Partial<Record<AnalysisField, string>>,
): Promise<SimpleOutcome<{ analysis: Analysis }>> {
  if (session.current_step < ANALYZED_STEP) {
    return { kind: "order", currentStep: session.current_step };
  }
  const { core } = splitActivities(
    await loadSessionActivities(db, userId, session.id),
  );
  const analysis = mergeStudentEdits(
    readAnalysis(core.analysis),
    edits,
    core.record,
  );
  await updateSessionActivityAnalysis(
    db,
    userId,
    session.id,
    core.activity_record_id,
    analysis,
  );
  return { kind: "done", result: { analysis } };
}

/**
 * 충돌 해소. 고른 값은 conflicts 에만 둔다. 11항목 값에 섞으면 학생이 고친 값과 구분되지
 * 않고, 생성 프롬프트가 resolved 를 우선 수치로 쓰기 때문이다.
 */
export async function resolveAnalysisConflict(
  db: Db,
  userId: string,
  session: SessionRow,
  index: number,
  choice: "a" | "b",
): Promise<SimpleOutcome<{ analysis: Analysis }>> {
  if (session.current_step < ANALYZED_STEP) {
    return { kind: "order", currentStep: session.current_step };
  }
  const { core } = splitActivities(
    await loadSessionActivities(db, userId, session.id),
  );
  const prev = readAnalysis(core.analysis);
  if (index >= prev.conflicts.length) {
    return {
      kind: "rejected",
      status: 400,
      code: "CONFLICT_INDEX_INVALID",
      message: "해소할 충돌을 찾을 수 없어요.",
    };
  }
  const analysis: Analysis = {
    ...prev,
    conflicts: resolveConflict(prev.conflicts, index, choice),
  };
  await updateSessionActivityAnalysis(
    db,
    userId,
    session.id,
    core.activity_record_id,
    analysis,
  );
  return { kind: "done", result: { analysis } };
}
