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

const ISSUE_MESSAGE =
  "기관, 이름, 전화번호, 직책, 이메일, 일반전화를 확인해 주세요.";

// 값 규칙(이름 공백, 전화번호 자릿수, 이메일 형식, 길이)은 이 스키마가 보고, 틀리면 화면에 보이던 같은 문구를 errors[0].message 로 낸다.
describe("issueSchoolAdminBody 값 규칙", () => {
  const valid = { tenantId: "t1", name: "김하늘", phone: "01012345678" };

  test("이름 공백을 자르고 전화번호는 숫자만으로 정규화한다", () => {
    const parsed = issueSchoolAdminBody.parse({
      ...valid,
      name: " 박관리 ",
      phone: "010-9999-8888",
    });

    expect(parsed).toMatchObject({ name: "박관리", phone: "01099998888" });
  });

  test("직책은 자르고, 이메일은 자르고 소문자로, 일반전화는 숫자만으로 정규화한다", () => {
    const parsed = issueSchoolAdminBody.parse({
      ...valid,
      position: " 교감 ",
      email: " Admin@School.kr ",
      landline: "02-123-4567",
    });

    expect(parsed).toMatchObject({
      position: "교감",
      email: "admin@school.kr",
      landline: "021234567",
    });
  });

  test.each([
    ["직책 null", { position: null }],
    ["직책 공백", { position: "   " }],
    ["이메일 공백", { email: "  " }],
    ["일반전화 숫자 없음", { landline: "-" }],
    ["일반전화 null", { landline: null }],
  ])("%s 는 값 없음으로 읽는다", (_label, extra) => {
    const parsed = issueSchoolAdminBody.parse({ ...valid, ...extra });

    expect(parsed.position ?? undefined).toBeUndefined();
    expect(parsed.email ?? undefined).toBeUndefined();
    expect(parsed.landline ?? undefined).toBeUndefined();
  });

  test.each([
    ["이름이 공백뿐", { name: "   " }],
    ["전화번호 자릿수 부족", { phone: "12" }],
    ["전화번호가 01 로 시작하지 않음", { phone: "0212345678" }],
    ["이메일 형식 오류", { email: "not-an-email" }],
    ["이메일이 254자 초과", { email: `${"a".repeat(250)}@b.kr` }],
    ["일반전화 자릿수 오류", { landline: "123" }],
    ["직책이 50자 초과", { position: "가".repeat(51) }],
  ])("%s 이면 화면 문구로 거른다", (_label, extra) => {
    const result = issueSchoolAdminBody.safeParse({ ...valid, ...extra });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(ISSUE_MESSAGE);
  });

  test("직책 50자, 이메일 254자는 통과한다", () => {
    const email = `${"a".repeat(249)}@b.kr`;

    expect(email).toHaveLength(254);
    expect(
      issueSchoolAdminBody.safeParse({
        ...valid,
        position: "가".repeat(50),
        email,
      }).success,
    ).toBe(true);
  });
});
