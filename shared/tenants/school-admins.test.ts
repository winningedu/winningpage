import { describe, expect, test } from "vitest";
import { issuedSchoolAdminSchema } from "./school-admins.js";

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
