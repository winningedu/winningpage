// Helpers shared by the page builders: score bars and the area copy ids of
// 03, 04 and 05.

import { AREAS, type AreaCode } from "../codes.js";
import { copy, copyCell } from "../copy.js";
import { AREA_STATE_LABELS, TARGET_SCORE } from "../scoring.js";
import { COPY_SHEETS } from "../source/copyText.js";
import type { AreaScore, AreaState, ScoreBar } from "../types.js";

/** 06 r20-r23 labels: PAGE1 labels for PAGE1 and MIND, PAGE2 labels for PAGE2. */
export function scoreBar(
  code: AreaCode,
  area: AreaScore,
  page: "page1" | "page2",
): ScoreBar {
  return {
    code,
    label: AREAS[code].label,
    score: area.score,
    state: AREA_STATE_LABELS[page][area.state],
    stateCode: area.state,
  };
}

// 06 r20-r23 order TOP, MID, LOW, WEAK; 04 lists each area's NARR rows in the
// same order (상위, 보통, 보완, 취약; 계산 예시 D14).
const STATE_ORDER = Object.keys(AREA_STATE_LABELS.page1) as AreaState[];
const NARR_IDS = (COPY_SHEETS["04_진단서술"] ?? [])
  .map((row) => String(row.c[0]))
  .filter((id) => id.startsWith("NARR_"));

/** 04 id of the area and state: NARR_<code>_<04 C>. */
export function narrId(code: AreaCode, state: AreaState): string {
  const ids = NARR_IDS.filter((id) => id.startsWith("NARR_" + code + "_"));
  const id = ids[STATE_ORDER.indexOf(state)];
  if (id === undefined) throw new Error("no NARR row for " + code + state);
  return id;
}

/** 04 D 소제목 and E 본문 of the area's state. */
export function narrative(code: AreaCode, state: AreaState) {
  const id = narrId(code, state);
  return { heading: copyCell("04_진단서술", id, 3), body: copy(id) };
}

/** 05 NEXT_<code>_개선 below the 06 C8 target, else _유지 (22 r11, r119). */
export function nextText(code: AreaCode, score: number): string {
  return copy("NEXT_" + code + (score < TARGET_SCORE ? "_개선" : "_유지"));
}

/** Area labels in single quotes, comma separated, as PDF p4 and p5 print {top2} and {areas}. */
export const quoteList = (labels: readonly string[]) =>
  labels.map((label) => "\u2018" + label + "\u2019").join(", ");
