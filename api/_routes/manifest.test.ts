// 엔드포인트 등록이 어긋나 URL 이 404 가 되거나, maxDuration 이 다른 진입 함수로
// 가는 사고를 막는 구조 가드. 새 핸들러는 파일만 추가하면 이 테스트가 빠진 등록을 알려준다.
import fs from "node:fs";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, test } from "vitest";
import { config as config10 } from "../router.js";
import { config as config30 } from "../router-30.js";
import { config as config60 } from "../router-60.js";
import { dispatch } from "./dispatch.js";
import { routes as defaultRoutes } from "./manifest.js";
import { routes as routes30 } from "./manifest-30.js";
import { routes as routes60 } from "./manifest-60.js";

const ROUTES_DIR = import.meta.dirname;

const manifests = {
  "manifest.ts": defaultRoutes,
  "manifest-30.ts": routes30,
  "manifest-60.ts": routes60,
};

// Vercel 이 함수로 빌드하는 확장자
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const listFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? listFiles(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );

// Hono 앱 파일(루트 앱 app.ts 와 그 아래 .route() 로 붙는 하위 앱). 매니페스트가 아니라 루트 앱에 붙고 vercel.json 이 /api/app 으로 보낸다.
const isHonoAppFile = (rel: string) =>
  /\.createApp\(\)|create(Admin|Root)App\(\)/.test(
    fs.readFileSync(path.join(ROUTES_DIR, rel), "utf8"),
  );

const routeSourceFiles = listFiles(ROUTES_DIR)
  .map((file) => path.relative(ROUTES_DIR, file).split(path.sep).join("/"))
  .filter(
    (rel) =>
      SOURCE_EXT.test(rel) &&
      !rel.includes(".test.") &&
      rel !== "dispatch.ts" &&
      !/^manifest[^/]*\.ts$/.test(rel),
  );

const honoAppFiles = routeSourceFiles.filter(isHonoAppFile).sort();

// 라우트 키 = api/_routes 기준 상대 경로에서 확장자를 뗀 값
const handlerKeys = routeSourceFiles
  .filter((rel) => !isHonoAppFile(rel))
  .map((rel) => rel.replace(SOURCE_EXT, ""))
  .sort();

// 소스에서 선언된 maxDuration 을 읽는다. 선언이 없으면 undefined
const declaredMaxDuration = (source: string) => {
  const configBlock = source.match(/export const config\s*=\s*\{[^}]*\}/s)?.[0];
  return configBlock?.match(/maxDuration:\s*(\d+)/)?.[1];
};

const manifestsHolding = (key: string) =>
  Object.entries(manifests)
    .filter(([, routes]) => Object.hasOwn(routes, key))
    .map(([name]) => name);

describe("maxDuration 파싱", () => {
  test("여러 줄로 나뉜 config 객체에서도 읽는다", () => {
    const source = [
      "export const config = {",
      '  runtime: "nodejs",',
      "  maxDuration: 60,",
      "};",
    ].join("\n");

    expect(declaredMaxDuration(source)).toBe("60");
  });

  test("config 선언이 없으면 undefined 다", () => {
    expect(declaredMaxDuration("export default () => {};")).toBeUndefined();
  });
});

describe("Hono 앱 파일", () => {
  test("루트 앱 말고는 모두 다른 Hono 앱 파일이 import 해서 .route() 로 붙인다", () => {
    const sources = honoAppFiles.map((rel) =>
      fs.readFileSync(path.join(ROUTES_DIR, rel), "utf8"),
    );
    const orphans = honoAppFiles
      .filter((rel) => rel !== "app.ts")
      .filter(
        (rel) =>
          !honoAppFiles.some((other, index) => {
            if (other === rel) return false;
            const spec = path.posix.relative(
              path.posix.dirname(other),
              rel.replace(/\.ts$/, ".js"),
            );
            const specifier = spec.startsWith(".") ? spec : `./${spec}`;
            return sources[index]?.includes(`"${specifier}"`) ?? false;
          }),
      );
    expect(honoAppFiles).toContain("app.ts");
    expect(orphans).toEqual([]);
  });
});

