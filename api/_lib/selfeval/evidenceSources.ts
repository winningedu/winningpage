// 본문 생성 입력과 근거 원천 조립(명세 No.144, 145, 161, 200). 순수 함수만 둔다.
// 읽기(DB)는 steps/write.ts 의 호출자가 맡고, 여기는 읽어 온 행을 근거 원천과 프롬프트 입력으로 바꾼다.
// activity_records 의 새 컬럼(record_status, entry_kind, summary, reflection)은 ActivityRecordLike 에
// 아직 없어서 RecordExtras 로 따로 받는다.

import type {
  EvidenceSources,
  MemoEvidenceSource,
  RecordEvidenceSource,
} from "./evidence.js";
import {
  type LinkInfo,
  neverLinkedIds,
  type SupportLinkState,
  supportLinkStates,
} from "./linkWrite.js";
import { recordStatusOf } from "./rows.js";
import {
  type ActivityRecordLike,
  type Analysis,
  type AnalysisField,
  BODY_EVIDENCE_FIELDS,
  type RecordStatus,
} from "./types.js";
import type { SessionActivityWithRecord } from "./view.js";

const SUBJECT_GROUP_LABEL = "교과";

export type RecordExtras = {
  recordStatus: RecordStatus | null;
  entryKind: string | null;
  summary: string | null;
  reflection: string | null;
};

export type { LinkInfo };

export type MemoRow = {
  id: string;
  writtenAt: string | null;
  text: string;
  confirmed: boolean;
  included: boolean;
  belongsTo: string | null;
};

/**
 * 근거 출처 유형(명세 No.145). 직접 입력은 entry_kind(performance, deep, activity)로 정하고,
 * entry_kind 가 없으면 영역으로 정한다(교과는 P, 그 밖은 A). 수행평가와 심화탐구 기록은
 * 출처 프로그램으로 정한다.
 */
