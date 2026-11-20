import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, TextInput } from "./formFields";

describe("Field", () => {
  it("label 텍스트로 안쪽 컨트롤을 찾을 수 있고 라벨은 font-medium이다", () => {
    render(
      <Field label="이름">
        <TextInput value="" onChange={() => {}} />
      </Field>,
    );

    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(screen.getByText("이름").className).toContain("font-medium");
    expect(screen.getByText("이름").className).not.toMatch(/font-(bold|black)/);
  });
});
