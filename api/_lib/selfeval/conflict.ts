// 핵심 활동과 보조 활동 기록 사이의 수치, 기간 충돌 감지(명세 No.40, §6 12).
// 모델 없이 결정론으로 찾고, 학생이 a 또는 b 를 골라 해소한다.

import { extractKeywords, extractNumbers } from "./text.js";
import type { ActivityRecordLike, ConflictRow } from "./types.js";

const TITLE_OVERLAP = 0.8;

/** 작은 쪽 집합 기준 겹침 비율. 한쪽이 비면 0. */
export function overlapRatio(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const small = sa.size <= sb.size ? sa : sb;
  const large = small === sa ? sb : sa;
  if (small.size === 0) return 0;
  let hit = 0;
  for (const w of small) if (large.has(w)) hit += 1;
  return hit / small.size;
}

/** "30명", "1,200", "12.5%" 를 값으로 줄인다. 단위 차이는 같은 수로 본다. 소수 둘째 자리까지 비교한다. */
function normalizeNumber(raw: string): string | null {
  const m = raw.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  return Number.parseFloat(m[0]).toFixed(2);
}

function numberSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const n of extractNumbers(text)) {
    const v = normalizeNumber(n);
    if (v !== null) out.add(v);
  }
  return out;
}

const PERIOD_PATTERN = /(\d+(?:\.\d+)?)\s*(개월|일|주|년)/g;
const DAYS_PER_UNIT: Record<string, number> = {
  일: 1,
  주: 7,
  개월: 30,
  년: 365,
};

function periods(text: string): { days: number; label: string }[] {
  const out: { days: number; label: string }[] = [];
  for (const m of text.matchAll(PERIOD_PATTERN)) {
    const unit = m[2] ?? "";
    out.push({
      days: Number.parseFloat(m[1] ?? "0") * (DAYS_PER_UNIT[unit] ?? 0),
      label: m[0],
    });
  }
  return out;
}

const periodText = (r: ActivityRecordLike) =>
  `${r.method ?? ""} ${r.result ?? ""}`;

export function detectConflicts(
  core: ActivityRecordLike,
  supports: ActivityRecordLike[],
): ConflictRow[] {
  const coreKeys = extractKeywords(core.topic ?? "");
  const rows: ConflictRow[] = [];
  for (const s of supports) {
    // 제목이 다른 기록끼리는 수치가 달라도 당연하다. 같은 일을 다룬 기록만 비교한다.
    if (overlapRatio(coreKeys, extractKeywords(s.topic ?? "")) < TITLE_OVERLAP)
      continue;

    const coreResult = core.result ?? "";
    const supResult = s.result ?? "";
    const na = numberSet(coreResult);
    const nb = numberSet(supResult);
    const onlyOneSide =
      [...na].some((v) => !nb.has(v)) || [...nb].some((v) => !na.has(v));
    // 한쪽에 수치가 아예 없으면 충돌이 아니라 누락이다.
    if (na.size > 0 && nb.size > 0 && onlyOneSide) {
      rows.push({
        kind: "numbers",
        a: { activityId: core.id, text: extractNumbers(coreResult).join(", ") },
        b: { activityId: s.id, text: extractNumbers(supResult).join(", ") },
        resolved: null,
      });
    }

    const pa = periods(periodText(core));
    const pb = periods(periodText(s));
    if (pa.length > 0 && pb.length > 0) {
      const da = new Set(pa.map((p) => p.days));
      const db = new Set(pb.map((p) => p.days));
      if ([...da].some((d) => !db.has(d)) || [...db].some((d) => !da.has(d))) {
        rows.push({
          kind: "period",
          a: { activityId: core.id, text: pa.map((p) => p.label).join(", ") },
          b: { activityId: s.id, text: pb.map((p) => p.label).join(", ") },
          resolved: null,
        });
      }
    }
  }
  return rows;
}

export function resolveConflict(
  rows: ConflictRow[],
  index: number,
  choice: "a" | "b",
): ConflictRow[] {
  return rows.map((r, i) =>
    i === index ? { ...r, resolved: choice === "a" ? r.a.text : r.b.text } : r,
  );
}
