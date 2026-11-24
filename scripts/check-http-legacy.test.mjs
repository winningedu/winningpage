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
    put("api/_lib/a.ts", 'supabase.from("x").select();\n');
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

describe("check-http-legacy --update와 합계", () => {
  test("--update는 0이 아닌 항목만 정렬해서 쓰고 다시 돌려도 같다", () => {
    put("src/b.ts", 'supabase.from("x").select();\n');
    put("src/a.ts", 'supabase.from("x").select();\nsupabase.rpc("f");\n');
    put("src/clean.ts", "export const a = 1;\n");
    expect(run("--update").code).toBe(0);
    const path = join(root, "scripts/http-legacy.baseline.json");
    const first = readFileSync(path, "utf8");
    expect(first).toBe(
      `${JSON.stringify(
        { "src/a.ts": { browserDb: 2 }, "src/b.ts": { browserDb: 1 } },
        null,
        2,
      )}\n`,
    );
    expect(run("--update").code).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(first);
    expect(run().code).toBe(0);
  });

  test("통과해도 분류별 합계를 항상 출력한다", () => {
    put("src/a.ts", 'supabase.from("x").select();\n');
    setBaseline({ "src/a.ts": { browserDb: 1 } });
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/browserDb:\s+1\b/);
    expect(r.out).toMatch(/legacyFetch:\s+0\b/);
    expect(r.out).toMatch(/okSuccess:\s+0\b/);
  });
});

describe("check-http-legacy legacyFetch", () => {
  test.each([
    ['apiFetch("/api/x");'],
    ['await apiFetch("/api/x", { method: "POST" });'],
    ['fetch("/api/x");'],
    ["fetch(`/api/x/${id}`);"],
    ['window.fetch("/api/x");'],
    ['globalThis.fetch("/api/x");'],
    ['const url = "/api/x";\nfetch(url);'],
    ["const url = `${base}/api/x`;\nfetch(url, { method: 'POST' });"],
  ])("레거시 /api 호출을 잡는다: %s", (code) => {
    put("src/a.ts", `${code}\n`);
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("legacyFetch");
  });

  test.each([
    ['fetch("https://example.com/x");'],
    ["fetch(url);"],
    ['const url = "https://example.com";\nfetch(url);'],
    ['api.get("api/x");'],
    ['other.fetch("/api/x");'],
    ['apiFetchHelper("/api/x");'],
  ])("레거시 호출이 아니면 통과한다: %s", (code) => {
    put("src/a.ts", `${code}\n`);
    expect(run().code).toBe(0);
  });

  test("정의 파일 apiFetch.ts 와 http/client.ts 는 건너뛴다", () => {
    const code = 'fetch("/api/x");\napiFetch("/api/y");\n';
    put("src/lib/apiFetch.ts", code);
    put("src/lib/http/client.ts", code);
    expect(run().code).toBe(0);
  });

  test("api/ 파일의 fetch 는 세지 않는다", () => {
    put("api/_lib/a.ts", 'fetch("/api/x");\napiFetch("/api/y");\n');
    expect(run().code).toBe(0);
  });
});

// --update 로 baseline을 만들어 파일별 분류 수를 읽는다.
function counts() {
  expect(run("--update").code).toBe(0);
  return JSON.parse(
    readFileSync(join(root, "scripts/http-legacy.baseline.json"), "utf8"),
  );
}

describe("check-http-legacy legacyError", () => {
  test.each([
    ['sendError(res, "detail", 400, "x");'],
    ['sendError(res, "okDetail", 400, "x");'],
    ['sendError(res, "coded", 400, "x", "c");'],
    ['sendError(res, "error", 500, "x");'],
    ['sendError(res, shape, 400, "x");'],
    ['export default defineHandler({ errorShape: "detail", handler });'],
    ['export default defineHandler({ errorShape: "coded", handler });'],
    ['res.status(400).json({ detail: "x" });'],
    ['res.status(500).send("x");'],
    ["res.status(404).end();"],
    ["res.status(code).json({ a: 1 });"],
    ['response.status(403).json({ error: "x" });'],
    ['resp.status(401).json({ error: "x" });'],
    ['fooRes.status(400).json({ error: "x" });'],
    ['ctx.res.status(400).json({ error: "x" });'],
  ])("레거시 오류 응답을 잡는다: %s", (code) => {
    put("api/_lib/a.ts", `${code}\n`);
    expect(counts()).toEqual({ "api/_lib/a.ts": { legacyError: 1 } });
  });

  test.each([
    ['sendError(res, "problem", 400, "x", "c");'],
    ['export default defineHandler({ errorShape: "problem", handler });'],
    ["res.status(200).json({ a: 1 });"],
    ["res.status(201).json({ a: 1 });"],
    ["res.json({ a: 1 });"],
    ["res.status(204).end();"],
    ['other.status(400).json({ detail: "x" });'],
    ["res.status(400);"],
    ["const body = await r.json();"],
    ['const body = await res.json({ detail: "x" }, 500);'],
  ])("레거시 오류가 아니면 세지 않는다: %s", (code) => {
    put("api/_lib/a.ts", `${code}\n`);
    expect(counts()).toEqual({});
  });

  test("src/ 파일과 httpResponse.ts 정의 파일은 세지 않는다", () => {
    const code =
      'sendError(res, "detail", 400, "x");\nres.status(400).json({});\n';
    put("src/a.ts", code);
    put("api/_lib/httpResponse.ts", code);
    expect(counts()).toEqual({});
  });
});

