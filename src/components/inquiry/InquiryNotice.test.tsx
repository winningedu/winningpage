import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { NOTICES } from "@/lib/inquiry/labels";
import InquiryNotice from "./InquiryNotice";

describe("InquiryNotice", () => {
  test("꼭 알아 두세요 제목과 고지 3줄을 labels 의 NOTICES 그대로 그린다", () => {
    render(<InquiryNotice />);
    const region = screen.getByRole("region", { name: "꼭 알아 두세요" });
    const items = within(region).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([...NOTICES]);
    expect(items).toHaveLength(3);
  });
});
