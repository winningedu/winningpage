// Hono 루트 앱의 라우트 표 가드. 메서드 라우트의 첫 미들웨어가 인증인지, 경로마다 405 와 맞는 Allow 가 있는지,
// vercel.json 이 옮긴 경로만 새 진입 함수로 보내는지 본다.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { isAuthMiddleware } from "../_lib/hono/admin.js";
import entry, { config as entryConfig } from "../app.js";
import { config as entryConfig30 } from "../app-30.js";
import { config as entryConfig60 } from "../app-60.js";
import { app } from "./app.js";
import { routes as defaultRoutes } from "./manifest.js";
import { routes as routes30 } from "./manifest-30.js";
import { routes as routes60 } from "./manifest-60.js";

const methodRoutes = app.routes.filter((route) => route.method !== "ALL");
const routePaths = [...new Set(methodRoutes.map((route) => route.path))];

// 경로 패턴을 실제 주소로. 값은 검증 전에 끝나는 검사(405, rewrite)에만 쓰므로 아무 글자나 된다.
const samplePath = (pattern: string) => pattern.replace(/:[A-Za-z]+/g, "1");

describe("라우트 표", () => {
  test("옮긴 관리자 라우트가 있다", () => {
    expect(routePaths.length).toBeGreaterThan(0);
  });

  test("메서드 라우트마다 첫 미들웨어가 인증(admin 또는 user)이다", () => {
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const route of methodRoutes) {
      const key = `${route.method} ${route.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!isAuthMiddleware(route.handler)) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  test.each(routePaths)(
    "%s 는 405 와 등록한 메서드의 Allow 를 준다",
    async (pattern) => {
      const methods = [
        ...new Set(
          methodRoutes
            .filter((route) => route.path === pattern)
            .map((route) => route.method),
        ),
      ];
      const expected = [
        ...methods,
        ...(methods.includes("GET") ? ["HEAD"] : []),
      ].sort();
      const response = await app.request(samplePath(pattern), {
        method: "OPTIONS",
      });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe(expected.join(", "));
    },
  );
});

const REPO_ROOT = path.join(import.meta.dirname, "..", "..");
const vercelJson = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf8"),
) as { rewrites: { source: string; destination: string }[] };
const apiRewrites = vercelJson.rewrites
  .filter((rewrite) => rewrite.source.startsWith("/api/"))
  .map((rewrite) => ({
    ...rewrite,
    pattern: new RegExp(`^${rewrite.source}$`),
  }));
const destinationOf = (url: string) =>
  apiRewrites.find(({ pattern }) => pattern.test(url))?.destination;

// maxDuration 이 있는 옮긴 경로. 없으면 /api/app 으로 간다(api/router-30, -60 과 같은 한도).
const MIGRATED_30: string[] = ["/api/admin/knowledge-search"];
const MIGRATED_60: string[] = [
  "/api/admin/knowledge-dedupe",
  "/api/admin/knowledge-eval",
];
const entryFor = (pattern: string) =>
  MIGRATED_30.includes(pattern)
    ? "/api/app-30"
    : MIGRATED_60.includes(pattern)
      ? "/api/app-60"
      : "/api/app";

describe("vercel.json rewrite", () => {
  test("옮긴 경로는 끝 슬래시와 관계없이 자기 진입 함수로 간다", () => {
    const misrouted = routePaths.flatMap((pattern) =>
      [samplePath(pattern), `${samplePath(pattern)}/`]
        .filter((url) => destinationOf(url) !== entryFor(pattern))
        .map((url) => `${url} -> ${destinationOf(url)}`),
    );
    expect(misrouted).toEqual([]);
  });

  test("안 옮긴 관리자 경로는 새 진입 함수로 가지 않는다", () => {
    const keys = [defaultRoutes, routes30, routes60]
      .flatMap((routes) => Object.keys(routes))
      .filter((key) => key.startsWith("admin/"));
    const hijacked = keys
      .map((key) => `/api/${key.replace(/\[[A-Za-z]+\]/g, "1")}`)
      .filter((url) => destinationOf(url)?.startsWith("/api/app"));
    expect(hijacked).toEqual([]);
  });

  test("점 구간이 있는 경로는 새 진입 함수 rewrite 에 걸리지 않는다", () => {
    const dotted = [
      "/api/admin/coupons/../members",
      "/api/admin/coupons/./user-search",
      "/api/admin/coupons/..",
      "/api/admin/./coupons",
    ];
    expect(
      dotted.filter((url) => destinationOf(url)?.startsWith("/api/app")),
    ).toEqual([]);
  });
});

describe("진입 함수", () => {
  test("fetch 를 내보내고 maxDuration 은 router 진입 함수와 같다", () => {
    expect(typeof entry.fetch).toBe("function");
    expect(entryConfig).toEqual({ runtime: "nodejs" });
    expect(entryConfig30).toEqual({ runtime: "nodejs", maxDuration: 30 });
    expect(entryConfig60).toEqual({ runtime: "nodejs", maxDuration: 60 });
  });
});
