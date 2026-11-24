// =====================================================================
// HTTP 표준 미이행 검사: PR #491 이후 표준(CLAUDE.md api/, Code)으로 옮기지 않은 호출을 센다.
//
// 검사 대상: git 추적 파일 중 src/, api/ 아래의 .ts .tsx .js .mjs
// (.d.ts, 테스트, e2e 제외). TypeScript 컴파일러 API로 구문을 읽는다(타입 검사 없음).
// 파일별, 분류별 적중 수를 scripts/http-legacy.baseline.json 에 고정하고, 그보다 늘면 실패한다.
// 영역 이관 PR이 baseline을 0까지 줄인다. 절대 올리지 않는다.
//
// 사용:
//   node scripts/check-http-legacy.mjs            검사
//   node scripts/check-http-legacy.mjs --update   baseline 재생성
//   --root <dir>                                  다른 저장소 루트(테스트용)
// =====================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const BASELINE_PATH = "scripts/http-legacy.baseline.json";

const CATEGORIES = [
  "browserDb",
  "legacyFetch",
  "legacyError",
  "outsideHandler",
  "okSuccess",
];

const EXEMPT = [
  /\.d\.ts$/,
  /\.(test|spec|testkit)\./,
  /(^|\/)__tests__\//,
  /\/fixtures\//,
  /^e2e\//,
];

const NOT_DB_RECEIVER =
  /^(Array|Buffer|Object|String|Set|Map|Promise|(U|Ui|I)nt(8|16|32)(Clamped)?Array|Float(32|64)Array|BigU?Int64Array)$/;
const WRITE_METHODS = ["insert", "update", "upsert", "delete"];

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (c) => visit(c, fn));
}

// X.from(...) 뒤에 이어 붙은 메서드 이름들
function chainMethods(call) {
  const out = [];
  let cur = call;
  while (
    ts.isPropertyAccessExpression(cur.parent) &&
    cur.parent.expression === cur &&
    ts.isCallExpression(cur.parent.parent) &&
    cur.parent.parent.expression === cur.parent
  ) {
    out.push(cur.parent.name.text);
    cur = cur.parent.parent;
  }
  return out;
}

function isBrowserDb(call, sf) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const recv = callee.expression.getText(sf);
  if (callee.name.text === "rpc") return call.arguments.length > 0;
  if (callee.name.text !== "from" || call.arguments.length === 0) return false;
  if (/\.storage$/.test(recv)) return true;
  if (NOT_DB_RECEIVER.test(recv)) return false;
  const methods = chainMethods(call);
  return (
    methods.some((m) => m === "select" || WRITE_METHODS.includes(m)) ||
    ts.isStringLiteralLike(call.arguments[0])
  );
}

const RULES = {
  browserDb: { scope: "src", match: isBrowserDb },
};

function analyze(file, text) {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const side = file.startsWith("src/") ? "src" : "api";
  const found = {};
  visit(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    for (const [category, rule] of Object.entries(RULES)) {
      if (rule.scope !== side || !rule.match(node, sf)) continue;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      found[category] ??= [];
      found[category].push({
        line,
        text: node.getText(sf).split("\n")[0].trim(),
      });
    }
  });
  return found;
}

export function scan(root) {
  const files = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /^(src|api)\//.test(f))
    .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
    .filter((f) => !EXEMPT.some((re) => re.test(f)));
  const hits = {};
  for (const file of files) {
    const found = analyze(file, readFileSync(join(root, file), "utf8"));
    if (Object.keys(found).length > 0) hits[file] = found;
  }
  return hits;
}

function readBaseline(root) {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8"));
  } catch {
    return {};
  }
}

function main() {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf("--root");
  const root =
    rootIdx >= 0
      ? resolve(argv[rootIdx + 1] ?? ".")
      : join(dirname(fileURLToPath(import.meta.url)), "..");
  const hits = scan(root);
  const baseline = readBaseline(root);
  let failed = false;
  for (const [file, byCategory] of Object.entries(hits)) {
    for (const category of CATEGORIES) {
      const list = byCategory[category] ?? [];
      const allowed = baseline[file]?.[category] ?? 0;
      if (list.length <= allowed) continue;
      failed = true;
      console.error(
        `${file}: ${category} ${list.length} (baseline ${allowed})`,
      );
      for (const h of list) console.error(`  ${file}:${h.line}: ${h.text}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
