// 엔드포인트 등록이 어긋나 URL 이 404 가 되거나, maxDuration 이 다른 진입 함수로
// 가는 사고를 막는 구조 가드. 새 핸들러는 파일만 추가하면 이 테스트가 빠진 등록을 알려준다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { config as config10 } from "../router.js";
import { config as config30 } from "../router-30.js";
import { config as config60 } from "../router-60.js";
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

// 라우트 키 = api/_routes 기준 상대 경로에서 확장자를 뗀 값
const handlerKeys = listFiles(ROUTES_DIR)
  .map((file) => path.relative(ROUTES_DIR, file).split(path.sep).join("/"))
  .filter(
    (rel) =>
      SOURCE_EXT.test(rel) &&
      !rel.includes(".test.") &&
      rel !== "dispatch.ts" &&
      !/^manifest[^/]*\.ts$/.test(rel),
  )
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
  `/api/(${Object.keys(routes).sort().join("|")})/?`;

describe("vercel.json 라우터 rewrite", () => {
  test("앞의 세 개가 30초, 60초, 기본 진입 함수로 보낸다", () => {
    expect(vercelJson.rewrites.slice(0, 3)).toEqual([
      { source: alternation(routes30), destination: "/api/router-30" },
      { source: alternation(routes60), destination: "/api/router-60" },
      { source: "/api/(.*)", destination: "/api/router" },
    ]);
  });
});

describe("vercel.json rewrite 시뮬레이션", () => {
  const destinationManifests: Record<string, Record<string, unknown>> = {
    "/api/router": defaultRoutes,
    "/api/router-30": routes30,
    "/api/router-60": routes60,
  };
  const compiled = vercelJson.rewrites.slice(0, 3).map((rewrite) => ({
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
