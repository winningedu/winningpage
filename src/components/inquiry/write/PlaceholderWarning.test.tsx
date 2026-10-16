import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import PlaceholderWarning from "./PlaceholderWarning";

describe("PlaceholderWarning", () => {
  test("절별 개수를 알리고 막지 않는다고 안내한다", () => {
    render(<PlaceholderWarning placeholders={{ III: 2, IV: 1 }} />);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Ⅲ절 2곳, Ⅳ절 1곳");
    expect(note).toHaveTextContent("그대로 제출할 수 있어요");
  });

  test("자리표시자가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<PlaceholderWarning placeholders={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
