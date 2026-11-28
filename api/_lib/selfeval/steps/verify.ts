// 검증 단계(계획서 §2 8, 명세 No.53~62). 모델은 확인 문장의 통과 여부만 판정하고
// 점수, 형식 검사, 필수 수정은 서버가 결정론으로 계산한다.
// 검증 실패는 차감을 되돌린다(명세 No.16, No.81). 되돌린 뒤 재검증이 성공하면 다시 차감한다.

import { type Db, loadReports, loadSessionActivities } from "../db.js";
import { plainText } from "../editLink.js";
import { loadEvidenceRows } from "../evidenceDb.js";
import { buildWriteEvidence } from "../evidenceSources.js";
import { bannerSummary } from "../growth.js";
import {
  buildLinkChecks,
  judgedTargets,
  linkTargets,
  type SupportLinkState,
} from "../linkWrite.js";
import { linkStatusOf } from "../pickList.js";
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
  recordTerms,
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

// ---------------------------------------------------------------------------
// 입력 조립(순수)
// ---------------------------------------------------------------------------

const allSentences = (sections: GenerationSections): Sentence[] =>
  sections.paragraphs.flatMap((p) => p.sentences);

const supportLabels = (
  session: SessionRow,
  supports: ActivityRecordLike[],
): Map<string, string> =>
  new Map(supports.map((s) => [s.id, activityNameOf(s, session)]));

export function buildVerifyInput(
  session: SessionRow,
  current: GenerationSections,
  core: { record: ActivityRecordLike; analysis: Analysis },
  supports: ActivityRecordLike[],
  linkStates: SupportLinkState[] = [],
): VerifyPromptInput {
  const snapshot = activeGrowth(session);
  const { values } = core.analysis;
  const all = recordTerms([core.record, ...supports]);
  const unique = (xs: string[]) => [...new Set(xs)];
  return {
    text: plainText(current),
    sentences: allSentences(current).map((s) => ({ id: s.id, text: s.text })),
    schoolPrompt: session.school_prompt,
    promptKeywords:
      session.school_prompt === null
        ? []
        : extractPromptKeywords(session.school_prompt),
    teacherNote: session.teacher_note,
    coreTerms: {
      concepts: unique([...extractKeywords(values.concept), ...all.concepts]),
      roles: extractKeywords(values.role),
      sources: unique([
        ...promoteToRecord(core.analysis, activityNameOf(core.record, session))
          .sources,
        ...all.sources,
      ]),
    },
    supportNames: supports.map((s) => activityNameOf(s, session)),
    linkTargets: judgedTargets(
      linkTargets(
        linkStates,
        supportLabels(session, supports),
        allSentences(current),
      ),
    ).map((t) => ({
      recordId: t.recordId,
      label: t.label,
      sentenceIds: t.sentenceIds,
    })),
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
  linkStates: SupportLinkState[] = [],
): StepSpec<ModelVerify> {
  const input = buildVerifyInput(session, current, core, supports, linkStates);
  const snapshot = activeGrowth(session);
  const sentences = allSentences(current);
  const universities = careerOf(session).universities;
  const targets = linkTargets(
    linkStates,
    supportLabels(session, supports),
    sentences,
  );
  return {
    build: (retryNotes) => buildVerifyPrompt(input, retryNotes),
    validate: (value) => {
      const v = validateVerifyResponse(value, {
        expectGrowth: snapshot !== null,
        promptMissing: input.schoolPrompt === null,
        linkRecordIds: input.linkTargets.map((t) => t.recordId),
      });
      if (!v.ok) return v;
      // 문자열 포함 여부처럼 코드가 더 정확한 판정은 모델 결과를 덮는다(명세 No.23).
      const checks = applyDeterministicChecks(v.checks, {
        text: input.text,
        promptKeywords: input.promptKeywords,
      });
      const scored = assembleVerification({
        checks,
        text: input.text,
        targetChars: session.target_chars,
        mode: session.target_chars_mode,
        universities,
        sentences,
        promptMissing: input.schoolPrompt === null,
        growthFit:
          snapshot === null
            ? null
            : {
                stageChecks: v.stageChecks,
                axisChecks: growthSignalChecks(input.text, snapshot),
              },
      });
      // 연계 경고는 채점과 필수 수정을 계산한 뒤에 붙인다. 점수와 제출 가능 판정에는 들어가지 않는다.
      const sections: VerificationSections = {
        ...scored,
        linkChecks: buildLinkChecks(targets, v.linkJudgments),
      };
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

  const rows = await loadSessionActivities(db, userId, session.id);
  const { core, supports } = splitActivities(rows);
  const loaded = await loadEvidenceRows(
    db,
    userId,
    session.id,
    rows.map((r) => r.activity_record_id),
  );
  const { linkStates } = buildWriteEvidence(
    rows,
    loaded.extras,
    loaded.links,
    linkStatusOf(session.step_state) === "ok",
    loaded.memos,
  );
  const spec = buildVerifySpec(
    session,
    current.sections as GenerationSections,
    { record: core.record, analysis: readAnalysis(core.analysis) },
    supports.map((s) => s.record),
    linkStates,
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

  // 저장된 리포트 읽기는 차감과 서로 기다릴 필요가 없다(리포트는 모델 단계에서 이미 저장됐다).
  const [charged, savedReports] = await Promise.all([
    needsCharge(session)
      ? chargeAfterSuccess(db, userId, session.id, "selfeval:verify-success")
      : true,
    loadReports(db, userId, session.id),
  ]);

  const saved = detailBody(session, [], savedReports).reports.verification;
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
