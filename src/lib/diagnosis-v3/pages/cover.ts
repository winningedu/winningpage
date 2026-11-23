// 표지 (22 r6-r7; judge-report R6 adds the 1p headline, radar and REPORT_BASIS).

import { copy } from "../copy.js";
import type { Engine } from "../report.js";
import { sheetRows } from "../sheet.js";
import type { CoverPage, Page1 } from "../types.js";
import { gradeLabel, schoolLabel } from "./p1.js";

// 22 section rows (A only): "1p 요약" .. "12~15p 주차별 플래너" .. "16p 서비스 \u00b7 안내".
// No copy id holds page titles, so the section name is the title; a trailing
// "(중3 숨김)" note is not part of it (22 r70).
const TOC = sheetRows("22_리포트요소").flatMap((row) => {
  if (row.c.slice(1).some((v) => v !== null && v !== undefined)) return [];
  const found = String(row.c[0]).match(/^(\d+)(?:~(\d+))?p (.+?)(?: \(.+\))?$/);
  if (!found?.[1] || !found[3]) return [];
  const from = Number(found[1]);
  const to = Number(found[2] ?? found[1]);
  const title = found[3];
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    page: from + i,
    title,
  }));
});
// 22 r70 / r7: the 7p section is the one M3 hides
const HIDDEN_FOR_M3 = 7;

export function buildCover(engine: Engine, p1: Page1): CoverPage {
  const { answers, context, scores } = engine;
  return {
    ...(context.studentName ? { studentName: context.studentName } : {}),
    gradeLabel: gradeLabel(answers),
    schoolTypeLabel: schoolLabel(answers),
    diagnosedAt: context.diagnosedAt,
    toc: TOC.filter(
      (entry) => scores.track !== "M3" || entry.page !== HIDDEN_FOR_M3,
    ),
    headline: p1.title,
    stages: p1.radar.stages,
    basis: copy("REPORT_BASIS"),
  };
}
