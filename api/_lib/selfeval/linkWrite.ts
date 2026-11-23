// 본문 생성과 검증에서 쓰는 기록 연계 규칙(명세 No.181~195). 순수 함수만 둔다.

import { extractKeywords, extractNumbers } from "./text.js";
import type { ActivityRecordLike } from "./types.js";

/** 생성 입력에 넘기는 구체물 낱말의 상한(명세 No.189). */
const MAX_CARRIED_WORDS = 4;

const asStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter((x) => x !== "")
    : [];

/**
 * 앞 기록의 7항목에서 뽑은, 연계 문장에 적을 구체물 낱말(명세 No.189). 개념명, 자료명, 방법명,
 * 수치를 한 낱말씩 번갈아 최대 네 개를 낸다. 같은 기록이면 항상 같은 결과다.
 */
export function carriedWords(record: ActivityRecordLike): string[] {
  const pools = [
    extractKeywords(record.concept ?? ""),
    asStrings(record.sources),
    extractKeywords(record.method ?? ""),
    asStrings(record.numbers).flatMap((n) => extractNumbers(n)),
  ];
  const out: string[] = [];
  const next = pools.map(() => 0);
  let progressed = true;
  while (out.length < MAX_CARRIED_WORDS && progressed) {
    progressed = false;
    pools.forEach((pool, i) => {
      while (next[i] < pool.length && out.includes(pool[next[i]])) next[i]++;
      if (out.length >= MAX_CARRIED_WORDS || next[i] >= pool.length) return;
      out.push(pool[next[i]++]);
      progressed = true;
    });
  }
  return out;
}
