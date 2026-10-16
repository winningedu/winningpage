import { describe, expect, test } from "vitest";
import serviceLandingRoutes from "./serviceLandingRoutes";

const byPath = (path: string) =>
  serviceLandingRoutes.find((r) => r.path === path);

describe("serviceLandingRoutes", () => {
  test("성장설계 랜딩 경로가 코드 소유 컴포넌트로 배선된다", () => {
    const route = byPath("/services/growth");
    expect(route?.Component).toBeDefined();
    expect(route?.lazy).toBeUndefined();
  });

  test.each([
    "/services/callmentor",
    "/services/goal",
    "/services/performance",
    "/services/self-assessment",
    "/services/research",
    "/services/growth",
  ])("서비스 랜딩 %s 경로가 있다", (path) => {
    expect(byPath(path)?.Component).toBeDefined();
  });

  test.each([
    "/page/services-content",
    "/page/services-goal",
    "/page/services-ai-performance",
    "/page/services-self-assessment",
    "/page/services-in-depth-research",
    "/page/admission-special-highschool-results",
  ])("구 경로 %s 는 리다이렉트 컴포넌트를 가진다", (path) => {
    expect(byPath(path)?.Component).toBeDefined();
  });
});
