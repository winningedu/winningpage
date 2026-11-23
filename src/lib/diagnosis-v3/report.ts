// Engine assembly: every scoring module runs once here (scores layer), then
// the page builders turn the same results into 22_리포트요소 display text.

import { type AdmissionResult, computeAdmission } from "./admission.js";
import type { AreaCode } from "./codes.js";
import { P1_CODES, P2_CODES } from "./codes.js";
import { judgeExamOps } from "./examOps.js";
import { mbtiPage8, scoreMbti } from "./mbti.js";
import { buildPage1 } from "./pages/p1.js";
import { buildPage2, goalOf } from "./pages/p2.js";
import { buildPage3 } from "./pages/p3.js";
import { buildPage4 } from "./pages/p4.js";
import { buildPage5 } from "./pages/p5.js";
import { buildPage6 } from "./pages/p6.js";
import { buildPage7 } from "./pages/p7.js";
import { buildPage11 } from "./pages/p11.js";
import { buildPlan, buildPlannerPages } from "./plan.js";
import { buildPrescriptions } from "./prescription.js";
import { scoreReliability } from "./reliability.js";
import { scoreAreas } from "./scoring.js";
import { recommendServices, type ServicesResult } from "./services.js";
import { studentType } from "./studentType.js";
import { judgeSubjects } from "./subjects.js";
import {
  scoreTemperament,
  type TemperamentResult,
  temperamentPage9,
  temperamentPage10,
} from "./temperament.js";
import type {
  DiagnosisV3Answers,
  DiagnosisV3Context,
  DiagnosisV3Pages,
  DiagnosisV3Scores,
} from "./types.js";
import { scoreUrgency } from "./urgency.js";

/** Scores plus the module results the page builders need beyond the scores layer. */
export type Engine = {
  readonly answers: DiagnosisV3Answers;
  readonly context: DiagnosisV3Context;
  readonly scores: DiagnosisV3Scores;
  readonly temperament: TemperamentResult;
  readonly admission: AdmissionResult;
  readonly services: ServicesResult;
};

export function scoreEngine(
  answers: DiagnosisV3Answers,
  context: DiagnosisV3Context,
): Engine {
  const areas = scoreAreas(answers);
  const reliability = scoreReliability(answers);
  const track = areas.track;
  const p1Scores = Object.fromEntries(
    P1_CODES.map((code) => [code, areas.page1.areas[code].score]),
  );
  const p2Scores = Object.fromEntries(
    P2_CODES[track].map((code) => [code, areas.page2.areas[code]?.score]),
  );
  const mindScores = Object.fromEntries(
    Object.entries(areas.mind.areas).map(([code, a]) => [code, a.score]),
  );
  const pageScores: Partial<Record<AreaCode, number>> = {
    ...p1Scores,
    ...p2Scores,
  };
  const allScores: Partial<Record<AreaCode, number>> = {
    ...pageScores,
    ...mindScores,
  };
  const q20Item5 = answers.q20.items[4];
  if (q20Item5 === undefined) throw new Error("missing q20 item 5");
  const temperament = scoreTemperament({
    q23: answers.q23,
    track,
    q20Item5,
    exec: areas.page1.areas.P1_EXEC.score,
    recv: areas.mind.areas.MIND_RECV.score,
    reliability,
  });
  const admission = computeAdmission(answers, context);
  const services = recommendServices({
    grade: answers.q1,
    diagnosedAt: context.diagnosedAt,
    joinedAt: context.joinedAt,
    areaScores: allScores,
    q10: answers.q10 ?? [],
    q12: answers.q12 ?? [],
    q14: answers.q14 ?? [],
    counsel: temperament.counsel,
    reliability,
  });
  const examOps = judgeExamOps(answers);
  const plan = buildPlan({
    diagnosedAt: context.diagnosedAt,
    page1Order: areas.page1.order,
    page2Order: areas.page2.order,
    schedule: answers.q13,
    examOps,
    weekdayLoad: answers.q21.weekday,
  });
  const {
    factorLabels: _factorLabels,
    ranked: _ranked,
    ...temperamentScores
  } = temperament;
  const admissionScores: DiagnosisV3Scores["admission"] =
    admission.status === "COMPUTED"
      ? {
          status: admission.status,
          mode: admission.mode,
          grade9: admission.grade9,
          baseBand: admission.baseBand,
          probability: admission.probability,
          probabilityLow: admission.probabilityLow,
          probabilityHigh: admission.probabilityHigh,
          band: admission.band,
        }
      : admission;
  const scores: DiagnosisV3Scores = {
    ...areas,
    reliability,
    studentType: studentType(areas, reliability),
    goal: goalOf(answers),
    examOps,
    subjects: judgeSubjects(answers),
    temperament: temperamentScores,
    mbti: scoreMbti(answers.q22),
    admission: admissionScores,
    services: {
      scope: services.scope,
      ranked: services.ranked,
      counselPinned: services.counselPinned,
    },
    urgency: scoreUrgency({
      diagnosedAt: context.diagnosedAt,
      schedule: answers.q13,
      areaScores: pageScores,
    }),
    plan,
    prescriptions: buildPrescriptions({
      answers,
      track,
      areaScores: pageScores,
      plan,
    }),
  };
  return { answers, context, scores, temperament, admission, services };
}

/** 22_리포트요소 pages; filled page by page. */
export function buildPages(engine: Engine): Partial<DiagnosisV3Pages> {
  const p9 = temperamentPage9(
    engine.temperament,
    engine.scores.reliability.temperament,
  );
  const p7 = buildPage7(engine);
  const { scores, answers, context } = engine;
  const p10 = temperamentPage10(engine.temperament, scores.reliability);
  const [p12, p13, p14, p15] = buildPlannerPages(
    scores.plan,
    context.diagnosedAt,
    answers.q13,
  );
  if (!p12 || !p13 || !p14 || !p15) throw new Error("need 4 planner pages");
  return {
    p1: buildPage1(engine, p9.hero.name),
    p2: buildPage2(engine),
    p3: buildPage3(engine),
    p4: buildPage4(engine),
    p5: buildPage5(engine),
    p6: buildPage6(engine),
    ...(p7 ? { p7 } : {}),
    p8: mbtiPage8(answers.q22, allAreaScores(scores)),
    p9,
    p10,
    p11: buildPage11(engine, p10.methods),
    p12,
    p13,
    p14,
    p15,
  };
}

/** PAGE1, track PAGE2 and MIND scores by code. */
function allAreaScores(
  scores: DiagnosisV3Scores,
): Partial<Record<AreaCode, number>> {
  return Object.fromEntries(
    [
      ...Object.entries(scores.page1.areas),
      ...Object.entries(scores.page2.areas),
      ...Object.entries(scores.mind.areas),
    ].map(([code, area]) => [code, area?.score]),
  );
}
