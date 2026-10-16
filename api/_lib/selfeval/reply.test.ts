import { describe, expect, it } from "vitest";
import { nextReplyState } from "./reply.js";
import type { ReplyPending } from "./types.js";

const prev: ReplyPending = {
  itemId: "i1",
  refId: "r1",
  failedAt: "2026-10-01T00:00:00Z",
  lastError: "옛 오류",
};
const NOW = "2026-10-06T00:00:00Z";

describe("nextReplyState", () => {
  it("성공하면 대기를 비운다", () => {
    expect(
      nextReplyState(prev, { ok: true, changed: true } as never, NOW),
    ).toBeNull();
  });

  it("이미 확정된 항목(변경 없음 성공)도 비운다", () => {
    expect(
      nextReplyState(
        prev,
        { ok: true, changed: false, reason: "already_done" } as never,
        NOW,
      ),
    ).toBeNull();
  });

  it("실패하면 항목과 참조는 두고 오류와 시각만 갱신한다", () => {
    expect(
      nextReplyState(
        prev,
        { ok: false, code: "CONFLICT", message: "다시 불러와 주세요" },
        NOW,
      ),
    ).toEqual({
      itemId: "i1",
      refId: "r1",
      failedAt: NOW,
      lastError: "CONFLICT: 다시 불러와 주세요",
    });
  });
});
