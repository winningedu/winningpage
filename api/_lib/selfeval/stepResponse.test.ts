import { describe, expect, it, vi } from "vitest";

vi.mock("../httpResponse.js", () => ({
  sendError: (
    res: { status: (n: number) => { json: (b: unknown) => void } },
    _shape: string,
    status: number,
    message: string,
    code: string,
    extra: Record<string, unknown>,
  ) => res.status(status).json({ ...extra, code, message }),
}));

import type { SessionRow } from "./rows.js";
import { checkSessionOpen, sendOutcome } from "./stepResponse.js";

function fakeRes() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(n: number) {
      sent.status = n;
      return { json: (b: unknown) => (sent.body = b) };
    },
  };
  return { res: res as never, sent };
}

describe("sendOutcome", () => {
  it("모델 단계 성공은 본문에 attempts 와 softIssues 를 덧붙인다", () => {
    const { res, sent } = fakeRes();
    sendOutcome(
      res,
      { kind: "ok", result: { x: 1 }, attempts: 2, softIssues: [] },
      (r) => ({ value: r.x }),
    );
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({
      ok: true,
      value: 1,
      attempts: 2,
      softIssues: [],
    });
  });

  it("모델을 부르지 않는 성공(done)은 본문만 보낸다", () => {
    const { res, sent } = fakeRes();
    sendOutcome(res, { kind: "done", result: { x: 1 } }, (r) => ({
      value: r.x,
    }));
    expect(sent).toEqual({ status: 200, body: { ok: true, value: 1 } });
  });

  it("거절은 코드가 붙은 실패 응답이다", () => {
    const { res, sent } = fakeRes();
    sendOutcome(res, { kind: "order", currentStep: 2 }, () => ({}));
    expect(sent.status).toBe(409);
    expect(sent.body).toMatchObject({
      ok: false,
      code: "STEP_ORDER",
      currentStep: 2,
    });
  });

  it("실패 응답에 reversed 와 terminal 이 실린다", () => {
    const { res, sent } = fakeRes();
    sendOutcome(
      res,
      {
        kind: "failure",
        failure: "validation",
        issues: [],
        attempts: 10,
        terminal: true,
        reversed: true,
      },
      () => ({}),
    );
    expect(sent.status).toBe(422);
    expect(sent.body).toMatchObject({ reversed: true, terminal: true });
  });
});

describe("checkSessionOpen", () => {
  const row = (status: SessionRow["status"]) => ({ status }) as SessionRow;

  it("draft 와 in_progress 는 열린 세션이다", () => {
    expect(checkSessionOpen(row("draft"), false)).toBeNull();
    expect(checkSessionOpen(row("in_progress"), false)).toBeNull();
  });

  it("completed 와 archived 는 409 SESSION_NOT_OPEN 이다", () => {
    expect(checkSessionOpen(row("completed"), false)).toMatchObject({
      status: 409,
      code: "SESSION_NOT_OPEN",
    });
    expect(checkSessionOpen(row("archived"), true)).toMatchObject({
      code: "SESSION_NOT_OPEN",
    });
  });

  it("완료 허용이면 completed 는 통과한다", () => {
    expect(checkSessionOpen(row("completed"), true)).toBeNull();
  });
});
