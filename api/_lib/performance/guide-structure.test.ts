// 수행평가 안내문 판정 입력 직렬화 회귀 검증.
//
// `guideTextFromSession`은 우리 저장소에만 있는 어댑터다 — 세션이 upload/
// manual 중 어느 모드인지에 따라 `guide_json.text` / `guide_freetext` 중
// 어느 컬럼을 읽어 판정에 넘길지를 결정한다(§8.3, api/_routes/performance/analyze-guide.ts).
// 이 배선이 조용히 틀어지면 안내문 판정 자체는 멀쩡한데 엉뚱한 텍스트를
// 판정하게 된다.
import { describe, expect, test } from "vitest";

import * as ported from "./guide-structure.js";

describe("판정 입력 직렬화", () => {
  test("upload 모드 → guide_json.text (줄바꿈 보존)", () => {
    const uploadSession = {
      guide_input_mode: "upload",
      guide_json: {
        mode: "upload",
        text: "질문 1: 주제를 고른 이유는 무엇인가요?",
      },
    };
    expect(ported.inferGuideStructure(uploadSession).type).toBe(
      "문항별 답변형",
    );
  });

  test("manual 모드 → guide_freetext", () => {
    const manualSession = {
      guide_input_mode: "manual",
      guide_freetext: "카드뉴스 4장을 제작한다.",
    };
    expect(ported.inferGuideStructure(manualSession).type).toBe(
      "카드뉴스·홍보물형",
    );
  });

  test("입력 없음 → 기본 보고서형 (throw 없음)", () => {
    expect(ported.inferGuideStructure({}).type).toBe("기본 보고서형");
    expect(ported.inferGuideStructure().type).toBe("기본 보고서형");
  });
});
