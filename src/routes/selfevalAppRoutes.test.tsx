import type { RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { SELFEVAL_PATHS } from "@/components/selfeval/selfevalPaths";
import selfevalAppRoutes from "./selfevalAppRoutes";

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

describe("selfevalAppRoutes", () => {
  test("자기평가서 앱 8개 화면 경로를 정의한다", () => {
    expect(leaves(selfevalAppRoutes).map((l) => l.url)).toEqual([
      SELFEVAL_PATHS.home,
      SELFEVAL_PATHS.new,
      SELFEVAL_PATHS.archive,
      `${SELFEVAL_PATHS.home}/s/:sessionId/activities`,
      `${SELFEVAL_PATHS.home}/s/:sessionId/analysis`,
      `${SELFEVAL_PATHS.home}/s/:sessionId/result`,
      `${SELFEVAL_PATHS.home}/s/:sessionId/verify`,
      `${SELFEVAL_PATHS.home}/s/:sessionId/done`,
    ]);
  });

  test("시작 화면만 index 라우트고 루트(/)에 걸리지 않는다", () => {
    const all = leaves(selfevalAppRoutes);
    expect(all.filter((l) => l.index).map((l) => l.url)).toEqual([
      SELFEVAL_PATHS.home,
    ]);
    expect(all.some((l) => l.url === "" || l.url === "/")).toBe(false);
  });

  test("모든 화면이 lazy 로 로드된다", () => {
    expect(leaves(selfevalAppRoutes).every((l) => l.lazy)).toBe(true);
  });
});