export function sourceTypeOfRecord(
  r: Pick<ActivityRecordLike, "sourceProgram" | "subjectGroup"> & {
    entryKind: string | null;
  },
): "P" | "D" | "A" {
  if (r.sourceProgram === "performance") return "P";
  if (r.sourceProgram === "deep") return "D";
  if (r.entryKind === "performance") return "P";
  if (r.entryKind === "deep") return "D";
  if (r.entryKind === "activity") return "A";
  return r.subjectGroup === SUBJECT_GROUP_LABEL ? "P" : "A";
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** 다른 선택 기록 요약. 7항목과 요약, 성찰 중 값이 있는 것을 "라벨: 값" 으로 " / " 로 잇는다. */
export function supportSummary(
  r: ActivityRecordLike,
  extras: Pick<RecordExtras, "summary" | "reflection">,
): string {
  const parts: [string, string][] = [
    ["주제", r.topic ?? ""],
    ["개념", r.concept ?? ""],
    ["방법", r.method ?? ""],
    ["결과", r.result ?? ""],
    ["한계", r.limitation ?? ""],
    ["수치", asStrings(r.numbers).join(", ")],
    ["자료", asStrings(r.sources).join(", ")],
    ["요약", extras.summary ?? ""],
    ["성찰", extras.reflection ?? ""],
  ];
  return parts
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join(" / ");
}

const RECORD_ITEM_FIELDS = [
  "concept",
  "method",
  "result",
  "limitation",
] as const;

function isAnalysis(raw: unknown): raw is Analysis {
  const a = raw as Partial<Analysis> | null;
  return (
    typeof a === "object" &&
    a !== null &&
    typeof a.values === "object" &&
    a.values !== null &&
    typeof a.sources === "object" &&
    a.sources !== null
  );
}

/**
 * 근거로 쓸 수 있는 항목의 글. 분석이 있으면 분석에서 비운 항목(출처 empty, 빈 값)을 빼고 읽고,
 * 분석이 없는 기록은 기록 자체의 개념, 방법, 결과, 한계를 쓴다. 다음 단계는 본문 근거가 아니다.
 */
function itemTextsOf(
  record: ActivityRecordLike,
  rawAnalysis: unknown,
): Partial<Record<AnalysisField, string>> {
  const out: Partial<Record<AnalysisField, string>> = {};
  if (isAnalysis(rawAnalysis)) {
    for (const f of BODY_EVIDENCE_FIELDS) {
      const text = rawAnalysis.values[f]?.trim() ?? "";
      if (rawAnalysis.sources[f] !== "empty" && text !== "") out[f] = text;
    }
    return out;
  }
  for (const f of RECORD_ITEM_FIELDS) {
    const text = record[f]?.trim() ?? "";
    if (text !== "") out[f] = text;
  }
  return out;
}

export type PromptRecordInfo = {
  activityId: string;
  sourceType: "P" | "D" | "A";
  summary: string;
  /** 연계 문장을 쓸 기록이면 연계 유형, 단계, 강도, 인용. 기여 항목으로만 쓰면 null. */
  link: string | null;
  /** link 는 연계 문장을 쓰고, contribute 는 기여 항목으로만 쓴다(명세 No.181, 193~195). */
  linkMode: "link" | "contribute";
  /** 연계 문장에 적을 앞 기록의 구체물 낱말(명세 No.189). */
  carried: string[];
  items: AnalysisField[];
};

export type WriteEvidence = {
  sources: EvidenceSources;
  prompt: {
    coreSourceType: "P" | "D" | "A";
    supports: PromptRecordInfo[];
    memos: { id: string; writtenAt: string | null; text: string }[];
  };
  /** 완료된 선택 기록(핵심 밖)마다 연계 문장 규칙. 생성 검사와 검증이 읽는다. */
  linkStates: SupportLinkState[];
  /** 옛 리포트의 {activityId, field} 를 읽을 때 쓰는 출처 유형 조회. */
  typeOf: (activityId: string) => "P" | "D" | "A" | null;
};

const STRENGTH_LABELS = { explicit: "명시", implicit: "암묵" } as const;

function linkText(s: SupportLinkState): string | null {
  if (s.mode !== "link" || s.typeLabel === null || s.strength === null) {
    return null;
  }
  return [
    `연계 유형 ${s.typeLabel}`,
    `핵심에서 ${s.hop}단계`,
    STRENGTH_LABELS[s.strength],
    s.confirmed ? "학생 확인" : "학생 미확인",
    ...s.quotes.map((q) => `인용 "${q}"`),
  ].join(", ");
}

/**
 * 선택 기록 행과 이번 세션의 수기 메모에서 근거 원천과 프롬프트 입력을 만든다.
 * 완료(completed)가 아닌 기록은 근거 원천에는 남겨 그 근거를 서버가 알아보고 버리게 하되,
 * 프롬프트에서는 빼서 모델이 쓰지 않게 한다(명세 No.200). 수기 메모는 학생이 확인하고
 * 포함으로 둔 것만 쓴다(명세 No.161).
 * 연계 점검이 끝났으면(linksChecked) 핵심 밖 선택 기록 가운데 연결 행이 한 줄도 닿지 않은 기록은
 * 학생이 한 줄을 쓰지 않은 것이라 생성 입력과 근거에서 뺀다(명세 No.180). 연계를 모두 지운 기록은
 * 행이 남아 있어 빼지 않고 기여 항목으로만 쓴다(명세 No.194).
 */
export function buildWriteEvidence(
  rows: SessionActivityWithRecord[],
  extras: Map<string, RecordExtras>,
  links: LinkInfo[],
  linksChecked: boolean,
  memoRows: MemoRow[],
): WriteEvidence {
  const records: RecordEvidenceSource[] = [];
  const supports: PromptRecordInfo[] = [];
  const coreRow = rows.find((r) => r.role === "core");
  const states =
    coreRow === undefined
      ? new Map<string, SupportLinkState>()
      : supportLinkStates(
          rows.map((r) => r.record),
          coreRow.activity_record_id,
          rows
            .filter((r) => r.role !== "core")
            .map((r) => r.activity_record_id),
          links,
        );
  const excluded = new Set(
    linksChecked
      ? neverLinkedIds(
          rows
            .filter((r) => r.role !== "core")
            .map((r) => r.activity_record_id),
          links.map((l) => [l.fromRecordId, l.toRecordId] as const),
        )
      : [],
  );
  const linkStates: SupportLinkState[] = [];
  let coreSourceType: "P" | "D" | "A" = "A";
  const types = new Map<string, "P" | "D" | "A">();
  for (const row of rows) {
    if (excluded.has(row.activity_record_id)) {
      types.set(
        row.activity_record_id,
        sourceTypeOfRecord({
          sourceProgram: row.record.sourceProgram,
          subjectGroup: row.record.subjectGroup,
          entryKind: extras.get(row.activity_record_id)?.entryKind ?? null,
        }),
      );
      continue;
    }
    const extra = extras.get(row.activity_record_id) ?? {
      recordStatus: null,
      entryKind: null,
      summary: null,
      reflection: null,
    };
    const sourceType = sourceTypeOfRecord({
      sourceProgram: row.record.sourceProgram,
      subjectGroup: row.record.subjectGroup,
      entryKind: extra.entryKind,
    });
    const itemTexts = itemTextsOf(row.record, row.analysis);
    const completed =
      recordStatusOf({
        recordStatus: extra.recordStatus,
        status: row.record.status,
      }) === "completed";
    types.set(row.activity_record_id, sourceType);
    records.push({
      id: row.activity_record_id,
      sourceType,
      completed,
      itemTexts,
    });
    if (row.role === "core") {
      coreSourceType = sourceType;
    } else if (completed) {
      const state = states.get(row.activity_record_id);
      if (state === undefined) throw new Error("연계 상태를 찾지 못했습니다.");
      linkStates.push(state);
      supports.push({
        activityId: row.activity_record_id,
        sourceType,
        summary: supportSummary(row.record, extra),
        link: linkText(state),
        linkMode: state.mode,
        carried: state.carried,
        items: Object.keys(itemTexts) as AnalysisField[],
      });
    }
  }
  const usable = memoRows.filter((m) => m.confirmed && m.included);
  const memos: MemoEvidenceSource[] = usable.map((m) => ({
    id: m.id,
    text: m.text,
    belongsTo: m.belongsTo,
  }));
  return {
    sources: { records, memos },
    prompt: {
      coreSourceType,
      supports,
      memos: usable.map((m) => ({
        id: m.id,
        writtenAt: m.writtenAt,
        text: m.text,
      })),
    },
    linkStates,
    typeOf: (id) => types.get(id) ?? null,
  };
}
