// 04장 수기 수행보고 연관성(명세 No.162~164, 198). 확인한 수기 메모가 1건 이상일 때만 그린다.
// 날짜, 원문, 문장 번호, 반영률, 요약 틀은 코드가 만들고 연결 설명과 요약 끝 한 문장만 모델이 쓴다.

import type { ReportCh04 } from "../../../../src/lib/selfeval/reportTypes.js";
import type { ReadBody } from "./body.js";
import type { Ch02Result } from "./ch02.js";
import { memoRateTemplate, REASON_LABELS } from "./copy.js";
import { dashToDot } from "./date.js";
import type { BuildInput } from "./inputs.js";

export function buildCh04(
  input: BuildInput,
  body: ReadBody,
  ch02: Ch02Result,
  text: (id: string) => string | null,
): ReportCh04 | null {
  if (input.memos.length === 0) return null;
  const rows = [...input.memos]
    .sort(
      (a, b) =>
        a.writtenAt.localeCompare(b.writtenAt) || a.id.localeCompare(b.id),
    )
    .map((m) => {
      const tag = ch02.memoTags.get(m.id) as string;
      const sentenceNumbers = body.sentences
        .filter((s) => s.refs.some((r) => r.refId === m.id))
        .map((s) => s.n);
      const reflected = sentenceNumbers.length > 0;
      return {
        tag,
        logId: m.id,
        writtenOn: dashToDot(m.writtenAt),
        text: m.text,
        sentenceNumbers,
        reflected,
        explanation: reflected
          ? text(`memo:${tag}`)
          : text(`memoReason:${tag}`),
        reasonLabel: reflected ? null : REASON_LABELS.unrelated,
      };
    });
  const numbers = [...new Set(rows.flatMap((r) => r.sentenceNumbers))].sort(
    (a, b) => a - b,
  );
  const template = memoRateTemplate(
    body.sentences.length,
    numbers.length,
    numbers,
  );
  const sentence = text("memoRate");
  return {
    rows,
    reflectedCount: rows.filter((r) => r.reflected).length,
    totalCount: rows.length,
    sentenceTotal: body.sentences.length,
    sentenceNumbers: numbers,
    summary: sentence === null ? template : `${template}. ${sentence}`,
  };
}
