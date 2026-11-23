// 6p 학교생활 \u00b7 입시 준비도 (22 r63-r69).

import { AREAS, type P2Code } from "../codes.js";
import { copy, fill, numbersIn, reportCell } from "../copy.js";
import { OPTIONS } from "../options.js";
import type { Engine } from "../report.js";
import { orderHighToLow } from "../tie.js";
import type { AreaScore, Page6 } from "../types.js";
import { quoteList, scoreBar } from "./common.js";
import { prescriptionTable } from "./rx.js";

// 22 r63 D: "PAGE2 하위 2개 영역"
const [BOTTOM] = numbersIn(reportCell(63, 3), /하위 (\d+)개/) as [number];
// 22 r68 D: "60 이상 높은 순 최대 3개 ... / 60 미만 낮은 순 최대 4개"
const [STRONG_FROM, STRONG_MAX] = numbersIn(
  reportCell(68, 3),
  /(\d+) 이상 높은 순 최대 (\d+)개/,
) as [number, number];
const [WEAK_MAX] = numbersIn(
  reportCell(68, 3),
  /미만 낮은 순 최대 (\d+)개/,
) as [number];

const block = (code: P2Code, part: "STR" | "WEAK") => ({
  heading: AREAS[code].label,
  body: copy("AREA_" + code + "_" + part),
});

export function buildPage6(engine: Engine): Page6 {
  const { scores, answers } = engine;
  const { page2 } = scores;
  const areaOf = (code: P2Code): AreaScore => {
    const area = page2.areas[code];
    if (!area) throw new Error("missing PAGE2 area " + code);
    return area;
  };
  const [low] = page2.order;
  if (!low) throw new Error("empty PAGE2 order");
  const lowLabel = AREAS[low].label;
  const bottom = page2.order.slice(0, BOTTOM);
  // 12번 picks with an area, screen order (the exclusive option has none)
  const picked = OPTIONS.q12[scores.track].flatMap((o) =>
    o.area && answers.q12?.includes(o.ordinal)
      ? [{ label: o.label, area: o.area as P2Code }]
      : [],
  );
  const pickedAreas = [...new Set(picked.map((p) => p.area))];
  const overlapped = pickedAreas.filter((a) => bottom.includes(a));
  const strengths = orderHighToLow(page2.areas, page2.order)
    .filter((code) => areaOf(code).score >= STRONG_FROM)
    .slice(0, STRONG_MAX);
  const weaknesses = page2.order
    .filter((code) => areaOf(code).score < STRONG_FROM)
    .slice(0, WEAK_MAX);
  return {
    // 22 r63
    title:
      picked.length === 0
        ? fill("SCH_HEAD_NONE", { low: lowLabel })
        : overlapped.length > 0
          ? fill("SCH_HEAD_OVERLAP", {
              areas: quoteList(overlapped.map((a) => AREAS[a].label)),
            })
          : fill("SCH_HEAD_DIFF", { low: lowLabel }),
    lead: copy("SCH_LEAD"),
    // 22 r65
    bars: {
      areas: page2.order.map((code) => scoreBar(code, areaOf(code), "page2")),
      total: page2.total,
      gradeText: copy("GRADE_PAGE2_" + scores.track + "_" + page2.level),
    },
    // 22 r66
    ...(picked.length > 0
      ? {
          hardest: picked.map((p) => ({
            option: p.label,
            area: AREAS[p.area].label,
          })),
        }
      : {}),
    // 22 r67
    overlap: copy(
      picked.length === 0
        ? "SCH_OVERLAP_NONE"
        : overlapped.length === pickedAreas.length
          ? "SCH_OVERLAP_ALL"
          : overlapped.length > 0
            ? "SCH_OVERLAP_PART"
            : "SCH_OVERLAP_NO",
    ),
    // 22 r68
    strengths: strengths.map((code) => block(code, "STR")),
    ...(strengths.length === 0
      ? { strengthNote: copy("STR_NONE") }
      : strengths.length === 1
        ? { strengthNote: copy("STR_ONE") }
        : {}),
    weaknesses: weaknesses.map((code) => block(code, "WEAK")),
    // 22 r69
    rx: prescriptionTable(engine, scores.prescriptions.page2),
  };
}
