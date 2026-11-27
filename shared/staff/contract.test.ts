// 관리자 목록 행 계약. status 는 admin_members.status 의 CHECK(invited, active, suspended)와 같은 세 값만 받는다.

import { describe, expect, test } from "vitest";
import { directoryRowSchema } from "./contract.js";

const row = { profile_id: "p-1", status: "active" };

describe("directoryRowSchema status", () => {
  test.each(["invited", "active", "suspended"])("%s 를 받는다", (status) => {
    expect(directoryRowSchema.parse({ ...row, status }).status).toBe(status);
  });

  test.each(["deleted", "", null])("%s 는 거른다", (status) => {
    expect(directoryRowSchema.safeParse({ ...row, status }).success).toBe(
      false,
    );
  });
});
