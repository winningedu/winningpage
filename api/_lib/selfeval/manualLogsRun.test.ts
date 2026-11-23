import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import {
  type ManualDeps,
  type ManualStore,
  type MemoRow,
  runManualLogs,
  UPLOAD_ATTEMPT_CAP,
} from "./manualLogsRun.js";

const SID = "11111111-1111-4111-8111-111111111111";
const session = { id: SID, academic_year: 2026 };

function fakeStore(initial: MemoRow[] = []) {
  const rows = [...initial];
  let seq = 0;
  const store: ManualStore = {
    list: async () => rows.map((r) => ({ ...r })),
    insert: async (items) =>
      items.map((i) => {
        const row: MemoRow = {
          id: `33333333-3333-4333-8333-${String(++seq).padStart(12, "0")}`,
          session_id: i.session_id,
          written_at: i.written_at,
          text: i.text,
          ocr: i.ocr,
          confirmed: false,
          included: true,
          belongs_to: null,
        };
        rows.push(row);
        return { ...row };
      }),
    get: async (_s, id) => rows.find((r) => r.id === id) ?? null,
    update: async (_s, id, patch) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    remove: async (_s, id) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
  return { store, rows };
}

function deps(over: Partial<ManualDeps> = {}) {
  const { store, rows } = fakeStore();
  const counts = new Map<string, number>();
  const d = {
    store,
    extractFile: vi.fn<ManualDeps["extractFile"]>(async () => modelJson()),
    extractText: vi.fn<ManualDeps["extractText"]>(async () => modelJson()),
    attempts: {
      count: (id: string) => counts.get(id) ?? 0,
      add: (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1),
    },
    ...over,
  };
  return { d, rows, store };
}

function modelJson(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    contains_person_name: false,
    memos: [
      { written_at: "2026-04-03", text: "광합성 실험을 했다" },
      { written_at: null, text: "날짜 없는 메모" },
    ],
    ...over,
  });
}

const PNG = { mimeType: "image/png", data: "AAAA" };

describe("runManualLogs upload", () => {
  test("파일을 읽어 메모로 저장한다. ocr 참, 미확인, 포함", async () => {
    const { d, rows } = deps();
    const r = await runManualLogs(
      { sessionId: SID, action: "upload", file: PNG },
      session,
      d,
    );
    expect(r.status).toBe(200);
    expect(vi.mocked(d.extractFile)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(d.extractText)).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      written_at: "2026-04-03",
      ocr: true,
      confirmed: false,
      included: true,
    });
    expect(rows[1]?.written_at).toBeNull();
    expect((r.body.memos as unknown[]).length).toBe(2);
  });

  test("붙여넣은 글은 ocr 거짓이다", async () => {
    const { d, rows } = deps();
    await runManualLogs(
      { sessionId: SID, action: "upload", text: "광합성 실험" },
      session,
      d,
    );
    expect(vi.mocked(d.extractText)).toHaveBeenCalledTimes(1);
    expect(rows.every((r) => r.ocr === false)).toBe(true);
  });

  test("모델에는 원본 바이트를 메모리로만 넘기고 행에는 글만 남는다", async () => {
    const { d, rows } = deps();
    await runManualLogs(
      { sessionId: SID, action: "upload", file: PNG },
      session,
      d,
    );
    const arg = vi.mocked(d.extractFile).mock.calls[0] as [
      { bytes: Buffer; mimeType: string },
    ];
    expect(Buffer.isBuffer(arg[0].bytes)).toBe(true);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          "belongs_to",
          "confirmed",
          "id",
          "included",
          "ocr",
          "session_id",
          "text",
          "written_at",
        ].sort(),
      );
    }
  });

  test("저장소 API 를 쓰지 않는다(소스에 storage 호출이 없다)", () => {
    for (const f of [
      "manualLogs.ts",
      "manualLogsRun.ts",
      "manualLogsDb.ts",
      "manualLogsModel.ts",
      "../../_routes/selfeval/manual-logs.ts",
    ]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src).not.toMatch(/\.storage\b|storage\.from|\.upload\(/);
    }
  });

  test("생활기록부 낱말이 있으면 전체를 거절하고 아무것도 저장하지 않는다", async () => {
    const { d, rows } = deps({
      extractFile: vi.fn(async () =>
        modelJson({
          memos: [
            { written_at: "2026-04-03", text: "정상 메모" },
            { written_at: null, text: "세부능력 및 특기사항 과학" },
          ],
        }),
      ),
    });
    const r = await runManualLogs(
      { sessionId: SID, action: "upload", file: PNG },
      session,
      d,
    );
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("RECORD_BOOK_DETECTED");
    expect(String(r.body.message)).toContain("생활기록부");
    expect(rows).toHaveLength(0);
  });

  test("붙여넣은 글에 양식 낱말이 있으면 모델을 부르지 않고 거절한다", async () => {
    const { d, rows } = deps();
    const r = await runManualLogs(
      { sessionId: SID, action: "upload", text: "행동특성 및 종합의견 ..." },
      session,
      d,
    );
    expect(r.status).toBe(422);
    expect(vi.mocked(d.extractText)).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  test("학교 이름이나 사람 이름이 보이면 안내를 붙이고 막지 않는다", async () => {
    const { d, rows } = deps({
      extractText: vi.fn(async () =>
        modelJson({
          contains_person_name: true,
          memos: [
            { written_at: "2026-04-03", text: "위닝고등학교 동아리" },
            { written_at: "2026-04-04", text: "혼자 했다" },
          ],
        }),
      ),
    });
    const r = await runManualLogs(
      { sessionId: SID, action: "upload", text: "x" },
      session,
      d,
    );
    expect(r.status).toBe(200);
    expect(rows).toHaveLength(2);
    const memos = r.body.memos as { nameNotice: boolean }[];
    expect(memos.map((m) => m.nameNotice)).toEqual([true, true]);
    expect(r.body.personNameDetected).toBe(true);
  });

  test("읽을 글이 없으면 422 이고 저장하지 않는다", async () => {
    const { d, rows } = deps({ extractFile: vi.fn(async () => "없음") });
    const r = await runManualLogs(
      { sessionId: SID, action: "upload", file: PNG },
      session,
      d,
    );
    expect(r.status).toBe(422);
    expect(r.body.code).toBe("NO_TEXT");
    expect(rows).toHaveLength(0);
  });

  test("모델 호출이 실패하면 502 이고 저장하지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { d, rows } = deps({
      extractFile: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const r = await runManualLogs(
      { sessionId: SID, action: "upload", file: PNG },
      session,
      d,
    );
    expect(r.status).toBe(502);
    expect(rows).toHaveLength(0);
  });

  test("세션당 업로드 호출은 10번까지다. 이용 횟수는 쓰지 않는다", async () => {
    const { d } = deps();
    for (let i = 0; i < UPLOAD_ATTEMPT_CAP; i++) {
      const ok = await runManualLogs(
        { sessionId: SID, action: "upload", text: "글" },
        session,
        d,
      );
      expect(ok.status).toBe(200);
    }
    const over = await runManualLogs(
      { sessionId: SID, action: "upload", text: "글" },
      session,
      d,
    );
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("UPLOAD_LIMIT");
    expect(vi.mocked(d.extractText)).toHaveBeenCalledTimes(UPLOAD_ATTEMPT_CAP);
  });
});

