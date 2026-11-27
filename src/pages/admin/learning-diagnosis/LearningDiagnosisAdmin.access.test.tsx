// 학습진단 관리의 쓰기 권한. view 권한이면 추가, 저장, 삭제 버튼을 감추고 새로고침과 펼침은 남긴다.

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("@/pages/admin/shared/fakeApi")).clientMock,
);

import { resetApi } from "@/pages/admin/shared/fakeApi";
import { renderAdmin, seed } from "./testKit";

const WRITE_BUTTONS = [
  "추천 프로그램 추가",
  "질문 추가",
  "답변 추가",
  "저장",
  "질문 저장",
  "답변 저장",
  "삭제",
  "질문 삭제",
];

beforeEach(() => {
  resetApi();
  seed();
});

afterEach(cleanup);

test("view 권한이면 추가, 저장, 삭제 버튼이 없고 새로고침과 펼침은 남는다", async () => {
  renderAdmin(false);

  expect(
    await screen.findByRole("button", { name: /가장 큰 고민/ }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: /새로고침/ })).toBeVisible();
  for (const name of WRITE_BUTTONS) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
});

test("edit 권한이면 추가, 저장, 삭제 버튼이 모두 있다", async () => {
  renderAdmin(true);

  await screen.findByRole("button", { name: /가장 큰 고민/ });
  for (const name of WRITE_BUTTONS) {
    expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0);
  }
});
