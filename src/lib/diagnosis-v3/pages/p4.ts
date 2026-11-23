// 4p 7단계 사이클 (22 r48-r53).

import { AREAS, P1_CODES } from "../codes.js";
import { copy, fill, numbersIn, reportCell } from "../copy.js";
import type { Engine } from "../report.js";
import type { Page4 } from "../types.js";
import { narrative, quoteList, scoreBar } from "./common.js";
import { prescriptionTable } from "./rx.js";

// 22 r48 D: BREAK when the lowest stage is "< 45", STABLE when "모두 70 이상"
const [BREAK_BELOW] = numbersIn(reportCell(48, 3), /최저 < (\d+)/) as [number];
const [STABLE_FROM] = numbersIn(reportCell(48, 3), /모두 (\d+) 이상/) as [
  number,
];
// 22 r50 D: "45 미만 끊김 표시"
const [BROKEN_BELOW] = numbersIn(reportCell(50, 3), /(\d+) 미만 끊김/) as [
  number,
];
// 22 r51 D: "점수 낮은 순 3개 단계"
const [BREAK_COUNT] = numbersIn(reportCell(51, 3), /낮은 순 (\d+)개/) as [
  number,
];
// 22 r52 C: "하위 3개에 활동 기록 포함"
const whyMatch = reportCell(52, 2).match(/^하위 (\d+)개에 (.+) 포함$/);
if (!whyMatch?.[1] || !whyMatch[2]) throw new Error("unexpected 22 r52 C");
const WHY_COUNT = Number(whyMatch[1]);
const WHY_CODE = P1_CODES.find((code) => AREAS[code].label === whyMatch[2]);

export function buildPage4(engine: Engine): Page4 {
  const { page1, prescriptions } = engine.scores;
  const [low] = page1.order;
  if (!low) throw new Error("empty PAGE1 order");
  const lowScore = page1.areas[low].score;
  // 22 r48: {top2} = two highest stages, ties in screen order
  const top2 = [...P1_CODES]
    .sort((a, b) => page1.areas[b].score - page1.areas[a].score)
    .slice(0, 2)
    .map((code) => AREAS[code].label);
  const head =
    lowScore < BREAK_BELOW
      ? "CYC_HEAD_BREAK"
      : lowScore < STABLE_FROM
        ? "CYC_HEAD_WEAK"
        : "CYC_HEAD_STABLE";
  return {
    title:
      head === "CYC_HEAD_STABLE"
        ? copy(head)
        : fill(head, { top2: quoteList(top2), low: AREAS[low].label }),
    // 22 r49
    lead: copy("CYC_LEAD"),
    scoreNote: copy("CYC_SCORE_NOTE"),
    // 22 r50
    cycle: {
      stages: P1_CODES.map((code) => ({
        ...scoreBar(code, page1.areas[code], "page1"),
        broken: page1.areas[code].score < BROKEN_BELOW,
      })),
      total: page1.total,
      gradeText: copy("GRADE_PAGE1_ALL_" + page1.level),
      caption: copy("HEX_CAPTION"),
    },
    // 22 r51
    breaks: page1.order
      .slice(0, BREAK_COUNT)
      .map((code) => narrative(code, page1.areas[code].state)),
    // 22 r52
    ...(WHY_CODE && page1.order.slice(0, WHY_COUNT).includes(WHY_CODE)
      ? { why: { heading: copy("CYC_WHY_TITLE"), body: copy("CYCLE_WHY") } }
      : {}),
    // 22 r53
    rx: prescriptionTable(engine, prescriptions.page1),
  };
}
