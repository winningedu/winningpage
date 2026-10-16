// 검증 단계(계획서 §2 8, 명세 No.53~62). 모델은 확인 문장의 통과 여부만 판정하고
// 점수, 형식 검사, 필수 수정은 서버가 결정론으로 계산한다.
// 검증 실패는 차감을 되돌린다(명세 No.16, No.81). 되돌린 뒤 재검증이 성공하면 다시 차감한다.

import { type Db, loadReports, loadSessionActivities } from "../db.js";
import { plainText } from "../editLink.js";
import { bannerSummary } from "../growth.js";
import { promoteToRecord } from "../promote.js";
import { extractPromptKeywords } from "../promptKeywords.js";
import { buildVerifyPrompt, type VerifyPromptInput } from "../prompts.js";
import type { ReportRow, SessionRow } from "../rows.js";
import {
  type ModelStepDeps,
  type Outcome,
  runModelStep,
  type StepSpec,
} from "../runModelStep.js";
import { assembleVerification } from "../scoring.js";
import { guardStep } from "../session.js";
import { extractKeywords } from "../text.js";
import type {
  ActivityRecordLike,
  Analysis,
  GenerationSections,
  Sentence,
  VerificationSections,
} from "../types.js";
import { validateVerifyResponse } from "../validation.js";
import {
  applyDeterministicChecks,
  growthSignalChecks,
} from "../verifyChecks.js";
import { detailBody } from "../view.js";
import {
  chargeAfterSuccess,
  checkChargeGate,
  needsCharge,
  reverseAfterFailure,
} from "./credit.js";
import {
  activeGrowth,
  activityNameOf,
  careerOf,
  isRecord,
  isUuid,
  readAnalysis,
  splitActivities,
} from "./shared.js";

/** 검증 완료 단계. */
const VERIFIED_STEP = 5;

export type VerifyResult = {
  verification: {
    id: string;
    revision: number;
    sections: unknown;
    score: number | null;
    mandatoryFixes: unknown;
  };
  charged: boolean;
  currentStep: number;
};

type ModelVerify = { sections: VerificationSections };

export type VerifyBody = { sessionId: string };

export function validateVerifyBody(
  body: unknown,
): { ok: true; body: VerifyBody } | { ok: false; message: string } {
  if (!isRecord(body) || !isUuid(body.sessionId)) {
    return { ok: false, message: "sessionId 형식이 올바르지 않아요." };
  }
  return { ok: true, body: { sessionId: body.sessionId } };
}

// ---------------------------------------------------------------------------
// 입력 조립(순수)
// ---------------------------------------------------------------------------

const allSentences = (sections: GenerationSections): Sentence[] =>
  sections.paragraphs.flatMap((p) => p.sentences);

export function buildVerifyInput(
  session: SessionRow,
  current: GenerationSections,
  core: { record: ActivityRecordLike; analysis: Analysis },
  supports: ActivityRecordLike[],
): VerifyPromptInput {
  if (session.school_prompt === null) {
    throw new Error("학교 문항이 없는 세션은 검증할 수 없습니다.");
  }
  const snapshot = activeGrowth(session);
  const { values } = core.analysis;
  return {
    text: plainText(current),
    sentences: allSentences(current).map((s) => ({ id: s.id, text: s.text })),
    schoolPrompt: session.school_prompt,
    promptKeywords: extractPromptKeywords(session.school_prompt),
    teacherNote: session.teacher_note,
    coreTerms: {
      concepts: extractKeywords(values.concept),
      roles: extractKeywords(values.role),
      sources: promoteToRecord(
        core.analysis,
        activityNameOf(core.record, session),
      ).sources,
    },
    supportNames: supports.map((s) => activityNameOf(s, session)),
    growth:
      snapshot === null
        ? null
        : (({ stageLabel, currentSubtheme }) => ({
            stageLabel,
            currentSubtheme,
          }))(bannerSummary(snapshot, session.grade_label ?? undefined)),
  };
}

export function buildVerifySpec(
  session: SessionRow,
  current: GenerationSections,
  core: { record: ActivityRecordLike; analysis: Analysis },
  supports: ActivityRecordLike[],
): StepSpec<ModelVerify> {
  const input = buildVerifyInput(session, current, core, supports);
  const snapshot = activeGrowth(session);
  const sentences = allSentences(current);
  const universities = careerOf(session).universities;
  return {
    build: (retryNotes) => buildVerifyPrompt(input, retryNotes),
    validate: (value) => {
      const v = validateVerifyResponse(value, {
        expectGrowth: snapshot !== null,
      });
      if (!v.ok) return v;
      // 문자열 포함 여부처럼 코드가 더 정확한 판정은 모델 결과를 덮는다(명세 No.23).
      const checks = applyDeterministicChecks(v.checks, {
        text: input.text,
        promptKeywords: input.promptKeywords,
      });
      const sections = assembleVerification({
        checks,
        text: input.text,
        targetChars: session.target_chars,
        mode: session.target_chars_mode,
        universities,
        sentences,
        growthFit:
          snapshot === null
            ? null
            : {
                stageChecks: v.stageChecks,
                axisChecks: growthSignalChecks(input.text, snapshot),
              },
      });
      return {
        ok: true,
        patch: {
          current_step: VERIFIED_STEP,
          report: {
            report_type: "verification",
            sections,
            char_count: sections.charCount,
            score: sections.total,
            mandatory_fixes: sections.mandatoryFixes,
          },
        },
        result: { sections },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

export async function runVerify(
  db: Db,
  userId: string,
  session: SessionRow,
  reports: ReportRow[],
  deps: ModelStepDeps,
): Promise<Outcome<VerifyResult>> {
  if (!guardStep(session.current_step, "verify").ok) {
    return { kind: "order", currentStep: session.current_step };
  }
  // 검증 대상은 생성본과 편집본 중 나중에 만든 것이다.
  const current = detailBody(session, [], reports).current;
  if (current === null) {
    return { kind: "order", currentStep: session.current_step };
  }

  const { core, supports } = splitActivities(
    await loadSessionActivities(db, userId, session.id),
  );
  const spec = buildVerifySpec(
    session,
    current.sections as GenerationSections,
    { record: core.record, analysis: readAnalysis(core.analysis) },
    supports.map((s) => s.record),
  );

  const gate = await checkChargeGate(db, userId, session);
  if (gate !== null) return gate;

  const out = await runModelStep(db, userId, session, "verify", deps, spec);

  if (out.kind === "failure") {
    // 종결된 실패는 종결 RPC 쪽에서 이미 되돌렸다. 같은 되돌림을 두 번 부르지 않는다.
    const reversed = out.terminal
      ? !needsCharge(session)
      : await reverseAfterFailure(
          db,
          userId,
          session,
          "selfeval:verify-failed",
        );
    return { ...out, reversed };
  }
  if (out.kind !== "ok") return out;

  const charged = needsCharge(session)
    ? await chargeAfterSuccess(
        db,
        userId,
        session.id,
        "selfeval:verify-success",
      )
    : true;

  const saved = detailBody(
    session,
    [],
    await loadReports(db, userId, session.id),
  ).reports.verification;
  if (saved === null) throw new Error("검증한 리포트를 읽지 못했습니다.");
  return {
    kind: "ok",
    result: {
      verification: {
        id: saved.id,
        revision: saved.revision,
        sections: saved.sections,
        score: saved.score,
        mandatoryFixes: saved.mandatoryFixes,
      },
      charged,
      currentStep: Math.max(session.current_step, VERIFIED_STEP),
    },
    attempts: out.attempts,
    softIssues: out.softIssues,
  };
}
