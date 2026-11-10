import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 사이트 분리는 배포별 env만으로 이뤄진다. 소스에 프로젝트 ref나 *.supabase.co 주소가
// 박혀 있으면 다른 사이트 배포에서도 그 프로젝트로 붙을 수 있어서 막는다.
const ROOT = join(import.meta.dirname, "..", "..");
const FORBIDDEN = [
  "ykrpjcsubmbenfcnwlzd", // Winning prod
  "aalujumpwlnwlemnqrus", // Schoolmentor prod
  "gjowqdiopinhixfivnkx", // dev
];
const SUPABASE_HOST = /[a-z0-9-]+\.supabase\.(co|in)\b/i;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_FILE = /\.(test|spec)\.[jt]sx?$/;
const GENERATED = new Set([join("src", "types", "database.types.ts")]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return SOURCE_EXT.test(e.name) ? [p] : [];
  });
}

// 주석은 동작하지 않는 설명이므로 제외한다(URL의 "://"는 건드리지 않는다).
function stripComments(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

const files = ["src", "api"]
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => !TEST_FILE.test(f) && !GENERATED.has(relative(ROOT, f)));

describe("no hard-coded Supabase project in runtime source", () => {
  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no project ref or *.supabase.co URL in code under src/ and api/", () => {
    const hits: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, "utf8"));
      for (const ref of FORBIDDEN) {
        if (code.includes(ref)) hits.push(`${relative(ROOT, f)}: ${ref}`);
      }
      if (SUPABASE_HOST.test(code)) {
        hits.push(`${relative(ROOT, f)}: *.supabase.co`);
      }
    }
    expect(hits).toEqual([]);
  });
});
