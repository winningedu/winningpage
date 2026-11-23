// 03장 기 제출 보고서와의 연관성(명세 No.155~157, 183, 192). 대상은 핵심, 주요, 성찰 근거 기록이다.
// 관계와 강도 라벨은 코드가 정하고 설명 문장만 모델이 쓴다.

import type {
  ReportCh03,
  ReportRelation,
  ReportRole,
} from "../../../../src/lib/selfeval/reportTypes.js";
import type { Ch02Result } from "./ch02.js";
import { RELATION_LABELS, STRENGTH_LABELS } from "./copy.js";
import { dotDate } from "./date.js";

const IN_SCOPE: ReadonlySet<ReportRole> = new Set([
  "core",
  "main",
  "reflection",
]);

export function buildCh03(
  ch02: Ch02Result,
  text: (id: string) => string | null,
): ReportCh03 {
  const infos = [...ch02.info.values()]
    .filter((i) => IN_SCOPE.has(i.role))
    .sort(
      (a, b) =>
        Date.parse(a.record.submittedAt) - Date.parse(b.record.submittedAt) ||
        a.tag.localeCompare(b.tag),
    );
  return {
    rows: infos.map((i) => {
      let relation: ReportRelation;
      if (
        i.linkType === "inherit" ||
        i.linkType === "deepen" ||
        i.linkType === "complement"
      ) {
        relation = i.linkType;
      } else if (!i.writing) relation = "complement";
      else relation = i.kind === "deep" ? "deepen" : "inherit";
      return {
        tag: i.tag,
        recordId: i.record.id,
        kind: i.kind,
        title: i.record.topic,
        subject: i.writing ? null : i.subject,
        submittedOn: dotDate(i.record.submittedAt),
        role: i.role,
        relation,
        relationLabel: RELATION_LABELS[relation],
        strengthLabel:
          i.linkStrength === null ? null : STRENGTH_LABELS[i.linkStrength],
        sentenceNumbers: i.sentenceNumbers,
        explanation: text(`relation:${i.tag}`),
      };
    }),
  };
}
