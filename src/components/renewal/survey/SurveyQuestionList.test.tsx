import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { QuestionId } from "@/lib/diagnosis-v3/codes";
import { OPTIONS } from "@/lib/diagnosis-v3/options";
import SurveyQuestionList from "./SurveyQuestionList";

afterEach(cleanup);

let latest: Record<string, unknown> = {};

function Harness({
  ids,
  initial = {},
}: {
  ids: QuestionId[];
  initial?: Record<string, unknown>;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial);
  latest = answers;
  return (
    <SurveyQuestionList
      questionIds={ids}
      answers={answers}
      onAnswer={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
      diagnosedAt="2026-11-09"
      seed="seed-1"
    />
  );
}

const label = (
  rows: readonly { ordinal: number; label: string }[],
  n: number,
) => rows.find((row) => row.ordinal === n)?.label ?? "";

describe("SurveyQuestionList 선택 문항", () => {
  it("카드에 화면 번호와 13번 시트 제목을 보인다", () => {
    render(<Harness ids={["q10"]} initial={{ q1: 3 }} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "최근 공부를 가장 자주 방해하는 것은 무엇인가요?",
      }),
    ).toBeInTheDocument();
  });

  it("배타 항목을 고르면 나머지를 해제하고, 나머지를 고르면 배타 항목을 해제한다", () => {
    render(<Harness ids={["q10"]} initial={{ q1: 3 }} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: label(OPTIONS.q10, 1) }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: label(OPTIONS.q10, 3) }),
    );
    expect(latest.q10).toEqual([1, 3]);
    fireEvent.click(
      screen.getByRole("checkbox", { name: label(OPTIONS.q10, 16) }),
    );
    expect(latest.q10).toEqual([16]);
    fireEvent.click(
      screen.getByRole("checkbox", { name: label(OPTIONS.q10, 2) }),
    );
    expect(latest.q10).toEqual([2]);
  });

  it("최대 선택 수에 닿으면 남은 항목을 막는다", () => {
    render(<Harness ids={["q14"]} initial={{ q1: 3 }} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: label(OPTIONS.q14, 1) }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: label(OPTIONS.q14, 2) }),
    );
    expect(
      screen.getByRole("checkbox", { name: label(OPTIONS.q14, 3) }),
    ).toBeDisabled();
    expect(latest.q14).toEqual([1, 2]);
  });

  it("단일 선택은 순번을 숫자로 저장한다", () => {
    render(<Harness ids={["q1"]} />);
    fireEvent.click(screen.getByRole("radio", { name: label(OPTIONS.q1, 5) }));
    expect(latest.q1).toBe(5);
  });
});
