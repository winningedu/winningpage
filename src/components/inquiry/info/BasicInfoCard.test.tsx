import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import BasicInfoCard from "./BasicInfoCard";
import type { InfoForm } from "./infoLogic";

const FORM: InfoForm = {
  gradeLabel: "고2",
  semester: 2,
  career: "수의예과",
  subject: "생명과학",
};

function setup(overrides: Partial<Parameters<typeof BasicInfoCard>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <BasicInfoCard
      form={FORM}
      errors={{}}
      gradeNote={null}
      disabled={false}
      onChange={onChange}
      {...overrides}
    />,
  );
  return onChange;
}

describe("BasicInfoCard", () => {
  test("학년 3개와 학기 2개 pill 을 그리고 선택값을 표시한다", () => {
    setup();
    expect(screen.getByRole("radio", { name: "고2" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "고1" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "고3" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2학기" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "1학기" })).toBeInTheDocument();
  });

  test("학년을 고르면 onChange 로 알린다", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("radio", { name: "고3" }));
    expect(onChange).toHaveBeenCalledWith({ gradeLabel: "고3" });
  });

  test("학기를 고르면 onChange 로 알린다", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("radio", { name: "1학기" }));
    expect(onChange).toHaveBeenCalledWith({ semester: 1 });
  });

  test("진로와 과목명 입력은 필수 배지와 라벨을 가진다", () => {
    setup();
    expect(screen.getByLabelText(/희망 진로/)).toHaveValue("수의예과");
    expect(screen.getByLabelText(/과목명/)).toHaveValue("생명과학");
    expect(screen.getAllByText("필수")).toHaveLength(2);
  });

  test("입력하면 onChange 로 알린다", () => {
    const onChange = setup();
    fireEvent.change(screen.getByLabelText(/과목명/), {
      target: { value: "화학" },
    });
    expect(onChange).toHaveBeenCalledWith({ subject: "화학" });
  });

  test("교과군 안내 문구를 보여 준다", () => {
    setup();
    expect(
      screen.getByText(
        "교과군과 과목명이 다르면 교과군, 과목명으로 적어요. 예: 과학, 고급생명과학",
      ),
    ).toBeVisible();
  });

  test("필드 오류는 입력 아래에 안내하고 입력에 invalid 를 표시한다", () => {
    setup({ errors: { career: "희망 진로를 적어 주세요." } });
    expect(screen.getByText("희망 진로를 적어 주세요.")).toBeVisible();
    expect(screen.getByLabelText(/희망 진로/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("학년 안내가 있으면 카드 아래에 보여 주고 없으면 그리지 않는다", () => {
    setup({ gradeNote: "1학년은 후속형과 전이형을 권장해요." });
    expect(
      screen.getByText("1학년은 후속형과 전이형을 권장해요."),
    ).toBeVisible();
  });

  test("disabled 면 입력이 잠긴다", () => {
    setup({ disabled: true });
    expect(screen.getByLabelText(/희망 진로/)).toBeDisabled();
    expect(screen.getByRole("radio", { name: "고1" })).toBeDisabled();
  });
});
