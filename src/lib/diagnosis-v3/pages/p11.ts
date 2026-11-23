// 11p 4주 플랜 head, urgency and style tips (22 r101, r102, r106); the plan
// parts come from plan.ts buildPlanPage (22 r103-r105, r107).

import { copy, copyCell, reportCell } from "../copy.js";
import { buildPlanPage } from "../plan.js";
import type { Engine } from "../report.js";
import type { Page11 } from "../types.js";

export function buildPage11(
  engine: Engine,
  methods: readonly string[],
): Page11 {
  const { scores, answers, context } = engine;
  const urgencyId = "URG_" + scores.urgency.level;
  const mbti = scores.mbti?.type;
  // 22 r106: temperament method lines, then the MBTI J/P tip and E/I tip
  const styleTips = [
    ...methods,
    ...(mbti
      ? [copy("MBTI_TIP_" + mbti.charAt(3)), copy("MBTI_TIP_" + mbti.charAt(0))]
      : []),
  ];
  return {
    title: copy("PLAN_HEAD"),
    lead: copy("PLAN_LEAD"),
    // 22 r102, judge-report R5: 22 B102 title, points, 06 B label and URG text
    urgency: {
      title: reportCell(102, 1),
      points: scores.urgency.points,
      label: copyCell("06_긴급도", urgencyId, 1),
      text: copy(urgencyId),
    },
    ...buildPlanPage(scores.plan, context.diagnosedAt, answers.q13),
    ...(styleTips.length > 0 ? { styleTips } : {}),
  };
}
