// 본문 생성과 근거 다시 고르기가 읽는 근거 원천 행(명세 No.144, 145, 161).
// activity_records 의 새 컬럼, 기록 연결, 수기 메모를 읽는다. service_role 로 읽으므로 모든 쿼리에
// 세션 또는 profile_id 조건을 건다. 단위 테스트는 두지 않는다(db.ts 와 같은 약속).

import { type Db, must } from "../growth/intake/collectDb.js";
import type { LinkInfo, MemoRow, RecordExtras } from "./evidenceSources.js";
import type { RecordStatus } from "./types.js";

export type EvidenceRows = {
  extras: Map<string, RecordExtras>;
  links: LinkInfo[];
  memos: MemoRow[];
};

type ExtraDbRow = {
  id: string;
  record_status: RecordStatus | null;
  entry_kind: string | null;
  summary: string | null;
  reflection: string | null;
};

type LinkDbRow = {
  from_record_id: string;
  to_record_id: string;
  link_type: string;
  strength: "explicit" | "implicit";
  source: "model" | "student";
  confirmed: boolean;
  deleted: boolean;
  note: string | null;
  quote_from: string | null;
  quote_to: string | null;
};

type MemoDbRow = {
  id: string;
  written_at: string | null;
  text: string;
  confirmed: boolean;
  included: boolean;
  belongs_to: string | null;
};

/** 학생이 확인했고 포함으로 둔 이 세션의 수기 메모. 화면이 문장 근거로 고르게 한다. */
export async function loadIncludedMemos(
  db: Db,
  sessionId: string,
): Promise<{ id: string; writtenAt: string | null; text: string }[]> {
  const rows = must(
    await db
      .from("selfeval_manual_logs")
      .select("id, written_at, text")
      .eq("session_id", sessionId)
      .eq("confirmed", true)
      .eq("included", true)
      .order("written_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    "selfeval_manual_logs 조회 실패",
  ) as { id: string; written_at: string | null; text: string }[];
  return rows.map((m) => ({ id: m.id, writtenAt: m.written_at, text: m.text }));
}

/** 세션에 선택된 기록의 새 컬럼, 선택 기록 사이의 연결, 이 세션의 수기 메모를 읽는다. */
export async function loadEvidenceRows(
  db: Db,
  userId: string,
  sessionId: string,
  recordIds: string[],
): Promise<EvidenceRows> {
  const [extraRows, linkRows, memoRows] = await Promise.all([
    recordIds.length === 0
      ? Promise.resolve([] as ExtraDbRow[])
      : (must(
          await db
            .from("activity_records")
            .select("id, record_status, entry_kind, summary, reflection")
            .eq("profile_id", userId)
            .in("id", recordIds),
          "activity_records 근거 컬럼 조회 실패",
        ) as ExtraDbRow[]),
    must(
      await db
        .from("selfeval_record_links")
        .select(
          "from_record_id, to_record_id, link_type, strength, source, confirmed, deleted, note, quote_from, quote_to",
        )
        .eq("session_id", sessionId),
      "selfeval_record_links 조회 실패",
    ) as LinkDbRow[],
    must(
      await db
        .from("selfeval_manual_logs")
        .select("id, written_at, text, confirmed, included, belongs_to")
        .eq("session_id", sessionId)
        .order("written_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      "selfeval_manual_logs 조회 실패",
    ) as MemoDbRow[],
  ]);
  const selected = new Set(recordIds);
  return {
    extras: new Map(
      extraRows.map((r) => [
        r.id,
        {
          recordStatus: r.record_status,
          entryKind: r.entry_kind,
          summary: r.summary,
          reflection: r.reflection,
        },
      ]),
    ),
    links: linkRows
      .filter(
        (l) => selected.has(l.from_record_id) && selected.has(l.to_record_id),
      )
      .map((l) => ({
        fromRecordId: l.from_record_id,
        toRecordId: l.to_record_id,
        linkType: l.link_type,
        strength: l.strength,
        source: l.source,
        confirmed: l.confirmed,
        deleted: l.deleted,
        note: l.note,
        quoteFrom: l.quote_from,
        quoteTo: l.quote_to,
      })),
    memos: memoRows.map((m) => ({
      id: m.id,
      writtenAt: m.written_at,
      text: m.text,
      confirmed: m.confirmed,
      included: m.included,
      belongsTo: m.belongs_to,
    })),
  };
}

/**
 * 결정론으로 정한 메모 소속을 저장한다(명세 No.188). 아직 비어 있는 메모만 채워, 그 사이 학생이 정한
 * 소속을 덮어쓰지 않는다. 같은 값을 다시 써도 결과가 같다.
 */
export async function saveMemoBelongsTo(
  db: Db,
  sessionId: string,
  assigned: ReadonlyMap<string, string>,
): Promise<void> {
  for (const [memoId, recordId] of assigned) {
    must(
      await db
        .from("selfeval_manual_logs")
        .update({ belongs_to: recordId })
        .eq("session_id", sessionId)
        .eq("id", memoId)
        .is("belongs_to", null)
        .select("id"),
      "selfeval_manual_logs 소속 저장 실패",
    );
  }
}
