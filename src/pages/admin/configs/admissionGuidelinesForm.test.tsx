// 모집요강 HWP 파싱 미리보기의 접근성. 원문 입력란에 이름이 있고 파싱 버튼이 동작한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AdmissionParsingPreview } from "./admissionGuidelinesForm";

afterEach(cleanup);

test("HWP 원문 입력란은 이름으로 찾을 수 있다", () => {
  render(<AdmissionParsingPreview form={{}} onPatch={vi.fn()} />);

  expect(
    screen.getByRole("textbox", { name: "HWP 원문 붙여넣기" }),
  ).toBeInTheDocument();
});

test("편집 창이 열려 있으면 파싱 버튼이 잠기고 안내가 보인다", () => {
  render(<AdmissionParsingPreview form={{}} onPatch={vi.fn()} locked />);

  expect(
    screen.getByRole("button", { name: "파싱 실행(자동 분할)" }),
  ).toBeDisabled();
  expect(
    screen.getByText(/카테고리 편집 창이 열려 있는 동안에는/),
  ).toBeInTheDocument();
});

test("파싱 실행은 원문이 비면 patch 하지 않는다", () => {
  const onPatch = vi.fn();
  render(<AdmissionParsingPreview form={{}} onPatch={onPatch} />);

  fireEvent.click(screen.getByRole("button", { name: "파싱 실행(자동 분할)" }));

  expect(onPatch).not.toHaveBeenCalled();
});
