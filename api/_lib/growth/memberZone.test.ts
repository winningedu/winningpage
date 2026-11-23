import { describe, expect, it } from "vitest";
import type { Db } from "./intake/collectDb.js";
import { loadMemberTimeZone } from "./memberZone.js";

function fakeDb(result: { data: unknown; error: { message: string } | null }) {
  const calls: unknown[][] = [];
  const chain = {
    select: (...a: unknown[]) => {
      calls.push(["select", ...a]);
      return chain;
    },
    eq: (...a: unknown[]) => {
      calls.push(["eq", ...a]);
      return chain;
    },
    maybeSingle: async () => result,
  };
  const db = {
    from: (t: string) => {
      calls.push(["from", t]);
      return chain;
    },
  } as unknown as Db;
  return { db, calls };
}

describe("loadMemberTimeZone", () => {
  it("회원 프로필의 time_zone 을 돌려준다", async () => {
    const { db, calls } = fakeDb({
      data: { time_zone: "America/Los_Angeles" },
      error: null,
    });
    await expect(loadMemberTimeZone(db, "u1")).resolves.toBe(
      "America/Los_Angeles",
    );
    expect(calls).toContainEqual(["from", "profiles"]);
    expect(calls).toContainEqual(["eq", "id", "u1"]);
  });

  it("프로필이 없으면 던진다(대체 시간대 없음)", async () => {
    const { db } = fakeDb({ data: null, error: null });
    await expect(loadMemberTimeZone(db, "u1")).rejects.toThrow();
  });
});
