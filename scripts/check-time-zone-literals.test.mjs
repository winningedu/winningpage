import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-time-zone-literals.mjs",
);

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "tz-literals-"));
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

function setBaseline(obj) {
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "scripts/time-zone-literals.baseline.json"),
    `${JSON.stringify(obj, null, 2)}\n`,
  );
}

describe("check-time-zone-literals", () => {
  test("baseline에 없는 파일의 Asia/Seoul은 실패한다", () => {
    put("api/a.ts", 'const tz = "Asia/Seoul";\n');
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("api/a.ts");
    expect(r.out).toContain(":1:");
  });
});
