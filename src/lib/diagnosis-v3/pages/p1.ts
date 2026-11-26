// 1p 요약 (22 r9-r27).

import { AREAS, P1_CODES } from "../codes.js";
import {
  copy,
  copyCell,
  fill,
  MIDDLE_AVERAGE_LABEL,
  numbersIn,
  reportCell,
} from "../copy.js";
import { OPTIONS, trackOf } from "../options.js";
import { dateOfDay, formatDue, WEEKS } from "../plan.js";
import type { Engine } from "../report.js";
import { TARGET_SCORE } from "../scoring.js";
import type {
  AreaScore,
  DiagnosisV3Answers,
  Page1,
  TextBlock,
} from "../types.js";
import { narrative, nextText, scoreBar } from "./common.js";

/** The 「..」 word of a 22 D cell, e.g. 「미입력」 (22 r13, r15). */
const quoted = (r: number) => {
  const found = reportCell(r, 3).match(/\u300c(.+?)\u300d/);
  if (!found?.[1]) throw new Error("no quoted word in 22 r" + r);
  return found[1];
};
const MISSING = quoted(13);

// 22 r24-r25 D "70 이상이면 _OK 제목"
const [OK_FROM] = numbersIn(reportCell(24, 3), /(\d+) 이상이면 _OK/) as [
  number,
];

const SEP = " \u00b7 ";

const label = (
  options: readonly { ordinal: number; label: string }[],
  ordinal: number | undefined,
) => options.find((o) => o.ordinal === ordinal)?.label;

/** 1번 grade label (22 r6, r12). */
export const gradeLabel = (answers: DiagnosisV3Answers) => {
  const text = label(OPTIONS.q1, answers.q1);
  if (text === undefined) throw new Error("unknown q1 " + answers.q1);
  return text;
};

/** 2번 school type label (22 r6, r12). */
export const schoolLabel = (answers: DiagnosisV3Answers) => {
  const text = label(OPTIONS.q2, answers.q2);
  if (text === undefined) throw new Error("unknown q2 " + answers.q2);
  return text;
};

/** 6번 average with the 4번 grade system (22 r14, r40); M3 6번 is the 원점수 average. */
export const gpaText = (answers: DiagnosisV3Answers) =>
  trackOf(answers.q1) === "M3"
    ? String(answers.q6) + "점 (" + MIDDLE_AVERAGE_LABEL + ")"
    : String(answers.q6) + " (" + label(OPTIONS.q4, answers.q4) + ")";

/** 7번 option, 7-1 subject and 7-2 direction; 「미입력」 when 7번 is unanswered (22 r15, r42). */
export const trendText = (answers: DiagnosisV3Answers) => {
  const flow = label(OPTIONS.q8, answers.q8);
  if (flow === undefined) return quoted(15);
  const subject = label(OPTIONS.q8s, answers.q8s);
  const direction = label(OPTIONS.q8d, answers.q8d);
  if (subject === undefined) return flow;
  return (
    flow + SEP + subject + (direction === undefined ? "" : " " + direction)
  );
};

