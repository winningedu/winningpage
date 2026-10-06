import { describe, expect, it } from "vitest";
import {
  assertParentOfChild,
  isApprovedLink,
  NotLinkedError,
} from "./parentAccess.js";

describe("isApprovedLink", () => {
  it("승인된 연결 행이 있으면 true", () => {
    expect(isApprovedLink({ status: "approved" })).toBe(true);
  });
  it("행이 없거나 승인 전이면 false", () => {
    expect(isApprovedLink(null)).toBe(false);
    expect(isApprovedLink({ status: "pending" })).toBe(false);
    expect(isApprovedLink({ status: "rejected" })).toBe(false);
  });
});

function fakeDb(result: { data: unknown; error: { message: string } | null }) {
  const calls: [string, unknown][] = [];
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => {
      calls.push([k, v]);
      return chain;
    },
    maybeSingle: async () => result,
  };
  return { db: { from: () => chain } as never, calls };
}

describe("assertParentOfChild", () => {
  it("parent_id, student_id, approved 로 조회하고 통과한다", async () => {
    const { db, calls } = fakeDb({ data: { status: "approved" }, error: null });
    await expect(assertParentOfChild(db, "p", "c")).resolves.toBeUndefined();
    expect(calls).toEqual([
      ["parent_id", "p"],
      ["student_id", "c"],
      ["status", "approved"],
    ]);
  });
  it("연결이 없으면 NotLinkedError", async () => {
    const { db } = fakeDb({ data: null, error: null });
    await expect(assertParentOfChild(db, "p", "c")).rejects.toBeInstanceOf(
      NotLinkedError,
    );
  });
  it("조회 오류는 NotLinkedError 가 아니라 그대로 던진다", async () => {
    const { db } = fakeDb({ data: null, error: { message: "boom" } });
    const err = await assertParentOfChild(db, "p", "c").catch((e) => e);
    expect(err).not.toBeInstanceOf(NotLinkedError);
  });
});