describe("라우트 매니페스트", () => {
  test("모든 핸들러 파일이 정확히 한 매니페스트에 등록돼 있다", () => {
    const problems = handlerKeys
      .map((key) => ({ key, holders: manifestsHolding(key) }))
      .filter(({ holders }) => holders.length !== 1)
      .map(({ key, holders }) => `${key}: ${holders.length}곳 [${holders}]`);

    expect(problems, "새 엔드포인트는 매니페스트에 한 번만 등록한다").toEqual(
      [],
    );
  });

  test("매니페스트 키가 없는 파일을 가리키지 않는다", () => {
    const known = new Set(handlerKeys);
    const dangling = Object.entries(manifests).flatMap(([name, routes]) =>
      Object.keys(routes)
        .filter((key) => !known.has(key))
        .map((key) => `${name}: ${key}`),
    );

    expect(dangling).toEqual([]);
  });

  test("핸들러가 선언한 maxDuration 과 매니페스트가 일치한다", () => {
    const problems: string[] = [];
    for (const key of handlerKeys) {
      const source = fs.readFileSync(
        path.join(ROUTES_DIR, `${key}.ts`),
        "utf8",
      );
      const declared = declaredMaxDuration(source);
      const expected =
        declared === undefined
          ? "manifest.ts"
          : declared === "30"
            ? "manifest-30.ts"
            : declared === "60"
              ? "manifest-60.ts"
              : undefined;
      if (expected === undefined) {
        problems.push(
          `${key}: maxDuration ${declared} 는 지원하지 않는다. 새 한도는 새 진입 함수가 필요하다`,
        );
      } else if (!manifestsHolding(key).includes(expected)) {
        problems.push(`${key}: ${expected} 에 있어야 한다`);
      }
    }

    expect(problems).toEqual([]);
  });

  test("모든 로더는 키와 같은 이름의 정적 import 를 쓴다", () => {
    // Vercel 파일 추적기는 정적 지정자만 따라간다. 포맷터가 줄을 나눠도 통과하도록 공백을 접는다.
    const staticLoader = /"([^"]+)": \(\) => import\("\.\/([^"]+)\.js"\)/g;
    const bad = Object.entries(manifests).flatMap(([name, routes]) => {
      const source = fs
        .readFileSync(path.join(ROUTES_DIR, name), "utf8")
        .replace(/\s+/g, " ");
      const matched = [...source.matchAll(staticLoader)];
      const dynamicCount = source.split("import(").length - 1;
      const mismatched = matched
        .filter(([, key, target]) => key !== target)
        .map(([, key]) => `${name}: ${key}`);
      const allStatic =
        matched.length === Object.keys(routes).length &&
        dynamicCount === matched.length;
      return allStatic
        ? mismatched
        : [...mismatched, `${name}: 정적 import 가 아닌 로더가 있다`];
    });

    expect(bad).toEqual([]);
  });
});

const API_DIR = path.join(ROUTES_DIR, "..");
const REPO_ROOT = path.join(API_DIR, "..");

const vercelJson = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf8"),
) as {
  rewrites: { source: string; destination: string }[];
  crons: { path: string }[];
};

const alternation = (routes: Record<string, unknown>) =>
  `/api/((?:${Object.keys(routes).sort().join("|")})/?)`;

describe("대괄호 라우트 키", () => {
  // 대괄호가 있으면 구간 전체가 [영문] 이어야 한다(dispatch 의 PARAM_SEGMENT 와 같은 규칙).
  const validSegment = (segment: string) =>
    !/[[\]]/.test(segment) || /^\[[a-zA-Z]+\]$/.test(segment);

  test("매니페스트 키의 대괄호는 구간 전체가 [영문] 이다", () => {
    const bad = Object.values(manifests)
      .flatMap((routes) => Object.keys(routes))
      .filter((key) => !key.split("/").every(validSegment));

    expect(bad).toEqual([]);
  });

  test("규칙이 구간 일부에 섞인 대괄호를 거른다", () => {
    expect(["[key]", "plain", "a-b"].every(validSegment)).toBe(true);
    expect(
      ["a[key]", "[key]x", "[]", "[k1]", "[[key]]"].some(validSegment),
    ).toBe(false);
  });
});

