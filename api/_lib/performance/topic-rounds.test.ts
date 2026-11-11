// 회귀: `recommend-topics.js`(최초/재추천 응답)와 `session.js`(재개 조회 응답)가
// 각자 `MAX_ROUNDS` 상수를 따로 들고 있다가 값이 갈라진 사고 — 새로고침 후 「이어서
// 하기」로 재개하면 `session.js`가 옛 상수(3)를 응답에 실어 STEP3 화면의 "남은 추가
// 추천"이 정본(2)보다 1회 많게 표시됐다. 두 API 소스가 이 한 상수만 import하는지를
// 정적으로 못박아 재발을 막는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { TOPIC_MAX_ROUNDS } from "./topic-rounds.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");

describe("TOPIC_MAX_ROUNDS 정본 단일화", () => {
  test("정본 값은 2다(§QA 재개 남은 추천 표시 버그의 근거)", () => {
    expect(TOPIC_MAX_ROUNDS).toBe(2);
  });

  test("recommend-topics.js는 로컬 MAX_ROUNDS 대신 정본을 import한다", () => {
    const source = read("api/_routes/performance/recommend-topics.ts");
    expect(source).toContain(
      'import { TOPIC_MAX_ROUNDS as MAX_ROUNDS } from "../../_lib/performance/topic-rounds.js";',
    );
    expect(source).not.toMatch(/const MAX_ROUNDS = \d+;/);
  });

  test("session.js도 로컬 MAX_ROUNDS 대신 정본을 import한다(재개 응답 값 일치)", () => {
    const source = read("api/_routes/performance/session.ts");
    expect(source).toContain(
      'import { TOPIC_MAX_ROUNDS } from "../../_lib/performance/topic-rounds.js";',
    );
    expect(source).toContain("const MAX_ROUNDS = TOPIC_MAX_ROUNDS;");
    expect(source).not.toMatch(/const MAX_ROUNDS = \d+;/);
  });
});
