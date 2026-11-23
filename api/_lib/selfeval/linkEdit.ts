// 학생의 연계 편집 규칙(명세 No.180, 185, 186, 194). 순수 모듈이다. 저장은 호출부가 한다.

import { LINK_TYPES, type LinkType, type RecordLink } from "./types.js";

type Found = { ok: true; link: RecordLink };
type NotFound = { ok: false; code: "LINK_NOT_FOUND"; message: string };

const samePair = (l: RecordLink, a: string, b: string): boolean =>
  (l.fromId === a && l.toId === b) || (l.fromId === b && l.toId === a);

const findLink = (links: RecordLink[], a: string, b: string) =>
  links.find((l) => samePair(l, a, b));

const NOT_FOUND: NotFound = {
  ok: false,
  code: "LINK_NOT_FOUND",
  message: "해당 연계를 찾을 수 없어요.",
};

/** 학생이 선을 지운다. 행은 남기고 deleted 만 켜서 모델이 같은 쌍을 다시 제안하지 못하게 한다. */
export function applyDeleteLink(
  links: RecordLink[],
  a: string,
  b: string,
): Found | NotFound {
  const l = findLink(links, a, b);
  return l ? { ok: true, link: { ...l, deleted: true } } : NOT_FOUND;
}

/** 암묵 연계를 "실제로 이어서 했어요" 로 확인한다. 지운 연계는 되살리지 않는다. */
export function applyConfirmLink(
  links: RecordLink[],
  a: string,
  b: string,
): Found | NotFound {
  const l = findLink(links, a, b);
  return l && !l.deleted
    ? { ok: true, link: { ...l, confirmed: true } }
    : NOT_FOUND;
}

export type AddLinkRequest = {
  fromId: string;
  toId: string;
  type: string;
  note: string;
};

export type AddLinkResult =
  | Found
  | {
      ok: false;
      code:
        | "NOTE_REQUIRED"
        | "INVALID_LINK_TYPE"
        | "UNKNOWN_ACTIVITY"
        | "SAME_ACTIVITY";
      message: string;
    };

/** 학생이 새로 긋는 선. 한 줄 설명이 필요하고 근거는 학생 입력이라 명시, 확인됨으로 저장한다. */
export function applyAddLink(
  links: RecordLink[],
  req: AddLinkRequest,
  knownIds: ReadonlySet<string>,
): AddLinkResult {
  const note = req.note.trim();
  if (note === "") {
    return {
      ok: false,
      code: "NOTE_REQUIRED",
      message: "어떻게 이어지는지 한 줄로 적어 주세요.",
    };
  }
  if (!(LINK_TYPES as readonly string[]).includes(req.type)) {
    return {
      ok: false,
      code: "INVALID_LINK_TYPE",
      message: "연계 유형이 올바르지 않아요.",
    };
  }
  if (req.fromId === req.toId) {
    return {
      ok: false,
      code: "SAME_ACTIVITY",
      message: "같은 기록끼리는 이을 수 없어요.",
    };
  }
  if (!knownIds.has(req.fromId) || !knownIds.has(req.toId)) {
    return {
      ok: false,
      code: "UNKNOWN_ACTIVITY",
      message: "목록에 없는 활동이에요.",
    };
  }
  const existing = findLink(links, req.fromId, req.toId);
  return {
    ok: true,
    link: {
      fromId: existing?.fromId ?? req.fromId,
      toId: existing?.toId ?? req.toId,
      type: req.type as LinkType,
      strength: "explicit",
      source: "student",
      confirmed: true,
      deleted: false,
      note,
      quoteFrom: null,
      quoteTo: null,
    },
  };
}

/** 이미 저장된 쌍(지운 것 포함, 방향 무관)은 빼고 새 쌍만 남긴다. */
export function mergeNewModelLinks(
  stored: RecordLink[],
  proposed: RecordLink[],
): RecordLink[] {
  return proposed.filter((p) => !findLink(stored, p.fromId, p.toId));
}
