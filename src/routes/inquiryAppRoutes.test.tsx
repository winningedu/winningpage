import type { RouteObject } from "react-router";
import { describe, expect, test } from "vitest";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import inquiryAppRoutes from "./inquiryAppRoutes";

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

describe("inquiryAppRoutes", () => {
  test("심화탐구 앱 8개 화면 경로를 정의한다", () => {
    expect(leaves(inquiryAppRoutes).map((l) => l.url)).toEqual([
      INQUIRY_PATHS.home,
      INQUIRY_PATHS.topics,
      INQUIRY_PATHS.design,
      INQUIRY_PATHS.write,
      INQUIRY_PATHS.evaluate,
      INQUIRY_PATHS.finalize,
      INQUIRY_PATHS.reports,
      `${INQUIRY_PATHS.reports}/:sessionId`,
    ]);
  });

  test("정보 입력만 index 라우트고 루트(/)에 걸리지 않는다", () => {
    const all = leaves(inquiryAppRoutes);
    expect(all.filter((l) => l.index).map((l) => l.url)).toEqual([
      INQUIRY_PATHS.home,
    ]);
    expect(all.some((l) => l.url === "" || l.url === "/")).toBe(false);
  });

  test("모든 화면이 lazy 로 로드된다", () => {
    expect(leaves(inquiryAppRoutes).every((l) => l.lazy)).toBe(true);
  });
});