describe("runManualLogs 목록과 수정", () => {
  async function withMemos() {
    const ctx = deps();
    await runManualLogs(
      { sessionId: SID, action: "upload", text: "x" },
      session,
      ctx.d,
    );
    return ctx;
  }

  test("list 는 메모 보기 목록을 준다", async () => {
    const { d } = await withMemos();
    const r = await runManualLogs(
      { sessionId: SID, action: "list" },
      session,
      d,
    );
    expect(r.status).toBe(200);
    expect(r.body.memos).toHaveLength(2);
    expect(r.body.memos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          writtenAt: "2026-04-03",
          confirmed: false,
          included: true,
        }),
      ]),
    );
  });

  test("날짜가 없는 메모는 확인할 수 없다", async () => {
    const { d, rows } = await withMemos();
    const memo = rows.find((r) => r.written_at === null) as MemoRow;
    const r = await runManualLogs(
      { sessionId: SID, action: "update", memoId: memo.id, confirmed: true },
      session,
      d,
    );
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("DATE_REQUIRED");
    expect(memo.confirmed).toBe(false);
  });

  test("날짜를 넣으면 확인할 수 있다", async () => {
    const { d, rows } = await withMemos();
    const memo = rows.find((r) => r.written_at === null) as MemoRow;
    const r = await runManualLogs(
      {
        sessionId: SID,
        action: "update",
        memoId: memo.id,
        writtenAt: "2026-05-01",
        confirmed: true,
      },
      session,
      d,
    );
    expect(r.status).toBe(200);
    expect(memo).toMatchObject({ written_at: "2026-05-01", confirmed: true });
  });

  test("학년도 밖 날짜는 확인할 수 없다", async () => {
    const { d, rows } = await withMemos();
    const memo = rows[0] as MemoRow;
    const r = await runManualLogs(
      {
        sessionId: SID,
        action: "update",
        memoId: memo.id,
        writtenAt: "2027-03-01",
        confirmed: true,
      },
      session,
      d,
    );
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("DATE_OUT_OF_YEAR");
  });

  test("확인한 메모의 글을 고치면 다시 미확인이 된다", async () => {
    const { d, rows } = await withMemos();
    const memo = rows[0] as MemoRow;
    await runManualLogs(
      { sessionId: SID, action: "update", memoId: memo.id, confirmed: true },
      session,
      d,
    );
    expect(memo.confirmed).toBe(true);
    await runManualLogs(
      { sessionId: SID, action: "update", memoId: memo.id, text: "고침" },
      session,
      d,
    );
    expect(memo).toMatchObject({ text: "고침", confirmed: false });
  });

  test("set-included 와 delete", async () => {
    const { d, rows } = await withMemos();
    const memo = rows[0] as MemoRow;
    const off = await runManualLogs(
      {
        sessionId: SID,
        action: "set-included",
        memoId: memo.id,
        included: false,
      },
      session,
      d,
    );
    expect(off.status).toBe(200);
    expect(memo.included).toBe(false);
    const del = await runManualLogs(
      { sessionId: SID, action: "delete", memoId: memo.id },
      session,
      d,
    );
    expect(del.status).toBe(200);
    expect(rows).toHaveLength(1);
  });

  test("없는 메모는 404", async () => {
    const { d } = deps();
    const r = await runManualLogs(
      {
        sessionId: SID,
        action: "delete",
        memoId: "22222222-2222-4222-8222-222222222222",
      },
      session,
      d,
    );
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("MEMO_NOT_FOUND");
  });
});