/** 16번 target names, else the 3번 inputs, else 「미입력」 (22 r13). */
export const targetText = (engine: Engine) => {
  const admission = engine.context.admission;
  if (engine.answers.q15 && admission) {
    return (
      admission.universityName +
      " " +
      admission.unitName +
      SEP +
      admission.typeName
    );
  }
  const typed = [
    engine.answers.q3Target?.university,
    engine.answers.q3Target?.major,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");
  return typed === "" ? MISSING : typed;
};

const RELIABILITY_IDS = {
  GOOD: "RELIAB_GOOD",
  MID: "RELIAB_MID",
  SIMPLE: "SINCERITY_BANNER",
} as const;

/** 22 r18 text of the reliability verdict. */
export const reliabilityText = (engine: Engine) =>
  copy(RELIABILITY_IDS[engine.scores.reliability.diagnosis]);

const trait = (
  ids: readonly [string, string],
  code: keyof typeof AREAS,
  area: AreaScore,
): TextBlock => ({
  heading: fill(area.score >= OK_FROM ? ids[1] : ids[0], {
    area: AREAS[code].label,
    score: area.score,
  }),
  body: copy("AREA_" + code + "_" + area.level),
});

export function buildPage1(engine: Engine, temperamentName: string): Page1 {
  const { scores, answers, context } = engine;
  const simple = scores.reliability.diagnosis === "SIMPLE";
  const type = scores.studentType;
  const [lowP1] = scores.page1.order;
  const [lowP2] = scores.page2.order;
  if (!lowP1 || !lowP2) throw new Error("empty area order");
  const p1Low = scores.page1.areas[lowP1];
  const p2Low = scores.page2.areas[lowP2];
  if (!p2Low) throw new Error("missing PAGE2 area " + lowP2);
  const mindLow = scores.mind.areas[scores.mind.lowest];
  const mindHigh = scores.mind.areas[scores.mind.highest];
  const lastDay = WEEKS[WEEKS.length - 1]?.to;
  if (lastDay === undefined) throw new Error("no plan weeks");
  const typeId = (part: string) => "TYPE_" + type + "_" + part;
  return {
    // 22 r9
    title:
      simple || type === null ? copy("SINCERITY_HEAD") : copy(typeId("HEAD")),
    // 22 r10: 01 B 유형명 sits on the HEAD row
    ...(simple || type === null
      ? {}
      : {
          typeSummary: {
            name: copyCell("01_유형문구", typeId("HEAD"), 1),
            body: copy(typeId("BODY")),
          },
        }),
    // 22 r11: {one} = 1순위 stage NEXT copy
    lead: simple
      ? copy("SUM_LEAD_SIMPLE")
      : fill("SUM_LEAD", { one: nextText(lowP1, p1Low.score) }),
    profile: {
      grade: gradeLabel(answers),
      school: schoolLabel(answers),
      target: targetText(engine),
      gpa: gpaText(answers),
      trend: trendText(answers),
      // 22 r16 D: 진단일, 진단일+27일, 재진단 진단일+28일; E: each plan.due
      period: {
        from: formatDue(context.diagnosedAt),
        to: formatDue(dateOfDay(context.diagnosedAt, lastDay)),
        redx: formatDue(scores.plan.redxDate),
      },
      temperament: temperamentName,
      reliability: reliabilityText(engine),
    },
    // 22 r19
    radar: {
      stages: P1_CODES.map((code) =>
        scoreBar(code, scores.page1.areas[code], "page1"),
      ),
      total: scores.page1.total,
      target: TARGET_SCORE,
    },
    // 22 r20
    kpi1: {
      label: copy("KPI1_LABEL"),
      area: scoreBar(lowP1, p1Low, "page1"),
      subtitle: narrative(lowP1, p1Low.state).heading,
    },
    // 22 r21
    kpi2: {
      label: copy(scores.track === "M3" ? "KPI2_LABEL_M3" : "KPI2_LABEL"),
      total: scores.page2.total,
      sub: fill("KPI2_SUB", { area: AREAS[lowP2].label, score: p2Low.score }),
    },
    // 22 r22
    kpi3: {
      label: copy("KPI3_LABEL"),
      area: scoreBar(scores.mind.lowest, mindLow, "page1"),
      sub: fill("KPI3_SUB", {
        area: AREAS[scores.mind.highest].label,
        score: mindHigh.score,
      }),
    },
    // 22 r23
    traitIntro: copy(simple ? "SINCERITY_TRAIT" : "TRAIT_INTRO"),
    // 22 r24-r26 (MIND has no _OK title)
    traits: [
      trait(["TRAIT_TITLE_1", "TRAIT_TITLE_1_OK"], lowP1, p1Low),
      trait(["TRAIT_TITLE_2", "TRAIT_TITLE_2_OK"], lowP2, p2Low),
      trait(["TRAIT_TITLE_3", "TRAIT_TITLE_3"], scores.mind.lowest, mindLow),
    ],
    // 22 r27
    one: {
      title: copy("ONE_TITLE"),
      actions:
        simple || type === null
          ? [copy("SINCERITY_ACT"), copy("AREA_" + lowP1 + "_ACT1")]
          : [copy(typeId("ACT1")), copy(typeId("ACT2")), copy(typeId("ACT3"))],
    },
  };
}
