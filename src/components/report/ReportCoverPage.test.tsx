// 리포트 공용 표지 — QA 2차 시트 행37·51("최종 리포트에 표지를 붙여 달라", 고객사
// "매우중요"). 세 리포트(학습진단·목표관리 성장·수행평가)가 공유하는 프레젠테이션
// 컴포넌트다. 값이 없는 항목은 렌더하지 않는다(폴백 문구를 지어내지 않는다).
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportCoverPage from "./ReportCoverPage";

describe("ReportCoverPage", () => {
  it("title을 렌더한다", () => {
    render(
      <ReportCoverPage serviceLabel="학습진단" title="위닝에듀 학습진단 리포트" />,
    );

    expect(
      screen.getByText("위닝에듀 학습진단 리포트"),
    ).toBeInTheDocument();
  });
});
