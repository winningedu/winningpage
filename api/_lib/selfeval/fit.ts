// 서사 적합도 결정론 계산(명세 No.30, No.73, §6 1~9).
// 모델 없이 활동 기록 한 건이 "이번 자기평가서 재료로 얼마나 알맞은가"를 0~100 으로 낸다.

import { overlapRatio } from "./conflict.js";
import { JUDGMENT_WORDS, SELF_MADE_WORDS } from "./dictionaries.js";
import { normalizeSubject } from "./growth.js";
import { extractKeywords, extractNumbers } from "./text.js";
import {
  type ActivityRecordLike,
  AREA_LABELS,
  type Area,
  type FitResult,
  type FitSignal,
  type FitSignalKey,
  type GrowthSnapshot,
} from "./types.js";

export const FIT_WEIGHTS: Record<FitSignalKey, number> = {
  same_subject: 18,
  has_judgment: 12,
  has_limitation: 12,
  numbers_two_plus: 10,
  self_made: 8,
  too_short: -10,
  repeated_topic: -10,
  year_gap: -8,
  aligned_signal: 10,
  conflicting_signal: -15,
  fills_weak_axis: 10,
};

/** 기본 신호의 양수 합. 연동 신호가 없을 때 이 값을 100 으로 놓고 정규화한다. */
const BASE_POSITIVE_TOTAL = 60;
const ALIGNED_CAP = 40;
const REPEATED_TOPIC_OVERLAP = 0.6;
const SHORT_LENGTH = 40;
const YEAR_GAP_LIMIT = 2;

export type FitContext = {
  area: Area;
  subject: string | null;
  activityName: string | null;
  others: ActivityRecordLike[];
  growth: GrowthSnapshot | null;
  growthApplied: boolean;
};

const BASE_KEYS: FitSignalKey[] = [
  "same_subject",
  "has_judgment",
  "has_limitation",
  "numbers_two_plus",
  "self_made",
  "too_short",
  "repeated_topic",
  "year_gap",
];

const REASONS: Partial<Record<FitSignalKey, string>> = {
  same_subject: "작성하려는 과목과 같은 과목의 기록입니다",
  has_judgment: "결과에 대한 본인의 판단이 기록돼 있습니다",
  has_limitation: "한계를 적어 두어 다음 단계로 이어지기 좋습니다",
  numbers_two_plus: "근거로 쓸 수치가 두 개 이상 있습니다",
  self_made: "자료를 직접 만든 흔적이 있습니다",
  fills_weak_axis: "성장설계가 지목한 부족 축을 채울 수 있는 기록입니다",
};

const text = (v: string | null | undefined) => v ?? "";
const listText = (v: unknown): string =>
  Array.isArray(v) ? v.map(String).join(" ") : text(v as string | null);

/** (학년, 학기) 를 순서값으로. 고1-1 이 1, 고3-2 가 6. 학년 정보가 없으면 null. */
function termOrder(r: ActivityRecordLike): number | null {
  if (r.gradeLabel == null || r.semester == null) return null;
  const grade = { 고1: 1, 고2: 2, 고3: 3 }[r.gradeLabel];
  return (grade - 1) * 2 + r.semester;
}

function sameSubject(a: ActivityRecordLike, ctx: FitContext): boolean {
  if (ctx.area === "subject") {
    const want = ctx.subject ? normalizeSubject(ctx.subject) : "";
    if (want === "") return false;
    return [a.subjectGroup, a.subject].some(
      (s) => s != null && normalizeSubject(s) === want,
    );
  }
  return a.subjectGroup?.startsWith(AREA_LABELS[ctx.area]) ?? false;
}

function yearGap(a: ActivityRecordLike, others: ActivityRecordLike[]): boolean {
  const mine = termOrder(a);
  if (mine === null) return false;
  let nearest: number | null = null;
  for (const o of others) {
    const t = termOrder(o);
    if (t === null || t >= mine) continue;
    if (nearest === null || t > nearest) nearest = t;
  }
  return nearest !== null && mine - nearest > YEAR_GAP_LIMIT;
}

