import { describe, expect, test } from "vitest";
import mypageRoutes from "./mypageRoutes";

const byPath = (path: string) => mypageRoutes.find((r) => r.path === path);

describe("mypageRoutes 성장설계 뷰어", () => {
  test.each([
    "/mypage/children/:childId/growth",
    "/mypage/children/:childId/growth/:reportId",
  ])("%s 는 lazy 로 로드하고 인증 가드와 폴백을 유지한다", (path) => {
    const route = byPath(path);
    expect(route?.lazy).toBeTypeOf("function");
    expect(route?.Component).toBeUndefined();
    expect(route?.middleware).toHaveLength(1);
    expect(route?.HydrateFallback).toBeDefined();
  });
});
