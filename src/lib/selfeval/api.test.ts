import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { apiFetchMock, getAuthHeaderMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getAuthHeaderMock: vi.fn(),
}));

vi.mock("../apiFetch", async () => {
  const actual =
    await vi.importActual<typeof import("../apiFetch")>("../apiFetch");
  return {
    ...actual,
    apiFetch: apiFetchMock,
    getAuthHeader: getAuthHeaderMock,
  };
});

import { ApiFetchTimeoutError } from "../apiFetch";
import {
  analyzeResolveConflict,
  analyzeRun,
  analyzeSave,
  createSession,
  discardSession,
  fetchEntry,
  fetchSessionDetail,
  finalizeSession,
  pickList,
  pickManual,
  pickSelect,
  updateSession,
  verifySession,
  writeConfirmFeeling,
  writeEdit,
  writeGenerate,
} from "./api";

const json = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as Response;

beforeEach(() => {
  getAuthHeaderMock.mockResolvedValue({ Authorization: "Bearer tok" });
});
afterEach(() => {
  apiFetchMock.mockReset();
  getAuthHeaderMock.mockReset();
});

function lastCall() {
  const [path, init] = apiFetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    path,
    init,
    body: init.body ? JSON.parse(init.body as string) : null,
  };
}

describe("fetchEntry", () => {
  test("인증 헤더를 실어 GET 하고 성공 본문을 ok 로 돌려준다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true, sessions: [] }));
    const result = await fetchEntry();
    const { path, init } = lastCall();
    expect(path).toBe("/api/selfeval/reports");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
    expect(result).toEqual({ kind: "ok", data: { ok: true, sessions: [] } });
  });

  test("로그인 헤더가 없으면 요청 없이 401 UNAUTHENTICATED 를 돌려준다", async () => {
    getAuthHeaderMock.mockResolvedValue(null);
    const result = await fetchEntry();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "error", status: 401 });
  });

  test("타임아웃은 timeout, 네트워크 실패는 status 0 NETWORK 로 돌려준다", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiFetchTimeoutError());
    expect(await fetchEntry()).toEqual({ kind: "timeout" });
    apiFetchMock.mockRejectedValueOnce(new Error("boom"));
    expect(await fetchEntry()).toMatchObject({
      kind: "error",
      status: 0,
      code: "NETWORK",
    });
  });

  test("오류 본문은 code, message, extra 로 풀어 준다", async () => {
    apiFetchMock.mockResolvedValue(
      json(409, {
        ok: false,
        error: { code: "SESSION_OPEN", message: "작성 중" },
        openSessionId: "s9",
      }),
    );
    expect(await fetchEntry()).toEqual({
      kind: "error",
      status: 409,
      code: "SESSION_OPEN",
      message: "작성 중",
      extra: { openSessionId: "s9" },
    });
  });
});

describe("세션 상세", () => {
  test("sessionId 를 쿼리로 보낸다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await fetchSessionDetail("s 1");
    expect(lastCall().path).toBe("/api/selfeval/reports?sessionId=s+1");
  });
});

describe("세션 생성, 수정, 파기", () => {
  test("create 는 action 과 입력 필드를 한 바디로 보낸다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await createSession({ schoolPrompt: "문항" } as never);
    const { path, init, body } = lastCall();
    expect(path).toBe("/api/selfeval/session");
    expect(init.method).toBe("POST");
    expect(body).toEqual({ action: "create", schoolPrompt: "문항" });
  });

  test("update 는 sessionId 와 patch 를 보낸다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await updateSession("s1", { growthApplied: false });
    expect(lastCall().body).toEqual({
      action: "update",
      sessionId: "s1",
      growthApplied: false,
    });
  });

  test("discard 는 sessionId 만 보낸다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await discardSession("s1");
    expect(lastCall().body).toEqual({ action: "discard", sessionId: "s1" });
  });
});

describe("활동 선택", () => {
  test("list, select, manual 은 같은 엔드포인트에 action 으로 갈린다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await pickList("s1");
    expect(lastCall().path).toBe("/api/selfeval/pick-records");
    expect(lastCall().body).toEqual({ sessionId: "s1", action: "list" });
    await pickSelect("s1", "a1", ["a2"]);
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "select",
      coreId: "a1",
      supportIds: ["a2"],
    });
    await pickManual("s1", { activityName: "x" } as never);
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "manual",
      input: { activityName: "x" },
    });
  });
});

describe("분석, 생성, 검증, 최종 저장", () => {
  test("분석은 action 으로 run, save, resolve-conflict 가 갈린다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await analyzeRun("s1");
    expect(lastCall().path).toBe("/api/selfeval/analyze");
    expect(lastCall().body).toEqual({ sessionId: "s1", action: "run" });
    await analyzeSave("s1", { result: "고친 값" });
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "save",
      edits: { result: "고친 값" },
    });
    await analyzeResolveConflict("s1", 1, "b");
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "resolve-conflict",
      index: 1,
      choice: "b",
    });
  });

  test("생성은 generate, edit, confirm-feeling 이 /write 하나로 간다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await writeGenerate("s1");
    expect(lastCall().path).toBe("/api/selfeval/write");
    expect(lastCall().body).toEqual({ sessionId: "s1", action: "generate" });
    await writeEdit("s1", ["a", "b"]);
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "edit",
      paragraphs: ["a", "b"],
    });
    await writeConfirmFeeling("s1", "p1s2");
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "confirm-feeling",
      sentenceId: "p1s2",
    });
  });

  test("검증은 sessionId 만, 최종 저장은 승격 7항목과 과제 완료 여부를 보낸다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await verifySession("s1");
    expect(lastCall().path).toBe("/api/selfeval/verify");
    expect(lastCall().body).toEqual({ sessionId: "s1" });
    const promoted = {
      topic: "t",
      concept: "c",
      method: "m",
      result: "r",
      limitation: "l",
      numbers: [],
      sources: [],
    };
    await finalizeSession("s1", promoted, true);
    expect(lastCall().path).toBe("/api/selfeval/finalize");
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      promoted,
      fulfillsPlanItem: true,
    });
  });
});
