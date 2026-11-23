// 최종 본문 읽기(명세 No.145~147, 199, 200). 문장에 번호를 붙이고 근거를 정규화한다.
// 근거는 리포트에 실린 기록(진행 중이 아닌 것)과 확인한 수기 메모만 남긴다. 옛 저장 모양도 읽는다.

import { normalizeEvidence, sentenceSpan } from "../evidence.js";
import type { ReportMemo, ReportRecord } from "./inputs.js";

export type EvidenceRef = {
  refId: string;
  kind: "record" | "memo";
  item: string;
  weight: "main" | "sub";
};

export type BodySentence = {
  n: number;
  text: string;
  refs: EvidenceRef[];
  /** 학생이 직접 고친 문장이라 근거가 학생 수정이다. */
  student: boolean;
  needsConfirm: boolean;
};

export type ReadBody = {
  sentences: BodySentence[];
  /** 문단별 문장 목록(같은 객체). */
  paragraphs: BodySentence[][];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function readBody(
  sections: unknown,
  ctx: { records: ReportRecord[]; memos: ReportMemo[] },
): ReadBody {
  const records = new Map(ctx.records.map((r) => [r.id, r]));
  const memos = new Set(ctx.memos.map((m) => m.id));
  const paragraphsRaw =
    isRecord(sections) && Array.isArray(sections.paragraphs)
      ? sections.paragraphs
      : [];
  const sentences: BodySentence[] = [];
  let next = 1;
  const paragraphs: BodySentence[][] = [];
  for (const p of paragraphsRaw) {
    const list: BodySentence[] = [];
    const raw = isRecord(p) && Array.isArray(p.sentences) ? p.sentences : [];
    for (const s of raw) {
      if (!isRecord(s) || typeof s.text !== "string") continue;
      const evidence = normalizeEvidence(s.evidence);
      let droppedInProgress = false;
      const refs: EvidenceRef[] = [];
      const seen = new Set<string>();
      for (const w of ["main", "sub"] as const) {
        for (const ev of evidence) {
          if (ev.refId === null || ev.weight !== w || seen.has(ev.refId))
            continue;
          const record = records.get(ev.refId);
          if (record !== undefined) {
            // 진행 중이거나 계획인 기록은 근거로 쓰지 않는다(No.200).
            if (record.recordStatus !== "completed") {
              droppedInProgress = true;
              continue;
            }
            seen.add(ev.refId);
            refs.push({
              refId: ev.refId,
              kind: "record",
              item: ev.item,
              weight: w,
            });
          } else if (memos.has(ev.refId)) {
            seen.add(ev.refId);
            refs.push({
              refId: ev.refId,
              kind: "memo",
              item: ev.item,
              weight: w,
            });
          }
        }
      }
      const student = evidence.some((ev) => ev.sourceType === "S");
      const sentence: BodySentence = {
        n: next,
        text: s.text,
        refs,
        student,
        needsConfirm: (refs.length === 0 && !student) || droppedInProgress,
      };
      next += sentenceSpan(s.text);
      sentences.push(sentence);
      list.push(sentence);
    }
    paragraphs.push(list);
  }
  return { sentences, paragraphs };
}
