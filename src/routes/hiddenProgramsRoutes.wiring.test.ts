// 신규 서비스 3종의 소개 페이지와 앱 라우트에 숨김 게이트가 걸려 있는지 확인한다.
// 라우트가 추가될 때 게이트가 빠지면 숨긴 환경에서 직접 URL로 열리기 때문이다.
import { describe, expect, it } from "vitest";
import {
  requireGrowthAvailableMiddleware,
  requireInquiryAvailableMiddleware,
  requireSelfevalAvailableMiddleware,
} from "@/lib/routeMiddleware";
import growthAppRoutes from "./growthAppRoutes";
import inquiryAppRoutes from "./inquiryAppRoutes";
import selfevalAppRoutes from "./selfevalAppRoutes";
import serviceLandingRoutes from "./serviceLandingRoutes";

const landing = (path: string) =>
  serviceLandingRoutes.find((r) => r.path === path);

describe("신규 서비스 숨김 게이트 배선", () => {
  it.each([
    ["/services/growth", requireGrowthAvailableMiddleware],
    ["/services/self-assessment", requireSelfevalAvailableMiddleware],
    ["/services/research", requireInquiryAvailableMiddleware],
  ])("소개 페이지 %s 가 게이트를 가진다", (path, gate) => {
    expect(landing(path)?.middleware?.includes(gate), path).toBe(true);
  });

  it.each([
    ["growth", growthAppRoutes, requireGrowthAvailableMiddleware],
    ["selfeval", selfevalAppRoutes, requireSelfevalAvailableMiddleware],
    ["inquiry", inquiryAppRoutes, requireInquiryAvailableMiddleware],
  ])("%s 앱 최상위 라우트가 게이트를 가진다", (_name, routes, gate) => {
    expect(routes).toHaveLength(1);
    expect(routes[0]?.middleware?.includes(gate)).toBe(true);
  });
});
