import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-await-in-parallel.mjs",
);

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "await-parallel-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// 픽스처 파일을 쓰고 git에 올린다(스크립트는 git ls-files 로 대상을 고른다).
function put(path, content) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  execFileSync("git", ["add", path], { cwd: root });
}

function run(...args) {
  const r = spawnSync("node", [script, "--root", root, ...args], {
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("check-await-in-parallel", () => {
  test("Promise.all 배열 안의 직접 await 는 실패한다", () => {
    put("api/a.ts", "const [x] = await Promise.all([await read(), read()]);\n");
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("api/a.ts:1");
  });

  test.each(["allSettled", "race", "any"])("Promise.%s 도 잡는다", (m) => {
    put("src/a.ts", `await Promise.${m}([await read()]);\n`);
    expect(run().code).toBe(1);
  });

  test("삼항, 괄호, 스프레드 안의 await 도 잡는다", () => {
    put("shared/a.ts", "await Promise.all([ok ? (await read()) : null]);\n");
    expect(run().code).toBe(1);
  });

  test("다른 함수 안의 await 는 통과한다", () => {
    put(
      "api/a.ts",
      "await Promise.all([guard(async () => await read()), items.map(async (i) => await read(i))]);\n",
    );
    expect(run().code).toBe(0);
  });

  test("Promise.all 밖의 await 와 await Promise.all 은 통과한다", () => {
    put(
      "api/a.ts",
      "const a = [await read()];\nawait Promise.all([read(), read()]);\n",
    );
    expect(run().code).toBe(0);
  });

  test("테스트 파일은 건너뛴다", () => {
    put("api/a.test.ts", "await Promise.all([await read()]);\n");
    expect(run().code).toBe(0);
  });

  test("적중 위치를 파일과 줄로 알려 준다", () => {
    put(
      "api/a.ts",
      "const x = 1;\nawait Promise.all([\n  await read(),\n]);\n",
    );
    const r = run();
    expect(r.out).toContain("api/a.ts:3");
  });
});
