import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NumberField } from "./GradeFields";

afterEach(cleanup);

describe("NumberField 글자 크기 (QA 2026-11-26 6-2)", () => {
  it("데스크톱에서도 text-xl 을 유지한다(ui/input 의 md:text-sm 을 덮는다)", () => {
    render(
      <NumberField title="6번" q4={1} value="1.5" onChange={() => undefined} />,
    );
    const input = screen.getByLabelText("6번");
    expect(input).toHaveClass("md:text-xl");
    expect(input).not.toHaveClass("md:text-sm");
  });
});
