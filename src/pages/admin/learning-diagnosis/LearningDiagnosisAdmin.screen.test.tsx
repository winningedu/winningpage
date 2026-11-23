// 학습진단 관리의 접근성. 추천 프로그램 체크박스 묶음과 질문 펼침 버튼을 검증한다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const DATA: Record<string, unknown[]> = {
  learning_diagnosis_questions: [
    {
      id: "q1",
      title: "가장 큰 고민",
      description: "",
      input_type: "single",
      is_required: true,
      is_active: true,
      sort_order: 1,
    },
  ],
  learning_diagnosis_options: [
    {
      id: "o1",
      question_id: "q1",
      label: "수행평가",
      program_ids: ["p1"],
      is_active: true,
      sort_order: 1,
    },
  ],
  learning_diagnosis_programs: [
    { id: "p1", title: "수행평가 서비스", sort_order: 1 },
    { id: "p2", title: "목표관리 서비스", sort_order: 2 },
  ],
};

function chain(table: string) {
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: DATA[table] ?? [], error: null });
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => chain(table) },
}));

import LearningDiagnosisAdmin from "./LearningDiagnosisAdmin";

afterEach(cleanup);

test("답변별 추천 프로그램은 이름 있는 묶음 안에서 라벨로 찾을 수 있다", async () => {
  render(<LearningDiagnosisAdmin />);

  const group = await screen.findByRole("group", {
    name: "이 답변 선택 시 노출할 추천 프로그램",
  });
  const picked = within(group).getByLabelText("수행평가 서비스");
  const other = within(group).getByLabelText("목표관리 서비스");
  expect(picked).toBeChecked();
  expect(other).not.toBeChecked();

  fireEvent.click(other);
  expect(other).toBeChecked();
});

test("질문 머리글 버튼은 펼침 상태를 알린다", async () => {
  render(<LearningDiagnosisAdmin />);

  const header = await screen.findByRole("button", { name: /가장 큰 고민/ });
  expect(header).toHaveAttribute("aria-expanded", "true");

  fireEvent.click(header);
  expect(header).toHaveAttribute("aria-expanded", "false");
});

test("불러오는 동안 상태 안내가 role=status 로 보인다", () => {
  render(<LearningDiagnosisAdmin />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "학습진단 데이터를 불러오는 중입니다.",
  );
});
