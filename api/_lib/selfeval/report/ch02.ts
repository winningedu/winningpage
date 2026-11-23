// 02장 과목별 수행, 심화 활동(명세 No.146, 149~154, 183). 꼬리표 번호, 반영 문장, 역할 라벨,
// 반영도 점, 미반영 이유를 모두 코드가 정한다. 모델 문장은 text(id)로만 들어온다.

import type {
  ReportCh02,
  ReportCh02Row,
  ReportCh02Subject,
  ReportRecordKind,
  ReportRole,
  ReportTagMap,
  ReportUnreflectedReason,
} from "../../../../src/lib/selfeval/reportTypes.js";
import type { ReadBody } from "./body.js";
import { REASON_LABELS, ROLE_LABELS, recommendText } from "./copy.js";
import { dotDate } from "./date.js";
import type { BuildInput, LinkType, ReportRecord } from "./inputs.js";

export type RecordInfo = {
  record: ReportRecord;
  tag: string;
  kind: ReportRecordKind;
  subject: string;
  writing: boolean;
  sentenceNumbers: number[];
  role: ReportRole;
  linkType: LinkType | null;
  /** 그 기록에 붙은 연계(라벨 대상일 때)의 강도와 확인 여부. */
  linkStrength: "explicit" | "implicit" | null;
  /** 주로 쓰인 항목(최빈값). */
  mainItem: string | null;
};

export type Ch02Result = {
  ch02: ReportCh02;
  tagMap: ReportTagMap;
  info: Map<string, RecordInfo>;
  /** 수기 id 에서 꼬리표. */
  memoTags: Map<string, string>;
  tagOf: (id: string) => string | null;
};

const KIND_LETTER: Record<ReportRecordKind, string> = {
  performance: "P",
  deep: "D",
  activity: "A",
};

export function recordKind(
  r: ReportRecord,
  area: BuildInput["session"]["area"],
): ReportRecordKind {
  if (r.sourceProgram === "performance") return "performance";
  if (r.sourceProgram === "deep") return "deep";
  return r.entryKind ?? (area === "subject" ? "performance" : "activity");
}

const LINK_PRIORITY: LinkType[] = [
  "deepen",
  "inherit",
  "grade_continue",
  "complement",
  "borrow_method",
  "area_extend",
  "background",
];

