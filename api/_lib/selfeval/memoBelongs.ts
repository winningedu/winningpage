// 수기 메모가 어느 선택 기록의 것인지 정한다(명세 No.188). 순수 함수만 둔다.
//
// 후보는 코드로만 정한다. 메모 날짜가 그 기록의 실행 구간에 들고, 메모와 기록이 내용 낱말(text.ts
// extractKeywords)을 하나 이상 나눠 가진 선택 기록이다. 실행 구간은 같은 과목의 앞 선택 기록 제출일 다음
// 날부터 이 기록의 제출일까지다(앞 기록이 없으면 제출일까지). 제출일은 submittedAt, 없으면 createdAt 이다.
// 후보가 정확히 하나이고 겹치는 낱말이 서로 다른 둘 이상일 때만 소속을 정하고, 그 밖에는 비워 둔다.
//
// 미구현(열린 항목): 명세는 후보를 모델이 인용으로 확인하게 하지만, 생성 프롬프트를 흔들지 않으려고
// 같은 write 호출에서 확인하지 않는다. 그래서 모델 인용 확인 없이 위 결정론 규칙만 쓴다.

import { submittedAtOf } from "./rows.js";
import { extractKeywords } from "./text.js";
import type { ActivityRecordLike } from "./types.js";

/** 소속을 정하는 데 필요한 서로 다른 겹침 낱말의 최소 개수. */
const MIN_SHARED_WORDS = 2;

export type MemoForBelongs = {
  id: string;
  writtenAt: string | null;
  text: string;
  belongsTo: string | null;
};

const dayOf = (r: ActivityRecordLike): string => submittedAtOf(r).slice(0, 10);

const recordWords = (r: ActivityRecordLike): Set<string> =>
  new Set(
    extractKeywords(
      [r.topic, r.concept, r.method, r.result, r.limitation]
        .filter((v): v is string => typeof v === "string")
        .join(" "),
    ),
  );

/** 소속이 없는 메모마다 결정론 규칙으로 정한 기록 id. 정하지 못한 메모는 결과에 없다. */
export function inferMemoBelongsTo(
  memos: MemoForBelongs[],
  records: ActivityRecordLike[],
): Map<string, string> {
  const windows = records.map((r) => {
    const earlier = records
      .filter((o) => o.id !== r.id && o.subject === r.subject)
      .map(dayOf)
      .filter((d) => d < dayOf(r))
      .sort();
    return {
      record: r,
      from: earlier[earlier.length - 1] ?? null,
      to: dayOf(r),
      words: recordWords(r),
    };
  });
  const out = new Map<string, string>();
  for (const m of memos) {
    if (m.belongsTo !== null || m.writtenAt === null) continue;
    const day = m.writtenAt.slice(0, 10);
    const memoWords = extractKeywords(m.text);
    const candidates = windows
      .filter((w) => (w.from === null || day > w.from) && day <= w.to)
      .map((w) => ({
        id: w.record.id,
        shared: memoWords.filter((k) => w.words.has(k)).length,
      }))
      .filter((c) => c.shared >= 1);
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only !== undefined && only.shared >= MIN_SHARED_WORDS) {
      out.set(m.id, only.id);
    }
  }
  return out;
}
