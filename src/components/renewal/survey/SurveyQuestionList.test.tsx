import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { statementsFor } from "@/data/diagnosisSurveyV3";
import type { QuestionId } from "@/lib/diagnosis-v3/codes";
import { LIKERT_LEVELS } from "@/lib/diagnosis-v3/likert";
import { OPTIONS } from "@/lib/diagnosis-v3/options";
import { q23Order } from "@/lib/renewalSurvey";
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

describe("SurveyQuestionList 특수 선택 문항", () => {
  it("20번 MBTI는 코드 문자열로, 몰라요는 NONE으로 저장한다", () => {
    render(<Harness ids={["q22"]} initial={{ q1: 3 }} />);
    fireEvent.click(screen.getByRole("radio", { name: "INTJ" }));
    expect(latest.q22).toBe("INTJ");
    fireEvent.click(
      screen.getByRole("radio", { name: label(OPTIONS.q22, 17) }),
    );
    expect(latest.q22).toBe("NONE");
  });

  it("14번은 평일과 주말을 따로 고른다", () => {
    render(<Harness ids={["q21"]} initial={{ q1: 3 }} />);
    const weekday = screen.getByRole("radiogroup", { name: "평일" });
    const weekend = screen.getByRole("radiogroup", { name: "주말" });
    fireEvent.click(
      within(weekday).getByRole("radio", {
        name: label(OPTIONS.q21Weekday, 3),
      }),
    );
    fireEvent.click(
      within(weekend).getByRole("radio", {
        name: label(OPTIONS.q21Weekend, 2),
      }),
    );
    expect(latest.q21).toEqual({ weekday: 3, weekend: 2 });
  });

  it("3번 1~3번을 고르면 목표 대학과 학과 입력칸이 열린다", () => {
    render(<Harness ids={["q3"]} initial={{ q1: 3 }} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: label(OPTIONS.q3, 2) }));
    fireEvent.change(screen.getByRole("textbox", { name: "목표 대학" }), {
      target: { value: "연세대학교" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "학과" }), {
      target: { value: "경영학과" },
    });
    expect(latest.q3Target).toEqual({
      university: "연세대학교",
      major: "경영학과",
    });
    fireEvent.click(screen.getByRole("radio", { name: label(OPTIONS.q3, 4) }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("SurveyQuestionList 척도 문항", () => {
  /** Desktop rows come first; the mobile layout repeats them. */
  const rowNames = () => {
    const groups = screen.getAllByRole("radiogroup");
    return groups
      .slice(0, groups.length / 2)
      .map((group) => group.getAttribute("aria-label"));
  };

  it("왼쪽부터 매우 그렇다에서 전혀 그렇지 않다 순서로 보이고 역문항 표시는 없다", () => {
    render(<Harness ids={["q20"]} initial={{ q1: 3 }} />);
    const header = [...LIKERT_LEVELS].reverse().map((level) => level.label);
    const first = screen.getAllByRole("radiogroup")[0] as HTMLElement;
    expect(
      within(first)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-label")),
    ).toEqual(
      header.map((name) => `${first.getAttribute("aria-label")} - ${name}`),
    );
    expect(screen.queryByText(/역문항/)).not.toBeInTheDocument();
  });

  it("맨 왼쪽(매우 그렇다)을 고르면 4, 맨 오른쪽은 0으로 저장한다", () => {
    render(<Harness ids={["q20"]} initial={{ q1: 3 }} />);
    const [first, second] = screen.getAllByRole("radiogroup") as HTMLElement[];
    fireEvent.click(
      within(first as HTMLElement).getAllByRole("radio")[0] as HTMLElement,
    );
    fireEvent.click(
      within(second as HTMLElement).getAllByRole("radio")[4] as HTMLElement,
    );
    expect(latest.q20).toEqual({ "1": 4, "2": 0 });
  });

  it("11번 문장은 학년 트랙에 따라 바뀐다", () => {
    render(<Harness ids={["q11"]} initial={{ q1: 2 }} />);
    expect(rowNames()).toEqual(statementsFor("q11", "M3").map((s) => s.text));
    cleanup();
    render(<Harness ids={["q11"]} initial={{ q1: 5 }} />);
    expect(rowNames()).toEqual(statementsFor("q11", "H3").map((s) => s.text));
  });

  it("21번은 시드 순서로 섞어 보이고 응답 확인 문항은 마지막이다", () => {
    render(<Harness ids={["q23"]} initial={{ q1: 3 }} />);
    const texts = new Map(
      statementsFor("q23", "H12").map((s) => [s.key, s.text]),
    );
    expect(rowNames()).toEqual(q23Order("seed-1").map((key) => texts.get(key)));
  });
});
