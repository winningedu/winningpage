import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import DashboardPageHeader from "./DashboardPageHeader";

// QA 행295·306 — "입시분석 조언" 뱃지는 origin==='ai'일 때만 뜬다(Dashboard.tsx가
// displayedAdvice.origin === 'ai' ? 'ai' : 'daily'로 adviceType을 결정해 넘긴다).
// 이 파일은 adviceType prop → 뱃지 문구 매핑만 검증한다(origin 판정 자체는
// Dashboard.buildTodayHeadline.test.ts 쪽 영역).
describe("DashboardPageHeader — adviceType별 뱃지", () => {
  test("adviceType='ai'는 '입시분석 조언' 뱃지를 렌더한다", () => {
    render(<DashboardPageHeader adviceType="ai" headline="헤드라인" />);
    expect(screen.getByText("입시분석 조언")).toBeInTheDocument();
  });

  test("adviceType='daily'(rule origin·로딩 중 공용)는 '입시분석' 뱃지를 렌더하지 않는다", () => {
    render(<DashboardPageHeader adviceType="daily" headline="헤드라인" />);
    expect(screen.getByText("일일 분석 조언")).toBeInTheDocument();
    expect(screen.queryByText("입시분석 조언")).not.toBeInTheDocument();
  });
});
