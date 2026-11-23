// 7p 입결, hidden for M3 (22 r70-r77).

import { copy, fill, reportCell } from "../copy.js";
import { OPTIONS } from "../options.js";
import type { Engine } from "../report.js";
import { sheetRows, textCell } from "../sheet.js";
import type { Page7 } from "../types.js";
import { gradeLabel } from "./p1.js";

// 08 r14 C: "70 이상 안정 / 50 이상 적정 / 30 이상 소신 / 그 외 위험"
const sheet08 = sheetRows("08_합격가능성");
const relabelRow = sheet08.find((row) => row.r === 14);
if (!relabelRow) throw new Error("missing 08 r14");
const BAND_NAMES = textCell(relabelRow, 2)
  .split(" / ")
  .map((part) => part.split(" ").at(-1) as string);

const meta = sheetRows("13_문항메타");
/** 13 D title of a question. */
const titleOf = (id: string) => {
  const row = meta.find((r) => r.c[0] === id);
  if (!row) throw new Error("missing 13 " + id);
  return textCell(row, 3);
};

// 22 r76 D: "1번: 고1 \u2192 고1, 고2 \u2192 고2, 고3 \u2192 고3, N수생 \u2192 N수"
const ROAD_KEYS = new Map(
  [...reportCell(76, 3).matchAll(/(\S+) \u2192 ([^,\s]+)/g)].map((m) => [
    String(m[1]),
    String(m[2]),
  ]),
);
/** 14 q1 label "고등학교 n학년" is written 고n in 22 r76. */
const roadKey = (label: string) => {
  const key = ROAD_KEYS.get(label.replace(/^고등학교 (\d)학년$/, "고$1"));
  if (key === undefined) throw new Error("no roadmap for " + label);
  return key;
};

/** 11 diff_short / diff_over / diff_base on the signed grade gap. */
const diffText = (diff: number) =>
  diff > 0
    ? fill("diff_short", { v: diff })
    : diff < 0
      ? fill("diff_over", { v: -diff })
      : copy("diff_base");

const CARD_QUESTIONS = [
  { id: "q16", copyKey: "ADM_Q16_" },
  { id: "q17", copyKey: "ADM_Q17_" },
  { id: "q18", copyKey: "ADM_Q18_" },
] as const;

export function buildPage7(engine: Engine): Page7 | undefined {
  const { answers, context, admission } = engine;
  if (admission.status === "HIDDEN") return undefined;
  const grade = roadKey(gradeLabel(answers));
  const names = context.admission;
  return {
    // 22 r71
    title: copy(
      admission.status === "COMPUTED"
        ? "ADM_HEAD_" + admission.band
        : admission.status === "SKIPPED"
          ? "ADM_HEAD_SKIP"
          : "ADM_HEAD_NODATA",
    ),
    result:
      admission.status === "COMPUTED" && names
        ? {
            kind: "computed",
            // 22 r72
            comparison: {
              ...(admission.comparison.cut50 === undefined ||
              admission.comparison.diff50 === undefined
                ? {}
                : {
                    cut50: {
                      label: copy("cut_labels.cut50"),
                      value: admission.comparison.cut50,
                    },
                    diff50: diffText(admission.comparison.diff50),
                  }),
              cut70: {
                label: copy("cut_labels.cut70"),
                value: admission.comparison.cut70,
              },
              mine: {
                label: copy("cut_labels.mine"),
                value: admission.comparison.mine,
              },
              diff: diffText(admission.comparison.diff70),
              source: fill("admission_source", {
                university: names.universityName,
                major: names.unitName,
                type: names.typeName,
                year: names.year,
              }),
            },
            // 22 r73
            band: {
              headline: fill("admission_headline", {
                band: BAND_NAMES[admission.band - 1] as string,
              }),
              text: copy("BAND_" + admission.band),
              ...(admission.precisionNote
                ? { precision: copy("BAND_PRECISION") }
                : {}),
            },
          }
        : admission.status === "NODATA"
          ? {
              kind: "notice",
              text: copy("BAND_NODATA"),
              ...(names
                ? {
                    universityName: names.universityName,
                    unitName: names.unitName,
                  }
                : {}),
            }
          : { kind: "notice", text: copy("BAND_SKIPPED") },
    // 22 r75: 17-19번 cards when 16번 was answered
    ...(answers.q15
      ? {
          cards: CARD_QUESTIONS.map(({ id, copyKey }) => {
            const ordinal = answers[id];
            const label = OPTIONS[id].find((o) => o.ordinal === ordinal)?.label;
            return label === undefined
              ? { question: titleOf(id), answer: copy("ADM_NA"), text: "" }
              : {
                  question: titleOf(id),
                  answer: label,
                  text: copy(copyKey + ordinal),
                };
          }),
        }
      : {}),
    // 22 r76: "when|text" rows
    roadmap: {
      title: fill("ROAD_TITLE", { grade }),
      steps: [1, 2, 3].map((n) => {
        const [when, text] = copy("ROAD_" + grade + "_" + n).split("|");
        if (when === undefined || text === undefined) {
          throw new Error("bad roadmap row " + grade + n);
        }
        return { when, text };
      }),
    },
    // 22 r77
    notes: [copy("ADMISSION_NOTE"), copy("PROB_NOTE")],
  };
}
