// 조회 전용 관리자는 이용권 부여와 실패 세션 복구 버튼을 보지 못한다.

import "@testing-library/jest-dom/vitest";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { on, resetApi } from "./fakeApi";
import {
  ARCHIVED_ITEM,
  archivedDetail,
  LIST_PATH,
  listBody,
  renderSelfeval,
} from "./testKit";

const DETAIL_PATH = "/admin/selfevalSessions/s-1";

beforeEach(() => {
  resetApi();
  on("GET", LIST_PATH, listBody({ items: [ARCHIVED_ITEM] }));
  on("GET", `${LIST_PATH}/s-1`, archivedDetail());
});

afterEach(cleanup);

describe("SelfevalSessionsAdmin 쓰기 버튼 노출", () => {
  test("edit 권한이면 이용권 부여 버튼이 보인다", async () => {
    renderSelfeval(undefined, true);
    expect(
      await screen.findByRole("button", { name: "이용권 부여" }),
    ).toBeInTheDocument();
  });

  test("view 권한이면 이용권 부여 버튼이 없고 목록은 보인다", async () => {
    renderSelfeval(undefined, false);
    await screen.findByText("김학생");
    expect(
      screen.queryByRole("button", { name: "이용권 부여" }),
    ).not.toBeInTheDocument();
  });

  test("edit 권한이면 상세에서 실패 세션 복구 버튼이 보인다", async () => {
    renderSelfeval(DETAIL_PATH, true);
    await screen.findByRole("dialog", { name: /김학생/ });
    expect(
      screen.getByRole("button", { name: "실패 세션 복구" }),
    ).toBeInTheDocument();
  });

  test("view 권한이면 상세에서 실패 세션 복구 버튼이 없다", async () => {
    renderSelfeval(DETAIL_PATH, false);
    await screen.findByRole("dialog", { name: /김학생/ });
    expect(
      screen.queryByRole("button", { name: "실패 세션 복구" }),
    ).not.toBeInTheDocument();
  });
});
