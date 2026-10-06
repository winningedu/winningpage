import type { RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { GROWTH_PATHS } from "@/components/growth/growthPaths";
import growthAppRoutes from "./growthAppRoutes";

// 셸 라우트(/app/growth)까지 이어 붙인 실제 URL 과 index 여부를 화면 라우트마다 모은다.
type Leaf = { url: string; index: boolean; lazy: boolean };

function leaves(routes: RouteObject[], base = ""): Leaf[] {
  const out: Leaf[] = [];
  for (const route of routes) {
    const url = route.index
      ? base
      : route.path
        ? route.path.startsWith("/")
          ? route.path
          : `${base}/${route.path}`
        : base;
    if (route.children) out.push(...leaves(route.children, url));
    else out.push({ url, index: route.index === true, lazy: !!route.lazy });
  }
  return out;
}

describe("growthAppRoutes", () => {
  test("성장설계 앱 7개 화면 경로를 정의한다", () => {
    expect(leaves(growthAppRoutes).map((l) => l.url)).toEqual([
      GROWTH_PATHS.home,
      GROWTH_PATHS.survey,
      GROWTH_PATHS.collect,
      GROWTH_PATHS.generate,
      GROWTH_PATHS.reports,
      `${GROWTH_PATHS.reports}/:reportId`,
      GROWTH_PATHS.plan,
    ]);
  });

  test("시작 화면만 index 라우트고 루트(/)에 걸리지 않는다", () => {
    const all = leaves(growthAppRoutes);
    expect(all.filter((l) => l.index).map((l) => l.url)).toEqual([
      GROWTH_PATHS.home,
    ]);
    expect(all.some((l) => l.url === "" || l.url === "/")).toBe(false);
  });

  test("모든 화면이 lazy 로 로드된다", () => {
    expect(leaves(growthAppRoutes).every((l) => l.lazy)).toBe(true);
  });
});
