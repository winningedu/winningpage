// api/reset-password-by-phone.ts의 generateTempPassword(임시비밀번호 생성기)
// 규격 검증. 라우트 핸들러 전체(supabase 조회·auth admin 호출)는 외부 I/O에
// 묶여 있어 여기서 돌리기 어렵다 — delete-account.test.ts와 같은 방침으로,
// 분리 가능한 순수 함수만 로컬에서 검증한다. 분기 실동작(phone_not_verified·
// not_found·success)은 로컬 스택 QA로 확인한다.
//
// 규격(reset-password-by-phone.ts 상단 주석 참고): 길이 8, 영문 대/소문자·
// 숫자·특수문자(!@#$%^&*) 각 1자 이상, 혼동 문자(0/O, 1/l/I) 제외. 이 규격은
// ResetPassword.tsx의 PASSWORD_REGEX(영문+숫자+특수, 6자 이상)를 항상 만족해야
// 한다 — 그래야 임시비밀번호로 로그인한 뒤 같은 화면에서 재설정할 때도 막히지
// 않는다.

import { describe, expect, test } from "vitest";
import {
  generateTempPassword,
  resolveResetTarget,
} from "./reset-password-by-phone.js";

// ResetPassword.tsx의 PASSWORD_REGEX와 동일 — 임시비밀번호가 자체 재설정
// 화면의 검증도 그대로 통과해야 하므로 같은 정규식으로 대조한다.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

const CONFUSING_CHARS = ["0", "O", "1", "l", "I"];

describe("generateTempPassword", () => {
  test("길이가 8이다", () => {
    expect(generateTempPassword()).toHaveLength(8);
  });

  test("영문/숫자/특수문자를 모두 포함해 ResetPassword.tsx의 PASSWORD_REGEX를 통과한다", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).toMatch(PASSWORD_REGEX);
    }
  });

  test("영문 대문자·소문자·숫자·특수문자를 각 1자 이상 포함한다", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTempPassword();
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*]/);
    }
  });

  test("혼동 문자(0/O, 1/l/I)를 포함하지 않는다", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTempPassword();
      for (const confusing of CONFUSING_CHARS) {
        expect(password).not.toContain(confusing);
      }
    }
  });

  test("호출마다 다른 값을 낸다(고정 시드·상수 출력이 아니다)", () => {
    const passwords = new Set(
      Array.from({ length: 50 }, () => generateTempPassword()),
    );
    expect(passwords.size).toBeGreaterThan(45);
  });
});

// resolveResetTarget — guardian_phone 경로(2026-09-03)의 분기 판정. I/O 없는
// 순수 함수라 위 generateTempPassword와 같은 방침으로 로컬에서 검증한다.
// 실제 DB 조회·auth admin 호출까지 포함한 전체 흐름(phone_not_verified·
// not_found·success)은 로컬 스택 QA로 확인한다.
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
