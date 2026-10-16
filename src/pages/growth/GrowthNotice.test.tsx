import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import GrowthNotice, { GROWTH_NOTICE_LINES } from "./GrowthNotice";

describe("GrowthNotice", () => {
  test("꼭 알아 두세요 제목과 고지 3줄을 그린다", () => {
    render(<GrowthNotice />);
    const region = screen.getByRole("region", { name: "꼭 알아 두세요" });
    const items = within(region).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "이 진단은 위닝 내부 기준이에요. 합격 가능성이나 학교 평가를 예측하지 않아요.",
      "생활기록부 원문은 받지 않아요(초중등교육법 제25조의2).",
      "리포트 생성에 실패하면 이용권 차감은 자동으로 복구돼요.",
    ]);
  });

  test("상수와 화면 문구가 같은 소스다", () => {
    expect(GROWTH_NOTICE_LINES).toHaveLength(3);
  });

  test("금지 문자(긴 줄표, 가운뎃점, 화살표)가 문구에 없다", () => {
    const forbidden = [0x2014, 0x2013, 0x00b7, 0x2192].map((code) =>
      String.fromCodePoint(code),
    );
    for (const line of GROWTH_NOTICE_LINES) {
      for (const ch of forbidden) expect(line).not.toContain(ch);
    }
  });
});