const routerRewrites = vercelJson.rewrites.filter((rewrite) =>
  /^\/api\/router(-\d+)?$/.test(rewrite.destination),
);

describe("vercel.json 라우터 rewrite", () => {
  test("router 로 가는 rewrite 는 30초, 60초, 기본 진입 함수 순서다", () => {
    expect(routerRewrites).toEqual([
      { source: alternation(routes30), destination: "/api/router-30" },
      { source: alternation(routes60), destination: "/api/router-60" },
      // Vercel 은 원본 경로로 source 를 맞춰 보고 함수에는 정규화된 req.url 을 넘긴다.
      // 그래서 /api/goal/../change-phone 이 catch-all 에 걸린 뒤 /api/change-phone 으로 도착한다.
      // catch-all 은 . 과 .. 구간이 있는 경로를 받지 않아야 한다.
      {
        source: "/api/((?!(?:.*/)?\\.\\.?(?:/|$)).*)",
        destination: "/api/router",
      },
    ]);
  });
});

describe("vercel.json rewrite 시뮬레이션", () => {
  const destinationManifests: Record<string, Record<string, unknown>> = {
    "/api/router": defaultRoutes,
    "/api/router-30": routes30,
    "/api/router-60": routes60,
  };
  // Hono 진입 함수(/api/app)로 가는 rewrite 도 함께 둔다. 매니페스트 키가 그쪽에 먼저 걸리면 안 된다.
  const compiled = vercelJson.rewrites
    .filter((rewrite) => rewrite.source.startsWith("/api/"))
    .map((rewrite) => ({
      ...rewrite,
      pattern: new RegExp(`^${rewrite.source}$`),
    }));

  const cases = Object.values(destinationManifests)
    .flatMap((routes) => Object.keys(routes))
    .flatMap((key) => [`/api/${key}`, `/api/${key}/`]);

  test("모든 매니페스트 키가 끝 슬래시 유무와 관계없이 자기 진입 함수에 닿는다", () => {
    const misrouted = cases.filter((url) => {
      const key = url.replace(/^\/api\//, "").replace(/\/$/, "");
      const hit = compiled.find(({ pattern }) => pattern.test(url));
      const target = hit && destinationManifests[hit.destination];
      return !target || !Object.hasOwn(target, key);
    });

    expect(misrouted).toEqual([]);
  });

  test("점 구간이 있는 경로는 어떤 rewrite 에도 걸리지 않는다", () => {
    const dotSegmentPaths = [
      "/api/goal/../change-phone",
      "/api/./change-phone",
      "/api/..",
      "/api/a/..",
      "/api/a/../",
      "/api/../x",
      "/api/growth/report/../../change-phone",
      "/api/selfeval/./session",
    ];

    const matched = dotSegmentPaths.filter((url) =>
      compiled.some(({ pattern }) => pattern.test(url)),
    );

    expect(matched).toEqual([]);
  });

  test("점이 들어 있어도 구간 전체가 점이 아니면 catch-all 에 걸린다", () => {
    const catchAll = new RegExp(`^${routerRewrites[2]?.source}$`);
    const missed = [
      "/api/change-phone",
      "/api/change-phone/",
      "/api/goal/advice",
      "/api/.well-known/x",
      "/api/foo..bar",
      "/api/nonexistent",
    ].filter((url) => !catchAll.test(url));

    expect(missed).toEqual([]);
  });
});

describe("진입 함수 config", () => {
  test("router-30 은 30초, router-60 은 60초, router 는 한도를 두지 않는다", () => {
    expect(config30).toEqual({
      runtime: "nodejs",
      maxDuration: 30,
    });
    expect(config60).toEqual({
      runtime: "nodejs",
      maxDuration: 60,
    });
    expect(config10).toEqual({ runtime: "nodejs" });
  });
});

describe("api/ 직속 독립 함수", () => {
  test("라우터, 크론 대상, 예외 두 개 외에는 두지 않는다", () => {
    const allowed = new Set([
      "router.ts",
      "router-30.ts",
      "router-60.ts",
      // Hono 루트 앱의 진입 함수(Web 표준 fetch, maxDuration 은 router 와 같다)
      "app.ts",
      "app-30.ts",
      "app-60.ts",
      // body parser 를 꺼야 해서 라우터에 못 넣는다
      "zoom-webhook.ts",
      // Chromium 메모리를 AI 핸들러와 한 인스턴스에서 나눠 쓰지 않는다
      "report-pdf.ts",
      ...vercelJson.crons.map(
        ({ path: cronPath }) => `${cronPath.replace(/^\/api\//, "")}.ts`,
      ),
    ]);
    const standalone = listFiles(API_DIR)
      .map((file) => path.relative(API_DIR, file).split(path.sep).join("/"))
      .filter(
        (rel) =>
          SOURCE_EXT.test(rel) &&
          !rel.includes(".test.") &&
          !rel.startsWith("_lib/") &&
          !rel.startsWith("_routes/"),
      );

    const unexpected = standalone.filter((rel) => !allowed.has(rel));

    expect(
      unexpected,
      "새 엔드포인트는 api/_routes/ 에 두고 매니페스트에 등록한다",
    ).toEqual([]);
    expect(standalone.sort()).toEqual([...allowed].sort());
  });
});

// 실제 매니페스트 키로 요청이 어느 라우트에 닿고 경로 값이 어떻게 담기는지 본다.
describe("경로 파라미터", () => {
  const resolve = async (url: string) => {
    const hit: { key?: string; query?: unknown } = {};
    const stubs = Object.fromEntries(
      Object.keys(defaultRoutes).map((key) => [
        key,
        async () => ({
          default: (req: VercelRequest) => {
            hit.key = key;
            hit.query = req.query;
          },
        }),
      ]),
    );
    const res = { status: () => res, json: () => res };
    await dispatch(
      stubs,
      { url, query: {} } as unknown as VercelRequest,
      res as unknown as VercelResponse,
    );
    return hit;
  };

  test.each([
    [
      "/api/admin/premium-book/pages/7",
      "admin/premium-book/pages/[id]",
      { id: "7" },
    ],
  ])("%s 는 %s 로 가고 id 가 담긴다", async (url, key, query) => {
    expect(await resolve(url)).toEqual({ key, query });
  });
});

describe("학습진단, 멘토 신청 경로", () => {
  const ID = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
  const resolve = async (url: string) => {
    const hit: { key?: string; query?: unknown } = {};
    const stubs = Object.fromEntries(
      Object.keys(defaultRoutes).map((key) => [
        key,
        async () => ({
          default: (req: VercelRequest) => {
            hit.key = key;
            hit.query = req.query;
          },
        }),
      ]),
    );
    const res = { status: () => res, json: () => res };
    await dispatch(
      stubs,
      { url, query: {} } as unknown as VercelRequest,
      res as unknown as VercelResponse,
    );
    return hit;
  };

  test.each([
    ["/api/admin/mentor-applications", "admin/mentor-applications", {}],
    [
      `/api/admin/mentor-applications/${ID}`,
      "admin/mentor-applications/[id]",
      { id: ID },
    ],
    [
      `/api/admin/mentor-applications/${ID}/proof-url`,
      "admin/mentor-applications/[id]/proof-url",
      { id: ID },
    ],
  ])("%s 는 %s 로 간다", async (url, key, query) => {
    expect(await resolve(url)).toEqual({ key, query });
  });
});
