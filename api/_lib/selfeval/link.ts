// 활동 기록 연계 판정의 순수 규칙(명세 No.174~187). 모델은 후보만 내고, 인정 여부는 여기서 정한다.

import { recordStatusOf, submittedAtOf } from "./rows.js";
import { extractKeywords } from "./text.js";
import {
  type ActivityRecordLike,
  AREA_LABELS,
  type Area,
  CREATIVE_SUBJECT_LINK_TYPES,
  LINK_TYPES,
  type LinkStrength,
  type LinkType,
} from "./types.js";

export type LinkAreaContext = { area: Area; subject: string | null };

/** 모델이 낸 한 쌍의 판정(예 로 답한 것). 유형은 검증 전이라 string 이다. */
export type LinkJudgment = {
  fromId: string;
  toId: string;
  type: string;
  strength: LinkStrength;
  quoteFrom: string;
  quoteTo: string;
};

export type LinkRejectReason =
  | "quote_missing"
  | "bad_type"
  | "area_type"
  | "order"
  | "no_overlap";

export type LinkAcceptance =
  | { ok: true }
  | { ok: false; reason: LinkRejectReason };

export const normalizeSpace = (s: string): string =>
  s.replace(/\s+/g, " ").trim();

const toText = (v: unknown): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(" ");
  return String(v);
};

const join = (parts: unknown[]): string =>
  parts
    .map(toText)
    .filter((s) => s !== "")
    .join(" ");

/** 인용 대조와 모델 입력에 쓰는 원문: 7항목, 요약, 소감(명세 No.176). */
export function linkRecordText(r: ActivityRecordLike): string {
  return join([
    r.topic,
    r.concept,
    r.method,
    r.result,
    r.limitation,
    r.numbers,
    r.sources,
    r.summary,
    r.reflection,
  ]);
}

export { recordStatusOf, submittedAtOf };

const isLinkType = (v: string): v is LinkType =>
  (LINK_TYPES as readonly string[]).includes(v);

const kw = (s: string): Set<string> => new Set(extractKeywords(s));

/**
 * 같은 소재 낱말 말고 개념, 방법, 자료가 겹치거나 넘어갔는가(명세 No.176 4).
 * 한쪽의 개념, 방법, 자료 낱말이 다른 쪽 원문에 나오면 인정한다. 두 주제가 함께 쓰는 낱말은 소재라 뺀다.
 */
function sharesSubstance(
  a: ActivityRecordLike,
  b: ActivityRecordLike,
): boolean {
  const topicShared = new Set(
    [...kw(toText(a.topic))].filter((w) => kw(toText(b.topic)).has(w)),
  );
  const carried = (from: ActivityRecordLike, into: ActivityRecordLike) => {
    const body = kw(linkRecordText(into));
    return [...kw(join([from.concept, from.method, from.sources]))].some(
      (w) => !topicShared.has(w) && body.has(w),
    );
  };
  return carried(a, b) || carried(b, a);
}

/** 창체 영역 세션에서 그 영역 기록이 아닌(교과) 기록은 세 유형으로만 잇는다(명세 No.187). */
function creativeTypeAllowed(
  type: LinkType,
  a: ActivityRecordLike,
  b: ActivityRecordLike,
  ctx: LinkAreaContext,
): boolean {
  if (ctx.area === "subject") return true;
  const inArea = (r: ActivityRecordLike) =>
    r.subjectGroup?.startsWith(AREA_LABELS[ctx.area]) ?? false;
  if (inArea(a) && inArea(b)) return true;
  return (CREATIVE_SUBJECT_LINK_TYPES as readonly string[]).includes(type);
}

export function acceptLink(
  j: LinkJudgment,
  from: ActivityRecordLike,
  to: ActivityRecordLike,
  ctx: LinkAreaContext,
): LinkAcceptance {
  const quoted = (quote: string, r: ActivityRecordLike) => {
    const q = normalizeSpace(quote);
    return q !== "" && normalizeSpace(linkRecordText(r)).includes(q);
  };
  if (!quoted(j.quoteFrom, from) || !quoted(j.quoteTo, to)) {
    return { ok: false, reason: "quote_missing" };
  }
  if (!isLinkType(j.type)) return { ok: false, reason: "bad_type" };
  if (!creativeTypeAllowed(j.type, from, to, ctx)) {
    return { ok: false, reason: "area_type" };
  }
  if (
    (j.type === "inherit" || j.type === "deepen") &&
    !(submittedAtOf(from) < submittedAtOf(to))
  ) {
    return { ok: false, reason: "order" };
  }
  if (!sharesSubstance(from, to)) return { ok: false, reason: "no_overlap" };
  return { ok: true };
}
