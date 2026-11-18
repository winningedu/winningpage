// api/_routes/reset-password-by-phone.ts의 resolveResetTarget(guardian_phone 경로 분기 판정) 검증.
// 라우트 핸들러 전체(supabase 조회·auth admin 호출)는 reset-password-by-phone.choose.test.ts가 다룬다.

import { describe, expect, test } from "vitest";
import { resolveResetTarget } from "./reset-password-by-phone.js";

// resolveResetTarget — guardian_phone 경로(2026-09-03)의 분기 판정. I/O 없는
// 순수 함수라 로컬에서 바로 검증한다.
describe("resolveResetTarget", () => {
  const studentA = { id: "student-a", email: "a@example.com" };
  const studentB = { id: "student-b", email: "b@example.com" };

  test("phone 매치가 있으면 그것으로 확정하고 guardian_phone은 보지 않는다", () => {
    const target = resolveResetTarget(studentA, [studentB]);
    expect(target).toEqual({ kind: "single", account: studentA, via: "phone" });
  });

  test("phone 매치가 없고 guardian_phone 매치가 1건이면 그 계정으로 확정한다", () => {
    const target = resolveResetTarget(null, [studentA]);
    expect(target).toEqual({
      kind: "single",
      account: studentA,
      via: "guardian_phone",
    });
  });

  test("phone 매치가 없고 guardian_phone 매치가 2건 이상이면 multiple을 반환한다(임의 선택 금지)", () => {
    const target = resolveResetTarget(null, [studentA, studentB]);
    expect(target).toEqual({
      kind: "multiple",
      accounts: [studentA, studentB],
    });
  });

  test("phone·guardian_phone 매치가 모두 없으면 none을 반환한다", () => {
    const target = resolveResetTarget(null, []);
    expect(target).toEqual({ kind: "none" });
  });
});
