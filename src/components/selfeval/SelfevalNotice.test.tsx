import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import SelfevalNotice, { SELFEVAL_NOTICE_LINES } from "./SelfevalNotice";

describe("SelfevalNotice", () => {
  test("꼭 알아 두세요 제목과 4줄 고지를 그린다", () => {
    render(<SelfevalNotice />);
    expect(screen.getByRole("region", { name: "꼭 알아 두세요" })).toBeTruthy();
    expect(SELFEVAL_NOTICE_LINES).toHaveLength(4);
    for (const line of SELFEVAL_NOTICE_LINES) {
      expect(screen.getByText(line)).toBeTruthy();
    }
  });

  test("생성 실패 시 차감 복구와 학교 평가 예측이 아님을 알린다", () => {
    expect(SELFEVAL_NOTICE_LINES.join(" ")).toContain("자동으로 복구");
    expect(SELFEVAL_NOTICE_LINES.join(" ")).toContain("예측이 아니에요");
  });
});
