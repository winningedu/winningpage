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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// 식별자 인수는 같은 파일 안 선언(호출보다 앞선 것 중 마지막)의 초기값 글자로 푼다.
function argText(arg, call, sf) {
  if (!ts.isIdentifier(arg)) return arg.getText(sf);
  let resolved = arg.getText(sf);
  visit(sf, (d) => {
    if (
      ts.isVariableDeclaration(d) &&
      ts.isIdentifier(d.name) &&
      d.name.text === arg.text &&
      d.initializer &&
      d.getStart(sf) < call.getStart(sf)
    ) {
      resolved = d.initializer.getText(sf);
    }
  });
  return resolved;
}

function isLegacyFetch(call, sf) {
  const callee = call.expression.getText(sf);
  if (callee === "apiFetch") return true;
  if (!/^(fetch|window\.fetch|globalThis\.fetch)$/.test(callee)) return false;
  const first = call.arguments[0];
  return first !== undefined && argText(first, call, sf).includes("/api");
}

const RESPONSE_RECEIVER = /^(res|response|resp)$|Res$/;

// res.status(N).json(...) 형태의 응답 쓰기 호출을 읽는다. 응답 호출이 아니면 null.
function responseCall(call, sf) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const method = callee.name.text;
  if (!["json", "send", "end"].includes(method)) return null;
  // 인수 없는 json()은 fetch Response 본문 읽기다
  if (method === "json" && call.arguments.length === 0) return null;
  let obj = callee.expression;
  let status = null;
  while (
    ts.isCallExpression(obj) &&
    ts.isPropertyAccessExpression(obj.expression)
  ) {
    if (obj.expression.name.text === "status") {
      status = obj.arguments[0]?.getText(sf) ?? null;
    }
    obj = obj.expression.expression;
  }
  const name = ts.isIdentifier(obj)
    ? obj.text
    : ts.isPropertyAccessExpression(obj)
      ? obj.name.text
      : null;
  if (name === null || !RESPONSE_RECEIVER.test(name)) return null;
  return { method, status, arg: call.arguments[0] };
}

// 상태 코드 글자가 400 이상 숫자이거나 숫자가 아니면 오류로 본다(상태 없음은 성공).
function isErrorStatus(status) {
  if (status === null) return false;
  return /^\d+$/.test(status) ? Number(status) >= 400 : true;
}

function isLegacyError(call, sf) {
  const callee = call.expression.getText(sf);
  if (callee === "sendError") {
    const shape = call.arguments[1];
    return !(
      shape !== undefined &&
      ts.isStringLiteralLike(shape) &&
      shape.text === "problem"
    );
  }
  if (callee === "defineHandler") {
    const opts = call.arguments[0];
    if (opts === undefined || !ts.isObjectLiteralExpression(opts)) return false;
    const prop = opts.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === "errorShape",
    );
    return !(
      prop !== undefined &&
      ts.isStringLiteralLike(prop.initializer) &&
      prop.initializer.text === "problem"
    );
  }
  const r = responseCall(call, sf);
  return r !== null && isErrorStatus(r.status);
}

// 성공 본문(.json, 오류 상태 아님)에 ok 멤버가 있는지 본다.
function isOkSuccess(call, sf) {
  const r = responseCall(call, sf);
  if (r === null || r.method !== "json" || isErrorStatus(r.status)) {
    return false;
  }
  if (r.arg === undefined || !ts.isObjectLiteralExpression(r.arg)) return false;
  return r.arg.properties.some(
    (p) =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      p.name.getText(sf) === "ok",
  );
}

const RULES = {
  browserDb: { scope: "src", match: isBrowserDb },
  legacyFetch: {
    scope: "src",
    match: isLegacyFetch,
    exempt: /^src\/lib\/(apiFetch\.ts|http\/client\.ts)$/,
  },
  legacyError: {
    scope: "api",
    match: isLegacyError,
    exempt: /^api\/_lib\/httpResponse\.ts$/,
  },
  okSuccess: { scope: "api", match: isOkSuccess },
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
      if (rule.scope !== side || rule.exempt?.test(file)) continue;
      if (!rule.match(node, sf)) continue;
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

// 파일별 적중 목록을 {파일: {분류: 수}} 로 줄인다(0인 항목 제외, 파일명 정렬).
function toCounts(hits) {
  const counts = {};
  for (const file of Object.keys(hits).sort()) {
    for (const category of CATEGORIES) {
      const n = hits[file][category]?.length ?? 0;
      if (n === 0) continue;
      counts[file] ??= {};
      counts[file][category] = n;
    }
  }
  return counts;
}

function main() {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf("--root");
  const root =
    rootIdx >= 0
      ? resolve(argv[rootIdx + 1] ?? ".")
      : join(dirname(fileURLToPath(import.meta.url)), "..");
  const hits = scan(root);
  if (argv.includes("--update")) {
    const counts = toCounts(hits);
    mkdirSync(dirname(join(root, BASELINE_PATH)), { recursive: true });
    writeFileSync(
      join(root, BASELINE_PATH),
      `${JSON.stringify(counts, null, 2)}\n`,
    );
    console.log(`baseline 갱신: 파일 ${Object.keys(counts).length}개`);
    process.exit(0);
  }
  const baseline = readBaseline(root);
  let failed = false;
  let shrunk = false;
  const files = new Set([...Object.keys(hits), ...Object.keys(baseline)]);
  for (const file of [...files].sort()) {
    for (const category of CATEGORIES) {
      const list = hits[file]?.[category] ?? [];
      const allowed = baseline[file]?.[category] ?? 0;
      if (list.length < allowed) shrunk = true;
      if (list.length <= allowed) continue;
      failed = true;
      console.error(
        `${file}: ${category} ${list.length} (baseline ${allowed})`,
      );
      for (const h of list) console.error(`  ${file}:${h.line}: ${h.text}`);
    }
  }
  const counts = toCounts(hits);
  for (const category of CATEGORIES) {
    const total = Object.values(counts).reduce(
      (sum, byCategory) => sum + (byCategory[category] ?? 0),
      0,
    );
    console.log(`${category}: ${total}`);
  }
  if (shrunk && !failed) {
    console.log(
      "baseline보다 적중이 줄었다. node scripts/check-http-legacy.mjs --update 로 baseline을 갱신한다.",
    );
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
