// 성장설계 회신 재전송 테스트(부록 A 1번, 개발계획 §2 22).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteResult } from "../growth/plan/complete.js";

const loadReplyPendingSessions = vi.fn();
const loadActivityRecordForSession = vi.fn();
const clearReplyPending = vi.fn();

vi.mock("./db.js", () => ({
  loadReplyPendingSessions: (...a: unknown[]) => loadReplyPendingSessions(...a),
  loadActivityRecordForSession: (...a: unknown[]) =>
    loadActivityRecordForSession(...a),
  clearReplyPending: (...a: unknown[]) => clearReplyPending(...a),
}));

const { decideReplyOutcome, resendPendingReplies } = await import("./reply.js");

const okResult = { ok: true, changed: true, item: {} } as CompleteResult;
const failResult = (code: string) =>
  ({ ok: false, code, message: "x" }) as CompleteResult;

describe("decideReplyOutcome", () => {
  it("성공이면 reply_pending 을 풀고 실패면 둔다", () => {
    expect(decideReplyOutcome(okResult)).toBe("clear");
    expect(decideReplyOutcome(failResult("CONFLICT"))).toBe("keep");
    expect(decideReplyOutcome(failResult("ITEM_NOT_FOUND"))).toBe("keep");
  });

  it("변경 없는 성공(이미 완료)도 푼다", () => {
    expect(
      decideReplyOutcome({
        ok: true,
        changed: false,
        reason: "already_done",
        item: {},
      } as CompleteResult),
    ).toBe("clear");
  });
});

describe("resendPendingReplies", () => {
  const db = {} as never;
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("대기 세션이 없으면 아무것도 하지 않고 false 다", async () => {
    loadReplyPendingSessions.mockResolvedValue([]);
    const complete = vi.fn();
    expect(await resendPendingReplies(db, "u1", { complete })).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });

  it("활동 기록으로 회신하고 성공하면 reply_pending 을 푼다", async () => {
    loadReplyPendingSessions.mockResolvedValue([
      { id: "s1", plan_item_id: "p1" },
    ]);
    loadActivityRecordForSession.mockResolvedValue({ id: "r1" });
    const complete = vi.fn().mockResolvedValue(okResult);
    expect(await resendPendingReplies(db, "u1", { complete })).toBe(true);
    expect(complete).toHaveBeenCalledWith(db, "u1", {
      itemId: "p1",
      program: "deep",
      refId: "r1",
    });
    expect(loadActivityRecordForSession).toHaveBeenCalledWith(db, "u1", "s1");
    expect(clearReplyPending).toHaveBeenCalledWith(db, "u1", "s1");
  });

  it("회신이 실패하면 그대로 두고 false 다", async () => {
    loadReplyPendingSessions.mockResolvedValue([
      { id: "s1", plan_item_id: "p1" },
    ]);
    loadActivityRecordForSession.mockResolvedValue({ id: "r1" });
    const complete = vi.fn().mockResolvedValue(failResult("CONFLICT"));
    expect(await resendPendingReplies(db, "u1", { complete })).toBe(false);
    expect(clearReplyPending).not.toHaveBeenCalled();
  });

  it("적립된 활동 기록이 아직 없으면 회신하지 않고 둔다", async () => {
    loadReplyPendingSessions.mockResolvedValue([
      { id: "s1", plan_item_id: "p1" },
    ]);
    loadActivityRecordForSession.mockResolvedValue(null);
    const complete = vi.fn();
    expect(await resendPendingReplies(db, "u1", { complete })).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(clearReplyPending).not.toHaveBeenCalled();
  });

  it("보낼 과제가 없는 세션은 표시만 푼다", async () => {
    loadReplyPendingSessions.mockResolvedValue([
      { id: "s1", plan_item_id: null },
    ]);
    const complete = vi.fn();
    expect(await resendPendingReplies(db, "u1", { complete })).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(clearReplyPending).toHaveBeenCalledWith(db, "u1", "s1");
  });

  it("한 세션이 던져도 다음 세션을 계속 처리한다", async () => {
    loadReplyPendingSessions.mockResolvedValue([
      { id: "s1", plan_item_id: "p1" },
      { id: "s2", plan_item_id: "p2" },
    ]);
    loadActivityRecordForSession.mockResolvedValue({ id: "r" });
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(okResult);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resendPendingReplies(db, "u1", { complete })).toBe(true);
    expect(clearReplyPending).toHaveBeenCalledTimes(1);
    expect(clearReplyPending).toHaveBeenCalledWith(db, "u1", "s2");
  });
});
