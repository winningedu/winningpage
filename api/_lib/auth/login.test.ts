// 잠금 열쇠 해시가 SQL 쪽과 같은지 고정한다. 값은 scripts/b2b-login-attempts.spec.sql 의
// "계정 해시는 Node sha256 과 같다", "쌍 해시는 Node 의 0xff || 계정 해시 || IP 와 같다" 단언과 같은 상수다.
// 둘 중 한쪽만 바뀌면 이 테스트나 SQL 스펙이 깨진다.

import { describe, expect, test } from "vitest";
import { hashParam, pairHashParam } from "./login.js";

describe("잠금 열쇠 해시", () => {
  test("계정 해시는 SQL 스펙의 상수와 같다", () => {
    expect(hashParam("trig@example.com")).toBe(
      "\\xa517c51e3ced871e012721d6e019f006bcd39d478b8189b87243f1a8e19100f6",
    );
  });

  test("쌍 해시는 SQL 스펙의 상수와 같다", () => {
    expect(pairHashParam("trig@example.com", "10.3.0.1")).toBe(
      "\\x1a8ac0a2f7043b905cfe7b66907e63134370803ced35fcff5846d2534068cccb",
    );
  });
});
