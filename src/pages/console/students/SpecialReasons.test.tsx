// 특이학생 사유 칩: 다섯 사유의 문구와 기관 기준값.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SpecialReasons from "./SpecialReasons";

describe("SpecialReasons", () => {
  it("다섯 사유를 응답의 기준값을 넣은 문구로 보여 준다", () => {
    render(
      <SpecialReasons
        reasons={["low_rate", "inactive", "urgency", "feedback_wait", "manual"]}
        thresholds={{ execRatePct: 50, inactiveDays: 3, feedbackWaitDays: 10 }}
      />,
    );

    expect(screen.getByText("달성율 50% 미만")).toBeTruthy();
    expect(screen.getByText("3일 이상 미접속")).toBeTruthy();
    expect(screen.getByText("긴급도 높음 이상")).toBeTruthy();
    expect(screen.getByText("수행평가 피드백 10일 이상 대기")).toBeTruthy();
    expect(screen.getByText("직접 지정")).toBeTruthy();
  });
});
