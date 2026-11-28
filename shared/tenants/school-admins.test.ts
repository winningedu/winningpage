import { describe, expect, test } from "vitest";
import {
  type IssueSchoolAdminInput,
  issuedSchoolAdminSchema,
  issueSchoolAdminBody,
} from "./school-admins.js";

// 계정을 발급하면 알림톡 결과 sendStatus 가 붙고, 발급하지 않았으면 tempPassword 처럼 필드 자체가 없다(api/_lib/console/teacherAccounts.ts registerResponseBody).
describe("issuedSchoolAdminSchema sendStatus", () => {
  const base = { teacherId: "t1", loginId: "admin01", verdict: "created" };

  test.each(["sent", "failed", "skipped"] as const)(
    "발급 응답의 sendStatus %s 를 그대로 둔다",
    (sendStatus) => {
      const body = { ...base, tempPassword: "pw", sendStatus };

      expect(issuedSchoolAdminSchema.parse(body)).toEqual(body);
    },
  );

  test("발급하지 않은 응답은 sendStatus 가 없어도 된다", () => {
    expect(issuedSchoolAdminSchema.parse(base)).toEqual(base);
  });

  test("목록에 없는 sendStatus 와 null 은 거른다", () => {
    expect(
      issuedSchoolAdminSchema.safeParse({ ...base, sendStatus: "queued" })
        .success,
    ).toBe(false);
    expect(
      issuedSchoolAdminSchema.safeParse({ ...base, sendStatus: null }).success,
    ).toBe(false);
  });
});

describe("issueSchoolAdminBody", () => {
  const valid = {
    tenantId: "t1",
    name: "김하늘",
    phone: "01012345678",
  } satisfies IssueSchoolAdminInput;

  test("필수 칸만 있어도 통과한다", () => {
    expect(issueSchoolAdminBody.safeParse(valid).success).toBe(true);
  });

  test("선택 칸은 문자열, null, 생략을 받는다", () => {
    const body = {
      ...valid,
      position: "교장",
      email: null,
      landline: "0212345678",
    };
    expect(issueSchoolAdminBody.safeParse(body).success).toBe(true);
  });

  test.each([
    ["이름 없음", { tenantId: "t1", phone: "01012345678" }],
    ["이름이 문자열이 아님", { ...valid, name: 3 }],
    ["전화번호가 문자열이 아님", { ...valid, phone: 1012345678 }],
    ["직책이 문자열이 아님", { ...valid, position: 3 }],
    ["이메일이 문자열이 아님", { ...valid, email: true }],
    ["일반전화가 문자열이 아님", { ...valid, landline: 212345678 }],
  ])("%s 이면 거른다", (_label, body) => {
    expect(issueSchoolAdminBody.safeParse(body).success).toBe(false);
  });
});
