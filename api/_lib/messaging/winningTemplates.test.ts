// 위닝 사이트 승인 문안 고정 테스트. 카카오는 본문, 버튼, 대체 문자를 글자 단위로 대조하므로
// 아래 리터럴은 리팩터링 전 코드가 만들던 문자열 그대로다. 한 글자라도 달라지면 실패해야 한다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const outbound = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../outbound.js", () => ({ outboundFetch: outbound.fetch }));

import {
  buildAlimtalkMessage,
  buildSmsMessage,
  sendTemplateMessage,
} from "./aligo.js";
import { ALIMTALK_TEMPLATES } from "./alimtalkTemplates.js";

const T = ALIMTALK_TEMPLATES;

function sentParams(): Record<string, string> {
  const call = outbound.fetch.mock.calls[0] as [string, { body: string }];
  return Object.fromEntries(new URLSearchParams(call[1].body));
}

beforeEach(() => {
  vi.stubEnv("SITE", "");
  outbound.fetch.mockReset();
  outbound.fetch.mockResolvedValue({
    status: 200,
    text: async () =>
      JSON.stringify({ code: 0, message: "ok", info: { mid: "m1" } }),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("위닝 인증번호(UK_0886)", () => {
  test("알림톡 본문과 SMS 문구가 승인본 그대로다", () => {
    expect(buildAlimtalkMessage("123456")).toBe(
      [
        "안녕하세요, 위닝에듀입니다.",
        "",
        "본인 확인을 위한 인증번호를 입력해주세요.",
        "인증번호: 123456",
        "",
        "※ 본인이 요청하지 않은 경우, 인증번호를 입력하거나 타인에게 공유하지 마세요.",
      ].join("\n"),
    );
    expect(buildSmsMessage("123456")).toBe("[위닝에듀] 인증번호 123456");
  });
});

describe("위닝 템플릿 본문, 버튼, 대체 문자", () => {
  test("signupCoupon", () => {
    const vars = { 고객명: "홍길동" };
    expect(T.signupCoupon.build(vars)).toBe(
      "안녕하세요, 홍길동님.\n\n위닝에듀 회원이 되신 것을 환영합니다.\n\n감사한 마음을 담아 2,000원 할인 쿠폰을 발급해 드렸습니다. 지금 바로 쿠폰함에서 확인해 보세요!\n\n쿠폰은 발급일로부터 6개월간 사용 가능하며, 유효기간이 지나면 자동으로 소멸됩니다.",
    );
    expect(T.signupCoupon.smsFallback?.(vars)).toBe(
      "[위닝에듀] 홍길동님, 가입 축하 2,000원 쿠폰이 발급되었습니다.",
    );
    expect(T.signupCoupon.button).toBeUndefined();
  });

  test("dailyReport", () => {
    const vars = {
      학생명: "김학생",
      월: "11",
      일: "26",
      이상목표시간: "5시간",
      최소목표시간: "3시간",
      실제학습시간: "4시간",
      이상달성률: "80",
      최소달성률: "100",
      오늘완료내용: "수학 1단원",
      전체계획수: "5",
      달성계획수: "4",
      오늘컨디션: "좋음",
      학생한마디: "열심히",
    };
    expect(T.dailyReport.build(vars)).toBe(
      "안녕하세요, 위닝에듀입니다.\n\n김학생 학생의 11월 26일 학습 현황을 알려드립니다.\n\n■ 목표 대비 오늘\n이상적 학습 시간: 5시간\n최소 학습 시간: 3시간\n실제 학습 시간: 4시간\n이상 목표 달성률 80%\n최소 목표 달성률 100%\n\n■ 오늘 완료\n수학 1단원\n\n■ 계획 달성\n5개 중 4개 달성\n\n■ 오늘의 컨디션\n좋음\n\n■ 학생 한마디\n\u201C열심히\u201D",
    );
    expect(T.dailyReport.smsFallback?.(vars)).toBe(
      "[위닝에듀] 김학생 학생의 11/26 학습 현황을 알려드립니다.",
    );
    expect(T.dailyReport.button).toBeUndefined();
  });

  test("weeklyReport", () => {
    const vars = {
      학생명: "김학생",
      N월: "11",
      N주차: "4",
      reportId: "2026-11-23",
    };
    expect(T.weeklyReport.build(vars)).toBe(
      "안녕하세요, 위닝에듀입니다.\n\n김학생 학생의 11월 4주차 주간 학습 리포트가 발행되었습니다.\n\n아래 버튼을 눌러 이번 주 학습 시간과 목표 달성 현황, 계획 실천 결과를 리포트에서 확인해 보세요.",
    );
    expect(T.weeklyReport.smsFallback?.(vars)).toBe(
      "[위닝에듀] 김학생 학생의 주간 학습 리포트가 발행되었습니다.",
    );
    expect(T.weeklyReport.button?.(vars)).toEqual({
      name: "주간 리포트 확인하기",
      linkType: "WL",
      linkTypeName: "웹링크",
      linkMo:
        "https://www.winningedu.com/services/goal/reports/weekly/2026-11-23",
      linkPc:
        "https://www.winningedu.com/services/goal/reports/weekly/2026-11-23",
    });
  });

  test("monthlyReport", () => {
    const vars = { 학생명: "김학생", N월: "11", reportId: "2026-11" };
    expect(T.monthlyReport.build(vars)).toBe(
      "안녕하세요, 위닝에듀입니다.\n\n김학생 학생의 11월 월간 학습 리포트가 발행되었습니다.\n\n아래 버튼을 눌러 이번 달 학습 시간과 목표 달성 현황, 계획 실천 결과를 리포트에서 확인해 보세요.",
    );
    expect(T.monthlyReport.smsFallback?.(vars)).toBe(
      "[위닝에듀] 김학생 학생의 월간 학습 리포트가 발행되었습니다.",
    );
    expect(T.monthlyReport.button?.(vars)).toEqual({
      name: "월간 리포트 확인하기",
      linkType: "WL",
      linkTypeName: "웹링크",
      linkMo:
        "https://www.winningedu.com/services/goal/reports/monthly/2026-11",
      linkPc:
        "https://www.winningedu.com/services/goal/reports/monthly/2026-11",
    });
  });

  test("growthReportDone 본문과 대체 문자", () => {
    const vars = { 학생이름: "김학생", 발행일: "2026.11.26" };
    expect(T.growthReportDone.build(vars)).toBe(
      "성장설계 리포트가 도착했어요\n\n김학생 학생\n지금까지의 활동을 분석해 남은 기간을 설계했어요.\n\n발행일 2026.11.26\n\n성적 진단 항목은 학부모 화면에 보이지 않아요.",
    );
    expect(T.growthReportDone.smsFallback?.(vars)).toBe(
      "[위닝에듀] 김학생 학생의 성장설계 리포트가 도착했습니다.",
    );
  });
});

describe("위닝 템플릿 발송 요청", () => {
  test("대체 문자가 있는 템플릿은 failover Y 와 대체 문구를 싣는다", async () => {
    vi.stubEnv("ALIGO_TPL_WEEKLY_REPORT", "TPL_W");
    vi.stubEnv("ALIGO_SENDER_KEY", "sk");
    const vars = {
      학생명: "김학생",
      N월: "11",
      N주차: "4",
      reportId: "2026-11-23",
    };
    await sendTemplateMessage({
      phone: "01012345678",
      templateKey: "weeklyReport",
      variables: vars,
    });
    const params = sentParams();
    expect(params.failover).toBe("Y");
    expect(params.fsubject_1).toBe("주간 학습 리포트");
    expect(params.fmessage_1).toBe(
      "[위닝에듀] 김학생 학생의 주간 학습 리포트가 발행되었습니다.",
    );
    expect(params.message_1).toBe(T.weeklyReport.build(vars));
    expect(JSON.parse(params.button_1 as string)).toEqual({
      button: [T.weeklyReport.button?.(vars)],
    });
  });
});