describe("check-http-legacy okSuccess", () => {
  test.each([
    ["res.status(200).json({ ok: true });"],
    ["res.json({ ok: true, data });"],
    ["res.status(201).json({ ok: true });"],
    ["res.json({ ok });"],
    ["res.json({ ok: result.ok });"],
    ["fooRes.json({ ok: true });"],
  ])("ok 멤버가 있는 성공 본문을 잡는다: %s", (code) => {
    put("api/_lib/a.ts", `${code}\n`);
    expect(counts()).toEqual({ "api/_lib/a.ts": { okSuccess: 1 } });
  });

  test("오류 상태의 ok:false 는 legacyError로만 센다", () => {
    put("api/_lib/a.ts", "res.status(400).json({ ok: false });\n");
    expect(counts()).toEqual({ "api/_lib/a.ts": { legacyError: 1 } });
  });

  test.each([
    ["res.status(200).json({ id: 1 });"],
    ["res.json({ items });"],
    ["res.json({ data: { ok: true } });"],
    ["res.json(ok);"],
    ["other.json({ ok: true });"],
    ["res.send({ ok: true });"],
  ])("ok 멤버가 없거나 응답이 아니면 세지 않는다: %s", (code) => {
    put("api/_lib/a.ts", `${code}\n`);
    expect(counts()).toEqual({});
  });

  test("src/ 파일은 세지 않는다", () => {
    put("src/a.ts", "res.json({ ok: true });\n");
    expect(counts()).toEqual({});
  });
});

describe("check-http-legacy outsideHandler", () => {
  const manifest = (entries) =>
    `export const routes = {\n${entries
      .map(([key, path]) => `  "${key}": () => import("${path}"),`)
      .join("\n")}\n};\n`;
  const wrapped = "export default defineHandler({ errorShape: 'problem' });\n";
  const plain = "export default function handler(req, res) {}\n";

  test.each([["manifest.ts"], ["manifest-30.ts"], ["manifest-60.ts"]])(
    "%s 가 가리키는 파일이 defineHandler 를 안 부르면 1로 센다",
    (name) => {
      put(`api/_routes/${name}`, manifest([["a/b", "./a/b.js"]]));
      put("api/_routes/a/b.ts", plain);
      expect(counts()).toEqual({ "api/_routes/a/b.ts": { outsideHandler: 1 } });
    },
  );

  test("defineHandler 를 부르는 엔드포인트는 세지 않는다", () => {
    put("api/_routes/manifest.ts", manifest([["a", "./a.js"]]));
    put("api/_routes/a.ts", wrapped);
    expect(counts()).toEqual({});
  });

  test("같은 파일에 sendError 가 여러 번 있어도 outsideHandler 는 1이다", () => {
    put("api/_routes/manifest.ts", manifest([["a", "./a.js"]]));
    put(
      "api/_routes/a.ts",
      `${plain}res.status(400).json({});\nres.status(500).json({});\n`,
    );
    expect(counts()).toEqual({
      "api/_routes/a.ts": { legacyError: 2, outsideHandler: 1 },
    });
  });

  test("단독 엔드포인트 api/*.ts, cron, performance 는 세고 router 와 _lib 는 안 센다", () => {
    put("api/report-pdf.ts", plain);
    put("api/cron/daily.ts", plain);
    put("api/performance/clean.ts", plain);
    put("api/cron/ok.ts", wrapped);
    put("api/router.ts", plain);
    put("api/router-30.ts", plain);
    put("api/_lib/helper.ts", plain);
    put("api/_routes/unreferenced.ts", plain);
    expect(counts()).toEqual({
      "api/report-pdf.ts": { outsideHandler: 1 },
      "api/cron/daily.ts": { outsideHandler: 1 },
      "api/performance/clean.ts": { outsideHandler: 1 },
    });
  });

  test("매니페스트가 없거나 없는 파일을 가리켜도 죽지 않는다", () => {
    put("api/_routes/manifest.ts", manifest([["gone", "./gone.js"]]));
    expect(counts()).toEqual({});
  });
});