function repeatedTopic(
  a: ActivityRecordLike,
  others: ActivityRecordLike[],
): boolean {
  const mine = extractKeywords(text(a.topic));
  return others.some(
    (o) =>
      o.id !== a.id &&
      overlapRatio(mine, extractKeywords(text(o.topic))) >=
        REPEATED_TOPIC_OVERLAP,
  );
}

export function computeFit(
  activity: ActivityRecordLike,
  ctx: FitContext,
): FitResult {
  const result = text(activity.result);
  const baseHits: Record<string, boolean> = {
    same_subject: sameSubject(activity, ctx),
    has_judgment: JUDGMENT_WORDS.some((w) => result.includes(w)),
    has_limitation: text(activity.limitation).trim() !== "",
    numbers_two_plus:
      (Array.isArray(activity.numbers) ? activity.numbers.length : 0) +
        extractNumbers(result).length >=
      2,
    self_made: SELF_MADE_WORDS.some((w) =>
      `${text(activity.method)} ${listText(activity.sources)}`.includes(w),
    ),
    too_short: text(activity.method).length + result.length < SHORT_LENGTH,
    repeated_topic: repeatedTopic(activity, ctx.others),
    year_gap: yearGap(activity, ctx.others),
  };

  const signals: FitSignal[] = BASE_KEYS.map((key) => ({
    key,
    hit: baseHits[key] === true,
    delta: baseHits[key] === true ? FIT_WEIGHTS[key] : 0,
  }));
  const reasons: string[] = [];
  for (const s of signals) {
    const msg = REASONS[s.key];
    if (s.hit && msg && FIT_WEIGHTS[s.key] > 0) reasons.push(msg);
  }

  let linked = false;
  const g = ctx.growthApplied ? ctx.growth : null;
  if (g) {
    const body = [
      activity.topic,
      activity.concept,
      activity.method,
      activity.result,
      activity.limitation,
    ]
      .map(text)
      .join(" ");
    const firstKeyword = (sentence: string) =>
      extractKeywords(sentence).find((k) => body.includes(k));

    const alignedKeys = g.alignedSignals
      .map(firstKeyword)
      .filter((k): k is string => k !== undefined);
    const alignedDelta = Math.min(
      ALIGNED_CAP,
      alignedKeys.length * FIT_WEIGHTS.aligned_signal,
    );
    signals.push({
      key: "aligned_signal",
      hit: alignedKeys.length > 0,
      delta: alignedDelta,
    });
    if (alignedKeys[0] !== undefined) {
      reasons.push(
        `이번 방향의 핵심인 ${alignedKeys[0]}에 해당하는 기록이 있습니다`,
      );
    }

    const conflicting = g.conflictingSignals.some(
      (s) => firstKeyword(s) !== undefined,
    );
    signals.push({
      key: "conflicting_signal",
      hit: conflicting,
      delta: conflicting ? FIT_WEIGHTS.conflicting_signal : 0,
    });

    const fillsWeak = g.weakAxes.some(
      (w) => firstKeyword(w.guideline) !== undefined,
    );
    signals.push({
      key: "fills_weak_axis",
      hit: fillsWeak,
      delta: fillsWeak ? FIT_WEIGHTS.fills_weak_axis : 0,
    });
    if (fillsWeak) reasons.push(REASONS.fills_weak_axis as string);

    linked = alignedKeys.length > 0 || conflicting || fillsWeak;
  }

  const raw = signals.reduce((sum, s) => sum + s.delta, 0);
  // 연동 신호가 켜지면 60 을 100 으로 늘리지 않는다. 가점이 이미 100 을 넘을 수 있어 클램프만 한다.
  const scaled = linked ? raw : (raw / BASE_POSITIVE_TOTAL) * 100;
  const score = Math.max(0, Math.min(100, Math.round(scaled)));
  return { activityId: activity.id, score, signals, reasons: dedupe(reasons) };
}

const dedupe = (xs: string[]) => [...new Set(xs)];
