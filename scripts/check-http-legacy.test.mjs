import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-http-legacy.mjs",
);

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "http-legacy-"));
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
    join(root, "scripts/http-legacy.baseline.json"),
    `${JSON.stringify(obj, null, 2)}\n`,
  );
}

describe("check-http-legacy browserDb", () => {
  test("baseline에 없는 파일의 supabase.from(...).select()는 실패한다", () => {
    put("src/a.ts", 'supabase.from("x").select();\n');
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("src/a.ts");
    expect(r.out).toContain("browserDb");
  });

  test.each([
    ['supabase.from("x").insert({ a: 1 });'],
    ['supabase.from("x").upsert({ a: 1 });'],
    ['supabase.from("x").delete().eq("a", 1);'],
    ['supabase.from("x");'],
    ["client.from(table).select();"],
    ['supabase.rpc("fn", { a: 1 });'],
    ['supabase.storage.from("bucket").upload("a", b);'],
  ])("Supabase 테이블, rpc, storage 호출을 잡는다: %s", (line) => {
    put("src/a.ts", `${line}\n`);
    expect(run().code).toBe(1);
  });

  test.each([
    ["const a = Array.from(x);"],
    ["const a = Buffer.from(x);"],
    ["const a = Object.from(x);"],
    ["const a = Uint8Array.from(x);"],
    ["const a = Array.from(x).map(y);"],
    ["const a = builder.from(table);"],
    ["await supabase.auth.getSession();"],
    ["supabase.auth.onAuthStateChange(cb);"],
  ])("DB 호출이 아니면 통과한다: %s", (line) => {
    put("src/a.ts", `${line}\n`);
    expect(run().code).toBe(0);
  });

  test("api/ 파일의 supabase 호출은 세지 않는다(browserDb는 src만)", () => {
    put("api/a.ts", 'supabase.from("x").select();\n');
    expect(run().code).toBe(0);
  });

  test("테스트, 선언, e2e, fixtures 파일과 src 밖 파일은 건너뛴다", () => {
    const line = 'supabase.from("x").select();\n';
    put("src/a.test.ts", line);
    put("src/a.spec.tsx", line);
    put("src/a.testkit.ts", line);
    put("src/__tests__/a.ts", line);
    put("src/lib/fixtures/a.ts", line);
    put("src/a.d.ts", line);
    put("e2e/a.ts", line);
    put("scripts/a.mjs", line);
    put("src/a.json", line);
    expect(run().code).toBe(0);
  });
});

describe("check-http-legacy baseline", () => {
  test("baseline 이하면 통과하고 초과하면 실패하며, 줄어들면 갱신 힌트를 낸다", () => {
    put("src/a.ts", 'supabase.from("x").select();\nsupabase.rpc("f");\n');
    setBaseline({ "src/a.ts": { browserDb: 2 } });
    const equal = run();
    expect(equal.code).toBe(0);
    expect(equal.out).not.toContain("--update");

    setBaseline({ "src/a.ts": { browserDb: 1 } });
    const over = run();
    expect(over.code).toBe(1);
    expect(over.out).toContain("src/a.ts: browserDb 2 (baseline 1)");

    setBaseline({ "src/a.ts": { browserDb: 3 } });
    const under = run();
    expect(under.code).toBe(0);
    expect(under.out).toContain("--update");
  });

  test("파일이 사라지거나 분류가 0이 된 baseline 항목도 줄어든 것으로 본다", () => {
    setBaseline({ "src/gone.ts": { browserDb: 1 } });
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toContain("--update");
  });

  test("baseline에 없는 분류는 0에서 시작하므로 늘면 실패한다", () => {
    put("src/a.ts", 'supabase.from("x").select();\n');
    setBaseline({ "src/a.ts": { browserDb: 1 } });
    expect(run().code).toBe(0);
    put(
      "src/a.ts",
      'supabase.from("x").select();\nsupabase.from("y").select();\n',
    );
    expect(run().code).toBe(1);
  });
});
