// POST /api/goal/intake-update 순수 검증 함수 회귀 테스트.
// intake.naesinMogo.test.ts와 같은 규약 — handler I/O(supabase 조회·upsert)는
// 로컬 스택 QA로, 분리 가능한 순수 함수만 여기서 검증한다.
import { describe, expect, it } from "vitest";
import { ensureOwnProfile } from "./intake-update.js";

describe("ensureOwnProfile", () => {
  it("body에 profileId가 없으면 통과시킨다(세션 본인 것만 쓰는 정상 경로)", () => {
    const result = ensureOwnProfile(undefined, "session-user-1");
    expect(result.error).toBeUndefined();
  });

  it("body의 profileId가 세션 본인과 같으면 통과시킨다", () => {
    const result = ensureOwnProfile("session-user-1", "session-user-1");
    expect(result.error).toBeUndefined();
  });

  it("body의 profileId가 세션 본인과 다르면 403을 낸다", () => {
    const result = ensureOwnProfile("other-user-2", "session-user-1");
    expect(result.error?.status).toBe(403);
  });
});
