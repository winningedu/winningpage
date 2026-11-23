// 수기 메모 동작 본체(명세 No.158~161, 77, 90, 91). 저장소와 모델 호출은 deps 로 받는다.
// 원본 파일은 메모리 바이트로만 모델에 넘기고 저장하지 않는다. 글자를 뽑은 뒤에는 참조를 버린다.
// 이용 횟수는 쓰지 않는다. 모델 호출 횟수만 세션당 10번으로 막고, 센 값은 DB 에 남긴다.

import {
  checkConfirmable,
  detectRecordBook,
  type ManualLogsBody,
  needsNameNotice,
  parseExtraction,
} from "./manualLogs.js";

export const UPLOAD_ATTEMPT_CAP = 10;

export type MemoRow = {
  id: string;
  session_id: string;
  written_at: string | null;
  text: string;
  ocr: boolean;
  confirmed: boolean;
  included: boolean;
  belongs_to: string | null;
};

export type MemoInsert = Pick<
  MemoRow,
  "session_id" | "written_at" | "text" | "ocr"
>;

export type MemoPatch = Partial<
  Pick<MemoRow, "written_at" | "text" | "confirmed" | "included">
>;

export type ManualStore = {
  list(sessionId: string): Promise<MemoRow[]>;
  insert(rows: MemoInsert[]): Promise<MemoRow[]>;
  get(sessionId: string, memoId: string): Promise<MemoRow | null>;
  update(
    sessionId: string,
    memoId: string,
    patch: MemoPatch,
  ): Promise<MemoRow | null>;
  remove(sessionId: string, memoId: string): Promise<boolean>;
};

export type ManualDeps = {
  store: ManualStore;
  extractFile(file: { bytes: Buffer; mimeType: string }): Promise<string>;
  extractText(text: string): Promise<string>;
  /** 호출 하나를 센다. 상한 안이면 true, 다 썼으면 false. */
  attempts: { claim(sessionId: string): Promise<boolean> };
};

export type RunResult = { status: number; body: Record<string, unknown> };

export type MemoView = {
  id: string;
  writtenAt: string | null;
  text: string;
  ocr: boolean;
  confirmed: boolean;
  included: boolean;
  nameNotice: boolean;
};

const err = (status: number, code: string, message: string): RunResult => ({
  status,
  body: { ok: false, code, message },
});

const RECORD_BOOK_MESSAGE = (word: string) =>
  `생활기록부 양식으로 보여서 올릴 수 없어요(${word}). 생활기록부 원문은 받지 않고, 올리신 내용은 저장하지 않았어요. 직접 쓴 수행 기록만 올려 주세요.`;

export function toView(row: MemoRow, personName = false): MemoView {
  return {
    id: row.id,
    writtenAt: row.written_at,
    text: row.text,
    ocr: row.ocr,
    confirmed: row.confirmed,
    included: row.included,
    nameNotice: needsNameNotice(row.text, personName),
  };
}

type SessionLike = { id: string; academic_year: number | null };

async function upload(
  body: Extract<ManualLogsBody, { action: "upload" }>,
  session: SessionLike,
  deps: ManualDeps,
): Promise<RunResult> {
  if (body.text !== undefined) {
    const word = detectRecordBook(body.text);
    if (word)
      return err(422, "RECORD_BOOK_DETECTED", RECORD_BOOK_MESSAGE(word));
  }
  if (!(await deps.attempts.claim(session.id))) {
    return err(
      429,
      "UPLOAD_LIMIT",
      `한 자기평가서에서 올릴 수 있는 횟수(${UPLOAD_ATTEMPT_CAP}번)를 다 썼어요. 이미 올린 메모를 고쳐서 써 주세요.`,
    );
  }

  let raw: string;
  try {
    raw = body.file
      ? await deps.extractFile({
          bytes: Buffer.from(body.file.data, "base64"),
          mimeType: body.file.mimeType,
        })
      : await deps.extractText(body.text ?? "");
  } catch (e) {
    // 메모 글은 기록하지 않는다. 오류 종류만 남긴다.
    console.error("selfeval/manual-logs 모델 호출 실패:", (e as Error).name);
    return err(
      502,
      "MODEL_FAILED",
      "글자를 읽지 못했어요. 잠시 후 다시 시도해 주세요. 이용 횟수는 쓰지 않았어요.",
    );
  }

  const parsed = parseExtraction(raw);
  if (!parsed.ok) {
    return err(
      422,
      "NO_TEXT",
      "읽을 수 있는 글이 없었어요. 글씨가 또렷하게 보이도록 다시 찍거나, 글을 직접 붙여넣어 주세요.",
    );
  }
  const word = detectRecordBook(parsed.memos.map((m) => m.text).join("\n"));
  if (word) return err(422, "RECORD_BOOK_DETECTED", RECORD_BOOK_MESSAGE(word));

  const rows = await deps.store.insert(
    parsed.memos.map((m) => ({
      session_id: session.id,
      written_at: m.writtenAt,
      text: m.text,
      ocr: body.file !== undefined,
    })),
  );
  return {
    status: 200,
    body: {
      ok: true,
      memos: rows.map((r) => toView(r, parsed.containsPersonName)),
      personNameDetected: parsed.containsPersonName,
    },
  };
}

async function update(
  body: Extract<ManualLogsBody, { action: "update" }>,
  session: SessionLike,
  deps: ManualDeps,
): Promise<RunResult> {
  const memo = await deps.store.get(session.id, body.memoId);
  if (!memo) return notFound();
  const merged = {
    writtenAt: body.writtenAt ?? memo.written_at,
    text: body.text ?? memo.text,
  };
  const changed =
    merged.writtenAt !== memo.written_at || merged.text !== memo.text;
  const confirmed = body.confirmed ?? (changed ? false : memo.confirmed);
  if (confirmed) {
    const check = checkConfirmable(merged, session.academic_year);
    if (!check.ok) return err(400, check.code, check.message);
  }
  const saved = await deps.store.update(session.id, body.memoId, {
    written_at: merged.writtenAt,
    text: merged.text,
    confirmed,
  });
  if (!saved) return notFound();
  return { status: 200, body: { ok: true, memo: toView(saved) } };
}

const notFound = () =>
  err(404, "MEMO_NOT_FOUND", "메모를 찾을 수 없어요. 새로고침해 주세요.");

export async function runManualLogs(
  body: ManualLogsBody,
  session: SessionLike,
  deps: ManualDeps,
): Promise<RunResult> {
  switch (body.action) {
    case "list": {
      const rows = await deps.store.list(session.id);
      return {
        status: 200,
        body: { ok: true, memos: rows.map((r) => toView(r)) },
      };
    }
    case "upload":
      return upload(body, session, deps);
    case "update":
      return update(body, session, deps);
    case "set-included": {
      const saved = await deps.store.update(session.id, body.memoId, {
        included: body.included,
      });
      return saved
        ? { status: 200, body: { ok: true, memo: toView(saved) } }
        : notFound();
    }
    case "delete":
      return (await deps.store.remove(session.id, body.memoId))
        ? { status: 200, body: { ok: true } }
        : notFound();
  }
}
