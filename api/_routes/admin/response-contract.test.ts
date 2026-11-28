// 관리자 라우트의 성공 응답이 응답 스키마의 타입을 만족하는지(satisfies) 지키는 구조 가드.
// c.json(...) 의 첫 인자가 satisfies 식이 아닌 곳을 파일별로 센다. BASELINE 은 줄어들기만 하고, 0 이 되면 항목을 지운다.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const DIR = import.meta.dirname;

/** 파일별 satisfies 없는 c.json 호출 수. 고치면 이 표에서 줄이거나 지운다. */
const BASELINE: Record<string, number> = {
  "coupons.ts": 10,
  "members-detail.ts": 3,
  "sections.ts": 5,
  "tenants-detail.ts": 2,
  "tenants-purge.ts": 1,
  "tenants-students.ts": 1,
  "tenants.ts": 1,
};

function countWithoutSatisfies(file: string): number {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(DIR, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let count = 0;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "json" &&
      node.expression.expression.getText() === "c"
    ) {
      const [first] = node.arguments;
      if (first && !ts.isSatisfiesExpression(first)) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

describe("관리자 라우트 성공 응답 계약", () => {
  test("c.json 첫 인자가 satisfies 가 아닌 호출 수가 BASELINE 과 같다", () => {
    const actual: Record<string, number> = {};
    for (const file of fs.readdirSync(DIR).sort()) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const count = countWithoutSatisfies(file);
      if (count > 0) actual[file] = count;
    }
    expect(actual).toEqual(BASELINE);
  });
});
