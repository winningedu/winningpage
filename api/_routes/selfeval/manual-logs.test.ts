// POST /api/selfeval/manual-logs: Hono 라우트를 루트 앱으로 부른다. 이용권 확인, 모양 검사, 학생에게 보이는 규칙 코드, 동작별 응답을 본다.
// DB 계층과 모델은 가짜로 바꾸고 성공 본문은 계약 스키마(shared/selfeval/manual-logs)로 읽는다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  manualLogsDeleteResponseSchema,
  manualLogsListResponseSchema,
  manualLogsMemoResponseSchema,
  manualLogsUploadResponseSchema,
} from "../../../shared/selfeval/manual-logs.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import type { MemoRow } from "../../_lib/selfeval/manualLogsRun.js";

const m = vi.hoisted(() => ({
  state: { supabase: null as unknown },
  access: vi.fn(),
  loadSession: vi.fn(),
  claimUploadAttempt: vi.fn(),
  extractText: vi.fn(),
  extractFile: vi.fn(),
  store: {
    list: vi.fn(),
    insert: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => m.state.supabase,
}));
vi.mock("../../_lib/selfeval/access.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/access.js")>()),
  readSelfevalAccess: m.access,
}));
vi.mock("../../_lib/selfeval/db.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/selfeval/db.js")>()),
  loadSession: m.loadSession,
}));
vi.mock("../../_lib/selfeval/manualLogsDb.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../_lib/selfeval/manualLogsDb.js")
  >()),
  claimUploadAttempt: m.claimUploadAttempt,
  manualLogsStore: () => m.store,
}));
vi.mock("../../_lib/selfeval/manualLogsModel.js", () => ({
  extractFromFile: m.extractFile,
  extractFromText: m.extractText,
}));

import { app } from "../app.js";

const route = { app, path: "/api/selfeval/manual-logs" };
const SID = "11111111-1111-4111-8111-111111111111";
const MID = "22222222-2222-4222-8222-222222222222";
const call = (body: Record<string, unknown>) =>
  callRoute(route, { method: "POST", body: { sessionId: SID, ...body } });

const row = (over: Partial<MemoRow> = {}): MemoRow => ({
  id: MID,
  session_id: SID,
  written_at: "2026-04-03",
  text: "광합성 실험을 했다",
  ocr: false,
  confirmed: false,
  included: true,
  belongs_to: null,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  m.state.supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: "me" } }, error: null }),
    },
  };
  m.access.mockResolvedValue({ allowed: true, tenantReason: null });
  m.loadSession.mockResolvedValue({
    id: SID,
    status: "in_progress",
    academic_year: 2026,
  });
  m.claimUploadAttempt.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("manual-logs access", () => {
  test("answers 409 SESSION_NOT_OPEN when the claim finds the session locked", async () => {
    const { SessionNotOpenError } = await import(
      "../../_lib/selfeval/manualLogsDb.js"
    );
    m.claimUploadAttempt.mockRejectedValue(new SessionNotOpenError());
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: "SESSION_NOT_OPEN" });
    expect(m.extractText).not.toHaveBeenCalled();
  });

  test("answers 409 SESSION_NOT_OPEN for a session that is already closed", async () => {
    m.loadSession.mockResolvedValue({ id: SID, status: "completed" });
    const res = await call({ action: "list" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      code: "SESSION_NOT_OPEN",
      detail: "이미 닫힌 세션이에요.",
    });
  });

  test("answers 404 SESSION_NOT_FOUND for a missing or another student's session", async () => {
    m.loadSession.mockResolvedValue(null);
    const res = await call({ action: "list" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "SESSION_NOT_FOUND" });
  });

  test("rejects a student without an entitlement before reading the session or calling the model", async () => {
    m.access.mockResolvedValue({ allowed: false, tenantReason: null });
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "NO_ENTITLEMENT" });
    expect(m.loadSession).not.toHaveBeenCalled();
    expect(m.claimUploadAttempt).not.toHaveBeenCalled();
    expect(m.extractText).not.toHaveBeenCalled();
  });

  test("counts the upload attempt in the database, not in instance memory", async () => {
    m.extractText.mockResolvedValue(
      JSON.stringify({
        contains_person_name: false,
        memos: [{ written_at: "2026-04-03", text: "광합성 실험을 했다" }],
      }),
    );
    m.claimUploadAttempt.mockResolvedValue(false);
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ code: "UPLOAD_LIMIT" });
    expect(m.claimUploadAttempt).toHaveBeenCalledWith(
      expect.anything(),
      "me",
      SID,
      10,
    );
    expect(m.extractText).not.toHaveBeenCalled();
  });
});

