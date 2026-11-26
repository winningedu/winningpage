// 스쿨멘토 배포(SITE=schoolmentor)의 브랜드와 도메인. 원부 4절: 위닝 승인본에서 브랜드와 도메인만 바꾼다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildAlimtalkMessage, buildSmsMessage } from "./aligo.js";
import { ALIMTALK_TEMPLATES } from "./alimtalkTemplates.js";

const T = ALIMTALK_TEMPLATES;

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("스쿨멘토 사이트", () => {
  test("인증번호 본문과 SMS 는 위닝에듀 자리만 스쿨멘토로 바뀐다", () => {
    expect(buildAlimtalkMessage("123456")).toBe(
      [
        "안녕하세요, 스쿨멘토입니다.",
        "",
        "본인 확인을 위한 인증번호를 입력해주세요.",
        "인증번호: 123456",
        "",
        "※ 본인이 요청하지 않은 경우, 인증번호를 입력하거나 타인에게 공유하지 마세요.",
      ].join("\n"),
    );
    expect(buildSmsMessage("123456")).toBe("[스쿨멘토] 인증번호 123456");
  });

  test("일간 보고서는 첫 줄과 대체 문자 머리만 바뀐다", () => {
    const vars = {
      학생명: "김학생",
      월: "11",
      일: "26",
      이상목표시간: "5시간",
      최소목표시간: "3시간",
      실제학습시간: "4시간",
      이상달성률: "80",
      최소달성률: "100",
      오늘완료내용: "수학",
      전체계획수: "5",
      달성계획수: "4",
      오늘컨디션: "좋음",
      학생한마디: "열심히",
    };
    const body = T.dailyReport.build(vars);
    expect(body.split("\n")[0]).toBe("안녕하세요, 스쿨멘토입니다.");
    expect(body).not.toContain("위닝에듀");
    expect(T.dailyReport.smsFallback?.(vars)).toBe(
      "[스쿨멘토] 김학생 학생의 11/26 학습 현황을 알려드립니다.",
    );
  });

  test("주간 리포트는 첫 줄, 버튼 도메인, 대체 문자 머리가 바뀐다", () => {
    const vars = {
      학생명: "김학생",
      N월: "11",
      N주차: "4",
      reportId: "2026-11-23",
    };
    expect(T.weeklyReport.build(vars)).toBe(
      "안녕하세요, 스쿨멘토입니다.\n\n김학생 학생의 11월 4주차 주간 학습 리포트가 발행되었습니다.\n\n아래 버튼을 눌러 이번 주 학습 시간과 목표 달성 현황, 계획 실천 결과를 리포트에서 확인해 보세요.",
    );
    expect(T.weeklyReport.button?.(vars).linkMo).toBe(
      "https://www.schoolmentor.kr/services/goal/reports/weekly/2026-11-23",
    );
    expect(T.weeklyReport.button?.(vars).linkPc).toBe(
      "https://www.schoolmentor.kr/services/goal/reports/weekly/2026-11-23",
    );
    expect(T.weeklyReport.smsFallback?.(vars)).toBe(
      "[스쿨멘토] 김학생 학생의 주간 학습 리포트가 발행되었습니다.",
    );
  });

  test("월간 리포트는 첫 줄, 버튼 도메인, 대체 문자 머리가 바뀐다", () => {
    const vars = { 학생명: "김학생", N월: "11", reportId: "2026-11" };
    expect(T.monthlyReport.build(vars).split("\n")[0]).toBe(
      "안녕하세요, 스쿨멘토입니다.",
    );
    expect(T.monthlyReport.button?.(vars).linkMo).toBe(
      "https://www.schoolmentor.kr/services/goal/reports/monthly/2026-11",
    );
    expect(T.monthlyReport.button?.(vars).linkPc).toBe(
      "https://www.schoolmentor.kr/services/goal/reports/monthly/2026-11",
    );
    expect(T.monthlyReport.smsFallback?.(vars)).toBe(
      "[스쿨멘토] 김학생 학생의 월간 학습 리포트가 발행되었습니다.",
    );
  });

  test("성장설계 완료는 본문이 같고 대체 문자 머리만 바뀐다", () => {
    const vars = { 학생이름: "김학생", 발행일: "2026.11.26" };
    expect(T.growthReportDone.build(vars)).toBe(
      "성장설계 리포트가 도착했어요\n\n김학생 학생\n지금까지의 활동을 분석해 남은 기간을 설계했어요.\n\n발행일 2026.11.26\n\n성적 진단 항목은 학부모 화면에 보이지 않아요.",
    );
    expect(T.growthReportDone.smsFallback?.(vars)).toBe(
      "[스쿨멘토] 김학생 학생의 성장설계 리포트가 도착했습니다.",
    );
  });

  test("가입 축하 쿠폰은 위닝 전용이라 그대로다", () => {
    expect(T.signupCoupon.build({ 고객명: "홍길동" })).toContain(
      "위닝에듀 회원이 되신 것을 환영합니다.",
    );
  });
});
