import { describe, expect, test } from "vitest";
import { routeForStep, SELFEVAL_PATHS } from "./selfevalPaths";

describe("SELFEVAL_PATHS", () => {
  test("세션 경로는 /app/selfeval/s/:id/화면 형식이다", () => {
    expect(SELFEVAL_PATHS.home).toBe("/app/selfeval");
    expect(SELFEVAL_PATHS.new).toBe("/app/selfeval/new");
    expect(SELFEVAL_PATHS.archive).toBe("/app/selfeval/archive");
    expect(SELFEVAL_PATHS.activities("abc")).toBe(
      "/app/selfeval/s/abc/activities",
    );
    expect(SELFEVAL_PATHS.analysis("abc")).toBe("/app/selfeval/s/abc/analysis");
    expect(SELFEVAL_PATHS.result("abc")).toBe("/app/selfeval/s/abc/result");
    expect(SELFEVAL_PATHS.verify("abc")).toBe("/app/selfeval/s/abc/verify");
    expect(SELFEVAL_PATHS.done("abc")).toBe("/app/selfeval/s/abc/done");
  });
});

describe("routeForStep", () => {
  test("서버 routeForStep 과 같은 규칙으로 단계에서 화면을 고른다", () => {
    // 0 은 기본 입력 전이라 서버가 new 로 돌려보낸다(api/_lib/selfeval/session.ts).
    expect(routeForStep(0, "s1")).toBe("/app/selfeval/new?sessionId=s1");
    expect(routeForStep(1, "s1")).toBe(SELFEVAL_PATHS.activities("s1"));
    expect(routeForStep(2, "s1")).toBe(SELFEVAL_PATHS.analysis("s1"));
    expect(routeForStep(3, "s1")).toBe(SELFEVAL_PATHS.analysis("s1"));
    expect(routeForStep(4, "s1")).toBe(SELFEVAL_PATHS.result("s1"));
    expect(routeForStep(5, "s1")).toBe(SELFEVAL_PATHS.verify("s1"));
    expect(routeForStep(6, "s1")).toBe(SELFEVAL_PATHS.done("s1"));
  });

  test("세션 id 는 경로에 안전하게 인코딩한다", () => {
    expect(SELFEVAL_PATHS.activities("a/b")).toBe(
      "/app/selfeval/s/a%2Fb/activities",
    );
  });
});
