// 조회 전용 관리자는 이용권 부여와 실패 회차 복구 버튼을 보지 못한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: (await import("./fakeApi")).fakeApi,
}));

import { on, resetApi } from "./fakeApi";
import {
  archivedItem,
  detailPath,
  LIST,
  listBody,
  renderGrowth,
} from "./testKit";

const DETAIL_PATH = "/admin/growthReports/r-1?status=archived";

beforeEach(() => {
  resetApi();
  on("GET", LIST, listBody([archivedItem]));
  on("GET", detailPath("r-1"), archivedItem);
});

afterEach(cleanup);

describe("GrowthReportsAdmin 쓰기 버튼 노출", () => {
  test("edit 권한이면 이용권 부여 버튼이 보인다", async () => {
    renderGrowth(undefined, true);
    expect(
      await screen.findByRole("button", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("view 권한이면 이용권 부여 버튼이 없고 목록은 보인다", async () => {
    renderGrowth(undefined, false);
    await screen.findByText("김학생");
    expect(
      screen.queryByRole("button", { name: "이용권 부여" }),
    ).not.toBeInTheDocument();
  });

  test("edit 권한이면 상세에서 실패 회차 복구 버튼이 보인다", async () => {
    renderGrowth(DETAIL_PATH, true);
    await screen.findByRole("dialog", { name: /김학생/ });
    expect(
      screen.getByRole("button", { name: "실패 회차 복구" }),
    ).toBeInTheDocument();
  });

  test("view 권한이면 상세에서 실패 회차 복구 버튼이 없다", async () => {
    renderGrowth(DETAIL_PATH, false);
    await screen.findByRole("dialog", { name: /김학생/ });
    expect(
      screen.queryByRole("button", { name: "실패 회차 복구" }),
    ).not.toBeInTheDocument();
  });
});
