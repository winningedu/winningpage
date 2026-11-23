import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SURVEY_V3_QUESTIONS } from "@/data/diagnosisSurveyV3";
import SurveyStepPage from "./SurveyStepPage";

afterEach(cleanup);
beforeEach(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const titleOf = (id: string) =>
  SURVEY_V3_QUESTIONS.find((q) => q.id === id)?.title ?? "";

function Shell({
  initial,
  submit,
}: {
  initial: Record<string, unknown>;
  submit: () => Promise<unknown>;
}) {
  const [answers, setAnswers] = useState(initial);
  return (
    <Outlet
      context={{
        answers,
        setAnswer: (id: string, value: unknown) =>
          setAnswers((prev) => ({ ...prev, [id]: value })),
        submitDiagnosis: submit,
        cascadeLevels: [],
        diagnosedAt: "2026-11-09",
        seed: "s",
      }}
    />
  );
}

function renderStep(
  step: string,
  initial: Record<string, unknown> = {},
  submit: () => Promise<unknown> = async () => null,
) {
  return render(
    <MemoryRouter initialEntries={[`/app/learning-diagnosis/survey/${step}`]}>
      <Routes>
        <Route
          path="/app/learning-diagnosis/survey"
          element={<Shell initial={initial} submit={submit} />}
        >
          <Route path=":step" element={<SurveyStepPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("SurveyStepPage v3", () => {
  it("화면 1은 1~3번 문항을 13번 시트 순서로 보인다", () => {
    renderStep("1");
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      titleOf("q1"),
      titleOf("q2"),
      titleOf("q3"),
      titleOf("q3r"),
    ]);
  });

  it("필수 문항이 비면 다음 화면으로 넘어가지 않는다", () => {
    renderStep("1", { q1: 3 });
    fireEvent.click(
      screen.getByRole("button", { name: "모든 항목에 응답해주세요" }),
    );
    expect(
      screen.getByRole("heading", { name: titleOf("q1") }),
    ).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("미응답 버튼을 누를 때마다 이동한 문항 번호를 화면 낭독기에 다시 알린다", () => {
    renderStep("1", { q1: 3 });
    const cta = screen.getByRole("button", {
      name: "모든 항목에 응답해주세요",
    });
    const status = () => screen.getByRole("status").textContent ?? "";
    fireEvent.click(cta);
    const first = status();
    // 기능요구명세서 B: q2 is screen number 2
    expect(first).toContain("2번");
    fireEvent.click(cta);
    expect(status()).toContain("2번");
    expect(status()).not.toBe(first);
  });

  it("필수 문항을 다 답하면 남은 문항 수를 보이고 다음 화면으로 간다", () => {
    renderStep("1", { q1: 3, q2: 1, q3: 6 });
    // 화면 2~6 본 문항 중 보이는 것: 4, 5, 6, 7 / 8, 9, 10 / 11~15 / 16 / 20, 21
    fireEvent.click(
      screen.getByRole("button", { name: "15개 문항이 남았어요" }),
    );
    expect(
      screen.getByRole("heading", { name: titleOf("q4") }),
    ).toBeInTheDocument();
  });

  it("마지막 화면은 진단 결과 보기로 제출한다", async () => {
    const submit = vi.fn(async () => null);
    renderStep(
      "6",
      {
        q1: 3,
        q23: Object.fromEntries([
          ...Array.from({ length: 35 }, (_, i) => [String(i + 1), 2]),
          ["V", 3],
        ]),
      },
      submit,
    );
    fireEvent.click(screen.getByRole("button", { name: "진단 결과 보기" }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
  });

  it("제출하는 동안 버튼은 진행 중 문구로 바뀌고 눌리지 않는다", async () => {
    let finish: (value: unknown) => void = () => undefined;
    const submit = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderStep(
      "6",
      {
        q1: 3,
        q23: Object.fromEntries([
          ...Array.from({ length: 35 }, (_, i) => [String(i + 1), 2]),
          ["V", 3],
        ]),
      },
      submit,
    );
    fireEvent.click(screen.getByRole("button", { name: "진단 결과 보기" }));
    const busy = await screen.findByRole("button", {
      name: "진단 결과를 만드는 중…",
    });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    finish(null);
    expect(
      await screen.findByRole("button", { name: "진단 결과 보기" }),
    ).toBeEnabled();
  });

  it("없는 화면 번호는 1번 화면으로 보낸다", () => {
    renderStep("7");
    expect(
      screen.getByRole("heading", { name: titleOf("q1") }),
    ).toBeInTheDocument();
  });
});
