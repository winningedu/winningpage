// =====================================================================
// Promise.all 직렬화 검사: Promise.all / allSettled / race / any 에 넘기는 배열 리터럴 안에
// await 식이 바로 있으면 실패한다. 배열 원소를 만드는 시점에 await 가 끝나야 다음 원소가 시작돼서,
// 읽기가 함께 시작되지 않고 하나씩 실행된다. 쿼리나 Promise 를 await 없이 넘긴다.
//
// 검사 대상: git 추적 파일 중 api/, src/, shared/ 아래의 .ts .tsx .js .mjs
// (.d.ts, 테스트, testkit, e2e 제외). TypeScript 컴파일러 API로 구문을 읽는다(타입 검사 없음).
// 배열 안에 다른 함수(async 화살표 등)가 있으면 그 함수 안의 await 는 세지 않는다.
// 기준 적중 수는 0이다. baseline 은 없다.
//
// 사용:
//   node scripts/check-await-in-parallel.mjs
//   --root <dir>   다른 저장소 루트(테스트용)
// =====================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const COMBINATORS = new Set(["all", "allSettled", "race", "any"]);

const EXEMPT = [
  /\.d\.ts$/,
  /\.(test|spec|testkit)\./,
  /(^|\/)__tests__\//,
  /\/fixtures\//,
  /^e2e\//,
];

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (c) => visit(c, fn));
}

// Promise.all([...]) 의 호출 대상 배열이면 true
function isCombinatorArray(node) {
  const call = node.parent;
  if (!ts.isCallExpression(call) || call.arguments[0] !== node) return false;
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Promise" &&
    COMBINATORS.has(callee.name.text)
  );
}

// await 에서 위로 올라가며 함수 경계 전에 combinator 배열을 만나는지 본다.
function insideCombinatorArray(await_) {
  for (let n = await_.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) return false;
    if (ts.isArrayLiteralExpression(n) && isCombinatorArray(n)) return true;
  }
  return false;
}

export function scan(root) {
  const files = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /^(api|src|shared)\//.test(f))
    .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f))
    .filter((f) => !EXEMPT.some((re) => re.test(f)));
  const hits = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    visit(sf, (node) => {
      if (ts.isAwaitExpression(node) && insideCombinatorArray(node)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push({ file, line: line + 1 });
      }
    });
  }
  return hits;
}

function main() {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf("--root");
  const root =
    rootIdx >= 0
      ? resolve(argv[rootIdx + 1] ?? ".")
      : join(dirname(fileURLToPath(import.meta.url)), "..");
  const hits = scan(root);
  for (const h of hits) {
    console.error(
      `${h.file}:${h.line}: Promise.all 배열 안의 await. 쿼리를 await 없이 넘겨 함께 시작한다.`,
    );
  }
  process.exit(hits.length > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
