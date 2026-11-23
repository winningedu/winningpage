import { describe, expect, it } from "vitest";
import { COPY_TEXT } from "@/lib/diagnosis-v3/source/copyText";
import { SCORE_SHEETS } from "@/lib/diagnosis-v3/source/scoreSheets";
import { PAGE_TITLES, SUBJECT_LABELS, VERDICT_LABELS } from "./labels";

const cell = (sheet: string, r: number, c: number) =>
  String(SCORE_SHEETS[sheet]?.find((row) => row.r === r)?.c[c]);

describe("v3 report labels trace to the sheets", () => {
  it("school subject labels follow 22_리포트요소 D44 in order", () => {
    const { HIST: _hist, ...school } = SUBJECT_LABELS;
    expect(cell("22_리포트요소", 44, 3)).toContain(
      `과목 = ${Object.values(school).join("\u00b7")}`,
    );
  });

  it("verdict labels are the SUBJ_J_ copy id suffixes", () => {
    for (const label of Object.values(VERDICT_LABELS)) {
      expect(COPY_TEXT[`SUBJ_J_${label}`]).toBeDefined();
    }
  });

  // The PDF toc (page 1) and page headers are the source; no sheet cell has them.
  it("page titles are the improved report PDF toc titles, keyed by fixed page number", () => {
    expect(PAGE_TITLES).toEqual({
      1: "진단 요약",
      2: "목표 진단",
      3: "성적 진단",
      4: "7단계 학습관리 사이클",
      5: "방해 요인과 마음 상태",
      6: "학교생활\u00b7입시 준비도",
      7: "입시 준비도 \u00b7 목표 대학",
      8: "재미로 보는 MBTI 학습 궁합",
      9: "나의 기질 프로파일",
      10: "기질 기반 입시 설계",
      11: "진단 후 4주 실행 플랜",
      12: "1주차 목표과제 플래너",
      13: "2주차 목표과제 플래너",
      14: "3주차 목표과제 플래너",
      15: "4주차 목표과제 플래너",
      16: "추천 서비스와 다음 단계",
    });
  });
});