function mode(items: string[]): string | null {
  const counts = new Map<string, number>();
  for (const i of items) {
    if (i !== "") counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

const toTokens = (v: unknown): string[] => {
  if (v == null) return [];
  const list = Array.isArray(v) ? v : [v];
  return list.map((x) => String(x).trim()).filter((x) => x !== "");
};

function roleByLink(type: LinkType, coreOrMain: ReportRole): ReportRole {
  switch (type) {
    case "inherit":
    case "deepen":
      return coreOrMain;
    case "grade_continue":
      return "main";
    case "complement":
      return "reflection";
    case "borrow_method":
    case "area_extend":
      return "support";
    case "background":
      return "indirect";
  }
}

function reasonOf(
  role: ReportRole,
  record: ReportRecord,
  writing: boolean,
): ReportUnreflectedReason | null {
  if (record.recordStatus === "plan") return "plan";
  if (role !== "unreflected") return null;
  return writing ? "unrelated" : "other_subject";
}

export function buildCh02(
  input: BuildInput,
  body: ReadBody,
  text: (id: string) => string | null,
): Ch02Result {
  const { session } = input;
  const subjectOf = (r: ReportRecord) => r.subject ?? "";
  const kindOf = (r: ReportRecord) => recordKind(r, session.area);

  const groups = new Map<string, ReportRecord[]>();
  for (const r of input.records) {
    const list = groups.get(subjectOf(r)) ?? [];
    list.push(r);
    groups.set(subjectOf(r), list);
  }
  const isWritingGroup = (key: string) =>
    session.area === "subject"
      ? key === session.subject
      : (groups.get(key) ?? []).some((r) => r.selectedRole !== null);

  const refsOf = (id: string) =>
    body.sentences.flatMap((s) =>
      s.refs.filter((x) => x.refId === id).map((x) => ({ s, ref: x })),
    );
  const sentenceNumbersOf = (id: string) =>
    body.sentences
      .filter((s) => s.refs.some((x) => x.refId === id))
      .map((s) => s.n);

  const byDate = (a: ReportRecord, b: ReportRecord) =>
    Date.parse(a.submittedAt) - Date.parse(b.submittedAt) ||
    a.id.localeCompare(b.id);

  // 과목 순서: 작성 과목, 반영된 과목(가장 이른 제출일), 미반영 과목.
  const earliest = (key: string) =>
    Math.min(...(groups.get(key) ?? []).map((r) => Date.parse(r.submittedAt)));
  const reflectedGroup = (key: string) =>
    (groups.get(key) ?? []).some((r) => sentenceNumbersOf(r.id).length > 0);
  const rank = (key: string) =>
    isWritingGroup(key) ? 0 : reflectedGroup(key) ? 1 : 2;
  const order = [...groups.keys()].sort(
    (a, b) =>
      rank(a) - rank(b) || earliest(a) - earliest(b) || a.localeCompare(b),
  );

  // 꼬리표. 이미 고정된 번호는 그대로 두고 새 기록만 다음 번호를 받는다.
  const tagMap: ReportTagMap = { ...(input.tagMap ?? {}) };
  const tagById = new Map(Object.entries(tagMap).map(([tag, id]) => [id, tag]));
  const counters: Record<string, number> = {};
  for (const tag of Object.keys(tagMap)) {
    const letter = tag.slice(0, 1);
    counters[letter] = Math.max(counters[letter] ?? 0, Number(tag.slice(1)));
  }
  const assign = (letter: string, id: string): string => {
    const known = tagById.get(id);
    if (known !== undefined) return known;
    counters[letter] = (counters[letter] ?? 0) + 1;
    const tag = `${letter}${counters[letter]}`;
    tagMap[tag] = id;
    tagById.set(id, tag);
    return tag;
  };
  const ordered: ReportRecord[] = [];
  for (const key of order) {
    ordered.push(...[...(groups.get(key) ?? [])].sort(byDate));
  }
  for (const r of ordered) assign(KIND_LETTER[kindOf(r)], r.id);
  const memoTags = new Map<string, string>();
  for (const m of [...input.memos].sort(
    (a, b) =>
      a.writtenAt.localeCompare(b.writtenAt) || a.id.localeCompare(b.id),
  )) {
    memoTags.set(m.id, assign("H", m.id));
  }

  // 연계 유형 라벨(No.183). 작성 과목 밖 기록이 있으면 그 기록이, 둘 다 안이면 나중 기록이 라벨을 받는다.
  const byId = new Map(input.records.map((r) => [r.id, r]));
  const linkOf = new Map<
    string,
    { type: LinkType; strength: "explicit" | "implicit" }
  >();
  for (const l of input.links) {
    const from = byId.get(l.fromRecordId);
    const to = byId.get(l.toRecordId);
    if (from === undefined || to === undefined) continue;
    const fromW = isWritingGroup(subjectOf(from));
    const toW = isWritingGroup(subjectOf(to));
    const labeled =
      fromW !== toW ? (fromW ? to : from) : byDate(from, to) > 0 ? from : to;
    const prev = linkOf.get(labeled.id);
    if (
      prev === undefined ||
      LINK_PRIORITY.indexOf(l.linkType) < LINK_PRIORITY.indexOf(prev.type)
    ) {
      linkOf.set(labeled.id, { type: l.linkType, strength: l.strength });
    }
  }

  const info = new Map<string, RecordInfo>();
  for (const r of ordered) {
    const refs = refsOf(r.id);
    const numbers = sentenceNumbersOf(r.id);
    const writing = isWritingGroup(subjectOf(r));
    const mainItem = mode(refs.map((x) => x.ref.item));
    const coreOrMain: ReportRole =
      r.selectedRole === "core" || numbers.length >= 3 ? "core" : "main";
    const link = linkOf.get(r.id) ?? null;
    let role: ReportRole;
    if (r.recordStatus !== "completed") role = "in_progress";
    else if (numbers.length === 0) role = "unreflected";
    else if (link !== null) role = roleByLink(link.type, coreOrMain);
    else if (writing) role = coreOrMain;
    else if (mainItem === "limitation" || mainItem === "learning") {
      role = "reflection";
    } else if (mainItem === "method") role = "support";
    else role = "indirect";
    info.set(r.id, {
      record: r,
      tag: tagById.get(r.id) as string,
      kind: kindOf(r),
      subject: subjectOf(r),
      writing,
      sentenceNumbers: numbers,
      role,
      linkType: link?.type ?? null,
      linkStrength: link?.strength ?? null,
      mainItem,
    });
  }

  const dotsOf = (r: ReportRecord, numbers: number[]): number => {
    if (numbers.length === 0) return 0;
    const tokens = [...toTokens(r.numbers), ...toTokens(r.sources)];
    const copied = body.sentences.some(
      (s) => numbers.includes(s.n) && tokens.some((t) => s.text.includes(t)),
    );
    return Math.min(4, numbers.length) + (copied ? 1 : 0);
  };

  const subjects: ReportCh02Subject[] = order.map((key) => {
    const records = [...(groups.get(key) ?? [])].sort(byDate);
    const counts = { performance: 0, deep: 0, activity: 0 };
    const inProgress = { performance: 0, deep: 0, activity: 0 };
    for (const r of records) {
      counts[kindOf(r)] += 1;
      if (r.recordStatus !== "completed") inProgress[kindOf(r)] += 1;
    }
    const reflected = new Set<number>();
    const rows: ReportCh02Row[] = records.map((r) => {
      const i = info.get(r.id) as RecordInfo;
      for (const n of i.sentenceNumbers) reflected.add(n);
      const reasonCode = reasonOf(i.role, r, i.writing);
      const unreflected = i.role === "unreflected";
      return {
        tag: i.tag,
        recordId: r.id,
        kind: i.kind,
        title: r.topic,
        submittedOn:
          r.recordStatus === "completed" ? dotDate(r.submittedAt) : null,
        inProgress: r.recordStatus !== "completed",
        summary: r.summary ?? text(`summary:${i.tag}`),
        sentenceNumbers: i.sentenceNumbers,
        role: i.role,
        roleLabel: ROLE_LABELS[i.role],
        dots: dotsOf(r, i.sentenceNumbers),
        reasonCode,
        reasonLabel: reasonCode === null ? null : REASON_LABELS[reasonCode],
        reasonText: unreflected ? text(`reason:${i.tag}`) : null,
        recommendation:
          unreflected && key !== "" && !input.completedSubjects.includes(key)
            ? recommendText(key)
            : null,
      };
    });
    const course =
      records.find((r) => r.courseName !== null)?.courseName ?? null;
    return {
      subject: key,
      label: course !== null && course !== key ? `${key} (${course})` : key,
      writing: isWritingGroup(key),
      counts,
      inProgress,
      reflectedSentenceCount: reflected.size,
      rows,
    };
  });

  return {
    ch02: { subjects },
    tagMap,
    info,
    memoTags,
    tagOf: (id) => tagById.get(id) ?? null,
  };
}
