// 성장설계 완료 버튼(UO_3143): 사이트 www 고정 도메인에 경로 변수 학생ID, 리포트ID.

import { afterEach, describe, expect, test, vi } from "vitest";
import { ALIMTALK_TEMPLATES } from "./alimtalkTemplates.js";

const vars = {
  학생이름: "김학생",
  발행일: "2026.11.26",
  학생ID: "s1",
  리포트ID: "r1",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("growthReportDone 버튼", () => {
  test("위닝은 www.winningedu.com 경로다", () => {
    vi.stubEnv("SITE", "");
    expect(ALIMTALK_TEMPLATES.growthReportDone.button?.(vars)).toEqual({
      name: "성장설계 리포트 보기",
      linkType: "WL",
      linkTypeName: "웹링크",
      linkMo: "https://www.winningedu.com/mypage/children/s1/growth/r1",
      linkPc: "https://www.winningedu.com/mypage/children/s1/growth/r1",
    });
  });

  test("스쿨멘토는 www.schoolmentor.kr 경로다", () => {
    vi.stubEnv("SITE", "schoolmentor");
    const button = ALIMTALK_TEMPLATES.growthReportDone.button?.(vars);
    expect(button?.linkMo).toBe(
      "https://www.schoolmentor.kr/mypage/children/s1/growth/r1",
    );
    expect(button?.linkPc).toBe(
      "https://www.schoolmentor.kr/mypage/children/s1/growth/r1",
    );
  });
});
