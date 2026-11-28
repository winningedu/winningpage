// 관리자 라우트의 성공 응답이 응답 스키마의 타입을 만족하는지(satisfies) 지키는 구조 가드.
// c.json(...) 의 첫 인자가 satisfies 식이 아닌 곳을 파일별로 센다. 한 곳도 없어야 한다.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

const DIR = import.meta.dirname;

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
  test("c.json 첫 인자가 satisfies 가 아닌 호출 수가 없다", () => {
    const actual: Record<string, number> = {};
    for (const file of fs.readdirSync(DIR).sort()) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const count = countWithoutSatisfies(file);
      if (count > 0) actual[file] = count;
    }
    expect(actual).toEqual({});
  });
});
