// 멘토 신청 한 건 계약: 서버가 검증하는 요청 스키마와 브라우저가 검증하는 응답 스키마.

import { describe, expect, test } from "vitest";
import {
  applicationDetailSchema,
  applicationIdParams,
  applicationStatusBody,
  proofUrlSchema,
} from "./detail.js";
import { MENTOR_APPLICATION_STATUS_OPTIONS } from "./status.js";

const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";

describe("요청 스키마", () => {
  test("상태 목록의 값만 받는다", () => {
    for (const { value } of MENTOR_APPLICATION_STATUS_OPTIONS) {
      expect(applicationStatusBody.safeParse({ status: value }).success).toBe(
        true,
      );
    }
    expect(applicationStatusBody.safeParse({ status: "hired" }).success).toBe(
      false,
    );
  });

  test("status 외의 키와 빈 본문은 거부한다", () => {
    expect(
      applicationStatusBody.safeParse({ status: "active", name: "x" }).success,
    ).toBe(false);
    expect(applicationStatusBody.safeParse({}).success).toBe(false);
  });

  test("경로 id 는 uuid 다", () => {
    expect(applicationIdParams.safeParse({ id: ID }).success).toBe(true);
    expect(applicationIdParams.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("응답 스키마", () => {
  test("행은 쓰는 컬럼이 비어 있어도 받고 나머지 컬럼은 통과시킨다", () => {
    expect(
      applicationDetailSchema.parse({ id: ID, status: null, name: "김" }),
    ).toEqual({ id: ID, status: null, name: "김" });
  });

  test("증빙 URL 은 url 문자열이다", () => {
    expect(proofUrlSchema.safeParse({ url: "https://x" }).success).toBe(true);
    expect(proofUrlSchema.safeParse({}).success).toBe(false);
  });
});
