// 학습진단 관리의 접근성. 추천 프로그램 체크박스 묶음과 질문 펼침 버튼을 검증한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("@/pages/admin/shared/fakeApi")).clientMock,
);

import { resetApi } from "@/pages/admin/shared/fakeApi";
import { program, renderAdmin, seed } from "./testKit";

beforeEach(() => {
  resetApi();
  seed({
    programs: [
      program,
      { ...program, id: "p2", title: "목표관리 서비스", sort_order: 2 },
    ],
  });
});

afterEach(cleanup);

test("답변별 추천 프로그램은 이름 있는 묶음 안에서 라벨로 찾을 수 있다", async () => {
  renderAdmin();

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
  renderAdmin();

  const header = await screen.findByRole("button", { name: /가장 큰 고민/ });
  expect(header).toHaveAttribute("aria-expanded", "true");

  fireEvent.click(header);
  expect(header).toHaveAttribute("aria-expanded", "false");
});

test("불러오는 동안 상태 안내가 role=status 로 보인다", () => {
  renderAdmin();

  expect(screen.getByRole("status")).toHaveTextContent(
    "학습진단 데이터를 불러오는 중입니다.",
  );
});
