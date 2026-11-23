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

  test("tz-literal-ok 표식과 사유가 있으면 통과하고, 사유가 없으면 실패한다", () => {
    put(
      "api/a.ts",
      'const tz = "Asia/Seoul"; // tz-literal-ok: 기존 행 기본 시간대 (D1)\n',
    );
    expect(run().code).toBe(0);
    put("api/b.ts", 'const tz = "Asia/Seoul"; // tz-literal-ok:\n');
    put("api/c.ts", 'const tz = "Asia/Seoul"; // tz-literal-ok\n');
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("api/b.ts");
    expect(r.out).toContain("api/c.ts");
    expect(r.out).not.toContain("api/a.ts");
  });

  test("baseline 이하면 통과하고 초과하면 실패하며, 줄어들면 갱신 힌트를 낸다", () => {
    put("api/a.ts", 'a("Asia/Seoul");\nb("Asia/Seoul");\n');
    setBaseline({ "api/a.ts": 2 });
    expect(run().code).toBe(0);

    setBaseline({ "api/a.ts": 1 });
    const over = run();
    expect(over.code).toBe(1);
    expect(over.out).toContain("api/a.ts: 2 (baseline 1)");

    setBaseline({ "api/a.ts": 3 });
    const under = run();
    expect(under.code).toBe(0);
    expect(under.out).toContain("--update");
  });

  test.each([
    ['const o = "+09:00";'],
    ['const o = "+0900";'],
    ["const ms = 9 * 60 * 60 * 1000;"],
    ["const ms = 9*60*60;"],
    ["const s = 9 * 3600;"],
    ["const o = KST_OFFSET;"],
    ["const d = new Date().toISOString().slice(0, 10);"],
    ['const d = new Date().toISOString().split("T")[0];'],
    ["select now() at time zone 'Asia/Seoul';"],
  ])("고정 시간대 패턴을 잡는다: %s", (line) => {
    put("src/pages/a.ts", `${line}\n`);
    expect(run().code).toBe(1);
  });

  test("로컬 Date getter는 api/와 src/lib/에서만 실패하고 UTC getter는 어디서나 통과한다", () => {
    put("src/pages/a.ts", "const h = d.getHours();\n");
    put("src/components/a.tsx", "d.setDate(1);\n");
    put("api/utc.ts", "const h = d.getUTCHours();\n");
    put("src/lib/utc.ts", "const h = d.getUTCDay();\n");
    expect(run().code).toBe(0);

    put("src/lib/a.ts", "const h = d.getHours();\n");
    put("api/b.ts", "d.setMonth(2);\n");
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("src/lib/a.ts");
    expect(r.out).toContain("api/b.ts");
    expect(r.out).not.toContain("src/pages/a.ts");
  });

  test("시간 모듈, 테스트 파일, 검사 스크립트 자신은 건너뛴다", () => {
    const line = 'const tz = "Asia/Seoul";\n';
    put("src/lib/time/zone.ts", line);
    put("src/lib/a.test.ts", line);
    put("src/a.test.tsx", line);
    put("api/a.spec.ts", line);
    put("supabase/migrations/a.spec.sql", line);
    put("e2e/a.ts", line);
    put("scripts/check-time-zone-literals.mjs", line);
    put("scripts/check-time-zone-literals.test.mjs", line);
    put("docs/a.ts", line);
    put("api/a.json", line);
    expect(run().code).toBe(0);
  });

  test("--update 출력은 정렬되어 결정적이다", () => {
    put("src/b.ts", 'x("Asia/Seoul");\n');
    put("api/a.ts", 'x("Asia/Seoul");\ny("+09:00");\n');
    expect(run("--update").code).toBe(0);
    const first = readFileSync(
      join(root, "scripts/time-zone-literals.baseline.json"),
      "utf8",
    );
    expect(first).toBe(
      `${JSON.stringify({ "api/a.ts": 2, "src/b.ts": 1 }, null, 2)}\n`,
    );
    expect(run("--update").code).toBe(0);
    expect(
      readFileSync(
        join(root, "scripts/time-zone-literals.baseline.json"),
        "utf8",
      ),
    ).toBe(first);
    expect(run().code).toBe(0);
  });
});
