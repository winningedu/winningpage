// STEP2 안내문 직접 입력 글자 수 상한 — QA 시트 행 194 회귀 검증.
//
// 이 파일은 두 가지를 잡는다.
//   ① `isGuideFreetextTooLong`이 경계값(정확히 1000자 통과 / 1001자 거부)에서
//      정확한가 — off-by-one은 여기서만 드러난다.
//   ② `analyze-guide.ts`가 실제로 이 게이트를 호출하고 400을 반환하는가 —
//      상수만 두고 핸들러가 안 부르면 서버는 여전히 뚫려 있다. 핸들러는
//      supabaseAdmin/인증/결제 상태를 통째로 요구해 여기서 실행까지 태우면
//      비용이 크므로(submission-api.test.ts와 같은 이유), 소스 텍스트로
//      배선을 확인한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  GUIDE_FREETEXT_MAX_LENGTH,
  isGuideFreetextTooLong,
} from "./guide-freetext.js";

describe("isGuideFreetextTooLong 경계값", () => {
  test(`정확히 ${GUIDE_FREETEXT_MAX_LENGTH}자는 통과한다`, () => {
    expect(isGuideFreetextTooLong("가".repeat(GUIDE_FREETEXT_MAX_LENGTH))).toBe(
      false,
    );
  });

  test(`${GUIDE_FREETEXT_MAX_LENGTH + 1}자는 거부한다`, () => {
    expect(
      isGuideFreetextTooLong("가".repeat(GUIDE_FREETEXT_MAX_LENGTH + 1)),
    ).toBe(true);
  });

  test("빈 문자열은 통과한다(빈 값 거부는 별도 MISSING_FIELD 게이트가 담당)", () => {
    expect(isGuideFreetextTooLong("")).toBe(false);
  });
});

describe("analyze-guide.ts 서버 게이트 배선", () => {
  const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
  const HANDLER_SOURCE = fs.readFileSync(
    path.join(CURRENT_DIR, "../../_routes/performance/analyze-guide.ts"),
    "utf8",
  );

  test("isGuideFreetextTooLong을 import해서 부른다", () => {
    expect(HANDLER_SOURCE).toContain("isGuideFreetextTooLong");
    expect(HANDLER_SOURCE).toMatch(
      /if\s*\(\s*isGuideFreetextTooLong\(freetext\)\s*\)/,
    );
  });

  test("길이 초과 시 400 FREETEXT_TOO_LONG을 반환한다", () => {
    const block = HANDLER_SOURCE.slice(
      HANDLER_SOURCE.indexOf("isGuideFreetextTooLong(freetext)"),
    ).slice(0, 300);
    expect(block).toContain("fail(");
    expect(block).toContain("400");
    expect(block).toContain("FREETEXT_TOO_LONG");
  });
});
