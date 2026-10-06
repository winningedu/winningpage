import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import * as server from "../../../api/_lib/inquiry/constants";
import * as labels from "./labels";

// em dash, en dash, 가운뎃점 2종, 화살표 구간. 소스에 문자를 직접 쓰지 않도록 코드 포인트로 검사한다.
const FORBIDDEN_CODES = [0x2014, 0x2013, 0x00b7, 0x318d];
function hasForbidden(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (FORBIDDEN_CODES.includes(code)) return true;
    if (code >= 0x2190 && code <= 0x21ff) return true;
  }
  return false;
}

describe("서버 상수와 같은 값", () => {
  test("LINK_KIND_LABELS", () => {
    expect(labels.LINK_KIND_LABELS).toEqual(server.LINK_KIND_LABELS);
  });
  test("FIT_LABELS", () => {
    expect(labels.FIT_LABELS).toEqual(server.FIT_LABELS);
  });
  test("SUBMISSION_LABELS", () => {
    expect(labels.SUBMISSION_LABELS).toEqual(server.SUBMISSION_LABELS);
  });
  test("SOURCE_STATUS_LABELS", () => {
    expect(labels.SOURCE_STATUS_LABELS).toEqual(server.SOURCE_STATUS_LABELS);
  });
  test("STAGE_LABELS", () => {
    expect(labels.STAGE_LABELS).toEqual(server.STAGE_LABELS);
  });
  test("NOTICES 고지 3줄", () => {
    expect(labels.NOTICES).toEqual(server.NOTICES);
    expect(labels.NOTICES).toHaveLength(3);
  });
  test("LINK_KIND_DEFINITIONS", () => {
    expect(labels.LINK_KIND_DEFINITIONS).toEqual(server.LINK_KIND_DEFINITIONS);
  });
  test("주제 추천 한도와 예비 주제 안내", () => {
    expect(labels.TOPIC_MAX_ROUNDS).toBe(server.TOPIC_MAX_ROUNDS);
    expect(labels.MAX_MODEL_ATTEMPTS).toBe(server.MAX_MODEL_ATTEMPTS_PER_MODE);
    expect(labels.PROVISIONAL_TOPIC_NOTE).toBe(server.PROVISIONAL_TOPIC_NOTE);
  });
  test("신뢰도 C 문장과 확인 요청 안내", () => {
    expect(labels.RELIABILITY_NOTES.C).toBe(server.RELIABILITY_C_NOTE);
    expect(labels.RELIABILITY_CHECK_NOTICE).toBe(
      server.RELIABILITY_CHECK_NOTICE,
    );
  });
});

describe("화면 고정 라벨", () => {
  test("단계 이름 6개가 1부터 6까지 순서대로 있다", () => {
    expect(labels.STEP_NAMES).toEqual([
      "정보 입력",
      "주제 추천",
      "설계 리포트",
      "보고서 작성",
      "평가 리포트",
      "확정과 적립",
    ]);
  });

  test("신뢰도 A, B, C 설명이 모두 있다", () => {
    expect(Object.keys(labels.RELIABILITY_LABELS).sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(Object.keys(labels.RELIABILITY_NOTES).sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  test("작성 화면 금지 항목과 가설 기각 안내", () => {
    expect(labels.WRITING_FORBIDDEN).toEqual(server.WRITING_FORBIDDEN);
    expect(labels.WRITING_FORBIDDEN).toHaveLength(4);
    expect(labels.HYPOTHESIS_NOTICE).toEqual(server.HYPOTHESIS_NOTICE);
  });

  test("보관함 라벨", () => {
    expect(labels.ARCHIVE_LABEL).toBe("보관함");
  });
});

describe("금지 문자", () => {
  test("labels.ts 소스에 금지 문자가 없다", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/inquiry/labels.ts"),
      "utf8",
    );
    expect(hasForbidden(source)).toBe(false);
  });

  test("src/lib/inquiry 의 모든 소스에 금지 문자가 없다", async () => {
    const { readdirSync } = await import("node:fs");
    const dir = resolve(process.cwd(), "src/lib/inquiry");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      expect(hasForbidden(readFileSync(resolve(dir, file), "utf8")), file).toBe(
        false,
      );
    }
  });
});

describe("평가 리포트 라벨(P6b)", () => {
  test("평가가 하지 않는 것과 평가 상한", () => {
    expect(labels.NOT_PRODUCED).toEqual(server.NOT_PRODUCED);
    expect(labels.NOT_PRODUCED).toHaveLength(6);
    expect(labels.MAX_EVALUATIONS).toBe(server.MAX_EVALUATIONS);
  });
  test("평가 항목 이름과 배점", () => {
    for (const item of server.RUBRIC) {
      expect(labels.RUBRIC_ITEM_LABELS[item.id]).toEqual({
        label: item.label,
        maxScore: item.maxScore,
      });
    }
  });
  test("핵심 오류 이름", () => {
    for (const e of server.CORE_ERRORS) {
      expect(labels.CORE_ERROR_LABELS[e.id]).toBe(e.label);
    }
  });
  test("체크리스트 13 이름", () => {
    for (const c of server.CHECKLIST) {
      expect(labels.CHECKLIST_LABELS[c.id]).toBe(c.text);
    }
    expect(Object.keys(labels.CHECKLIST_LABELS)).toHaveLength(13);
  });
  test("절 이름", () => {
    for (const s of server.SECTIONS) {
      expect(labels.EVAL_SECTION_LABELS[s.id]).toBe(
        `${s.numeral}절 ${s.title}`,
      );
    }
  });
});