describe("인증과 메서드", () => {
  test("토큰이 없으면 401 UNAUTHENTICATED problem 이고 no-store 가 실린다", async () => {
    const res = await callRoute(route, {
      method: "POST",
      body: { sessionId: SID, action: "list" },
      headers: { authorization: "" },
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  test("POST 가 아니면 405 와 Allow 다", async () => {
    const res = await callRoute(route, { method: "GET" });
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("POST");
  });
});

describe("요청 검사", () => {
  test("모양이 틀린 본문은 이용권을 보기 전에 400 VALIDATION_FAILED 다", async () => {
    for (const body of [
      { sessionId: "x", action: "list" },
      { sessionId: SID, action: "nope" },
      { sessionId: SID, action: "update", memoId: MID, writtenAt: "4월 3일" },
      { sessionId: SID, action: "set-included", memoId: MID },
    ]) {
      const res = await callRoute(route, { method: "POST", body });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(m.access).not.toHaveBeenCalled();
  });

  test("학생에게 보이는 규칙은 자기 code 와 문구를 지킨다", async () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ action: "upload" }, "UPLOAD_INPUT", "글을 붙여넣거나"],
      [
        { action: "upload", text: "a".repeat(6001) },
        "TEXT_TOO_LONG",
        "6000자까지",
      ],
      [
        {
          action: "upload",
          file: { mimeType: "application/zip", data: "AAAA" },
        },
        "FILE_TYPE",
        "PDF 파일만",
      ],
      [
        { action: "upload", file: { mimeType: "image/png", data: "no b64!" } },
        "FILE_INVALID",
        "파일을 읽지 못했어요",
      ],
      [
        {
          action: "upload",
          file: {
            mimeType: "image/png",
            data: "A".repeat(4 * 1024 * 1024 + 8),
          },
        },
        "FILE_TOO_LARGE",
        "3MB까지",
      ],
      [
        { action: "update", memoId: MID, text: "  " },
        "TEXT_REQUIRED",
        "비워 둘 수 없어요",
      ],
      [
        { action: "update", memoId: MID, text: "a".repeat(301) },
        "TEXT_TOO_LONG",
        "300자까지",
      ],
    ];
    for (const [body, code, part] of cases) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code });
      expect((res.body as { detail: string }).detail).toContain(part);
    }
    expect(m.access).not.toHaveBeenCalled();
  });
});

describe("동작별 응답", () => {
  test("list 는 메모 목록을 ok 필드 없이 준다", async () => {
    m.store.list.mockResolvedValue([row()]);
    const res = await call({ action: "list" });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("ok");
    const parsed = manualLogsListResponseSchema.parse(res.body);
    expect(parsed.memos).toEqual([
      {
        id: MID,
        writtenAt: "2026-04-03",
        text: "광합성 실험을 했다",
        ocr: false,
        confirmed: false,
        included: true,
        nameNotice: false,
      },
    ]);
  });

  test("upload 는 읽은 메모와 사람 이름 표시를 준다", async () => {
    m.extractText.mockResolvedValue(
      JSON.stringify({
        contains_person_name: true,
        memos: [{ written_at: "2026-04-03", text: "광합성 실험을 했다" }],
      }),
    );
    m.store.insert.mockResolvedValue([row()]);
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("ok");
    const parsed = manualLogsUploadResponseSchema.parse(res.body);
    expect(parsed.personNameDetected).toBe(true);
    expect(parsed.memos[0]).toMatchObject({ id: MID, nameNotice: true });
  });

  test("생활기록부 양식이면 422 RECORD_BOOK_DETECTED 다", async () => {
    const res = await call({ action: "upload", text: "교과학습발달상황 기록" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "RECORD_BOOK_DETECTED" });
    expect(m.claimUploadAttempt).not.toHaveBeenCalled();
  });

  test("모델 호출이 실패하면 502 MODEL_FAILED 다", async () => {
    m.extractText.mockRejectedValue(new Error("boom"));
    const res = await call({ action: "upload", text: "수행 기록" });
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: "MODEL_FAILED" });
  });

  test("update 는 메모 한 건을 주고 확인할 수 없으면 코드를 지킨다", async () => {
    m.store.get.mockResolvedValue(row({ written_at: null }));
    m.store.update.mockResolvedValue(row({ text: "고친 글" }));
    const ok = await call({ action: "update", memoId: MID, text: "고친 글" });
    expect(ok.status).toBe(200);
    expect(manualLogsMemoResponseSchema.parse(ok.body).memo.text).toBe(
      "고친 글",
    );
    const noDate = await call({
      action: "update",
      memoId: MID,
      confirmed: true,
    });
    expect(noDate.status).toBe(400);
    expect(noDate.body).toMatchObject({ code: "DATE_REQUIRED" });
  });

  test("update 의 메모가 없으면 404 MEMO_NOT_FOUND 다", async () => {
    m.store.get.mockResolvedValue(null);
    const res = await call({ action: "update", memoId: MID, text: "글" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "MEMO_NOT_FOUND" });
  });

  test("set-included 는 메모 한 건을 준다", async () => {
    m.store.update.mockResolvedValue(row({ included: false }));
    const res = await call({
      action: "set-included",
      memoId: MID,
      included: false,
    });
    expect(res.status).toBe(200);
    expect(manualLogsMemoResponseSchema.parse(res.body).memo.included).toBe(
      false,
    );
  });

  test("delete 는 빈 본문을 주고 없는 메모는 404 다", async () => {
    m.store.remove.mockResolvedValueOnce(true);
    const ok = await call({ action: "delete", memoId: MID });
    expect(ok.status).toBe(200);
    expect(manualLogsDeleteResponseSchema.parse(ok.body)).toEqual({});
    m.store.remove.mockResolvedValueOnce(false);
    const missing = await call({ action: "delete", memoId: MID });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "MEMO_NOT_FOUND" });
  });
});
