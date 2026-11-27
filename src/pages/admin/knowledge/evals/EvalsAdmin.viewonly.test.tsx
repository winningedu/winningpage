// 조회 전용 관리자는 문제집 등록, 수정, 비활성 버튼과 평가 실행 탭을 보지 못한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import EvalsAdmin from "./EvalsAdmin";
import { on, resetApi } from "./fakeApi";
import { goldenRow, prod, renderInRouter } from "./testKit";

const RUNS = "admin/knowledge-eval";
const QUERIES = "admin/knowledge-eval/queries";
const TITLES = "admin/knowledge-items/titles";

function renderAdmin(path: string, canEdit: boolean) {
  return renderInRouter(
    <EvalsAdmin config={{ title: "지식 검색 품질 평가" }} />,
    path,
    canEdit,
  );
}

beforeEach(() => {
  resetApi();
  on("GET", RUNS, {
    productionParams: { topic_pattern: prod, verified_resource: prod },
    items: [],
  });
  on("GET", QUERIES, { items: [goldenRow] });
  on("GET", TITLES, { items: [] });
});

afterEach(cleanup);

describe("EvalsAdmin 쓰기 버튼 노출", () => {
  test("edit 권한이면 문제집에 추가, 편집, 비활성 버튼과 평가 실행 탭이 보인다", async () => {
    renderAdmin("/evals", true);
    expect(
      await screen.findByRole("button", { name: "질의 추가" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "편집" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비활성" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "평가 실행" })).toBeInTheDocument();
  });

  test("view 권한이면 문제집은 보이고 추가, 편집, 비활성 버튼이 없다", async () => {
    renderAdmin("/evals", false);
    await screen.findByText("마찰력 실험");
    expect(screen.queryByRole("button", { name: "질의 추가" })).toBeNull();
    expect(screen.queryByRole("button", { name: "편집" })).toBeNull();
    expect(screen.queryByRole("button", { name: "비활성" })).toBeNull();
  });

  test("view 권한이면 평가 실행 탭이 없다", async () => {
    renderAdmin("/evals", false);
    await screen.findByText("마찰력 실험");
    expect(screen.queryByRole("tab", { name: "평가 실행" })).toBeNull();
    expect(screen.getByRole("tab", { name: "이력" })).toBeInTheDocument();
  });

  test("view 권한에서 주소로 평가 실행 탭을 열어도 실행 버튼이 없다", async () => {
    renderAdmin("/evals?tab=run", false);
    await screen.findByText("마찰력 실험");
    expect(screen.queryByRole("button", { name: "실행" })).toBeNull();
    expect(screen.queryByRole("button", { name: "조합 비교 실행" })).toBeNull();
  });
});
