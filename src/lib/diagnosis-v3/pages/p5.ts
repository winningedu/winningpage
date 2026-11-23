// 5p 방해 요인 \u00b7 마음 상태 (22 r55-r61).

import { AREAS, type AreaCode, MIND_CODES } from "../codes.js";
import { copy, fill, numbersIn, reportCell } from "../copy.js";
import { LIKERT_LEVELS, SCALE_ITEMS } from "../likert.js";
import { OPTIONS } from "../options.js";
import type { Engine } from "../report.js";
import type { AreaScore, Page5 } from "../types.js";
import { quoteList, scoreBar } from "./common.js";

// 22 r55 D: "{mind} = 자기효능감 70 이상 HIGH"
const [MIND_HIGH_FROM] = numbersIn(
  reportCell(55, 3),
  /자기효능감 (\d+) 이상/,
) as [number];
// 22 r60 D: "70 미만 일치"
const [MATCH_BELOW] = numbersIn(reportCell(60, 3), /(\d+) 미만 일치/) as [
  number,
];

/** q10 options with an area (the exclusive one has none). */
const AREA_OPTIONS = OPTIONS.q10.flatMap((o) =>
  o.area ? [{ ...o, area: o.area }] : [],
);

const unique = <T>(list: readonly T[]) => [...new Set(list)];

const areaScore = (engine: Engine, code: AreaCode): AreaScore => {
  const { page1, mind } = engine.scores;
  const area =
    (page1.areas as Partial<Record<AreaCode, AreaScore>>)[code] ??
    (mind.areas as Partial<Record<AreaCode, AreaScore>>)[code];
  if (!area) throw new Error("no score for " + code);
  return area;
};

/** The area's scale items with the raw answer labels (q9 stages, q20 MIND). */
const areaAnswers = (engine: Engine, code: AreaCode) => {
  const mind = (MIND_CODES as readonly AreaCode[]).includes(code);
  const items = mind ? SCALE_ITEMS.q20 : SCALE_ITEMS.q9;
  const block = mind ? engine.answers.q20 : engine.answers.q9;
  return items
    .filter((item) => item.area === code)
    .map((item) => {
      const answer = block.items[item.no - 1];
      const label =
        answer === undefined ? undefined : LIKERT_LEVELS[answer]?.label;
      if (label === undefined) throw new Error("missing answer " + item.no);
      return { question: item.text, answer: label };
    });
};

export function buildPage5(engine: Engine): Page5 {
  const { scores, answers } = engine;
  const picked = AREA_OPTIONS.filter((o) => answers.q10?.includes(o.ordinal));
  const mind = copy(
    scores.mind.areas.MIND_EFF.score >= MIND_HIGH_FROM
      ? "OBS_MIND_HIGH"
      : "OBS_MIND_LOW",
  );
  const simple = scores.reliability.diagnosis === "SIMPLE";
  return {
    // 22 r55: picked areas in screen order, deduplicated
    title:
      picked.length > 0
        ? fill("OBS_HEAD_SEL", {
            areas: quoteList(unique(picked.map((o) => AREAS[o.area].label))),
            mind,
          })
        : fill("OBS_HEAD_NONE", { mind }),
    lead: copy("OBS_LEAD"),
    // 22 r57: q10 options grouped by area, first appearance order
    groups: unique(AREA_OPTIONS.map((o) => o.area)).map((area) => ({
      area: AREAS[area].label,
      options: AREA_OPTIONS.filter((o) => o.area === area).map((o) => ({
        label: o.label,
        selected: picked.includes(o),
      })),
    })),
    // 22 r58
    mind: {
      bars: MIND_CODES.map((code) =>
        scoreBar(code, scores.mind.areas[code], "page1"),
      ),
      note: copy("MIND_NOTE"),
    },
    // 22 r59
    interpretation: {
      areas: MIND_CODES.map((code) =>
        copy("AREA_" + code + "_" + scores.mind.areas[code].level),
      ),
      weak: copy("AREA_" + scores.mind.lowest + "_WEAK"),
    },
    // 22 r60 when picked and not SIMPLE, 22 r61 when nothing was picked
    ...(picked.length === 0
      ? { crossCheck: { kind: "skipped", text: copy("OBS_NONE_NOTE") } }
      : simple
        ? {}
        : {
            crossCheck: {
              kind: "items",
              items: picked.map((o) => {
                const area = areaScore(engine, o.area);
                return {
                  option: o.label,
                  area: scoreBar(o.area, area, "page1"),
                  answers: areaAnswers(engine, o.area),
                  text: copy(
                    area.score < MATCH_BELOW ? "XCHK_MATCH" : "XCHK_GAP",
                  ),
                };
              }),
            },
          }),
  };
}
