// 성장 리포트 목록과 상세 라우트. 목록 조건은 주소 검색 파라미터에, 상세는 /admin/growthReports/:id 에 있다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: (await import("./fakeApi")).fakeApi,
}));

import { ApiError } from "@/lib/http/client";
import { callsTo, on, resetApi } from "./fakeApi";
import {
  detailPath,
  LIST,
  listBody,
  renderGrowth,
  reportItem,
} from "./testKit";

beforeEach(() => {
  resetApi();
  on("GET", LIST, listBody());
  on("GET", detailPath("r-1"), reportItem());
});

afterEach(cleanup);

describe("GrowthReportsAdmin 목록", () => {
  test("주소의 상태, 검색어, 페이지로 조회하고 신호를 넘긴다", async () => {
    renderGrowth("/admin/growthReports?status=completed&q=%EA%B9%80&page=2");

    await screen.findByText("kim@example.com");

    const [call] = callsTo("GET", LIST);
    expect(call?.options.searchParams).toEqual({
      status: "completed",
      q: "김",
      page: 2,
      pageSize: 20,
    });
    expect(call?.options.signal).toBeInstanceOf(AbortSignal);
    expect(screen.getByLabelText("상태")).toHaveValue("completed");
    expect(screen.getByLabelText("검색어")).toHaveValue("김");
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    renderGrowth();
    const header = await screen.findByRole("columnheader", { name: "학생" });
    expect(header).toHaveAttribute("scope", "col");
  });

  test("조회 중에는 role=status 로 알린다", () => {
    on("GET", LIST, () => new Promise(() => {}));
    renderGrowth();
    expect(screen.getByRole("status")).toHaveTextContent(
      "데이터를 불러오는 중입니다.",
    );
  });

  test("조회가 실패하면 서버 detail 을 role=alert 로 알린다", async () => {
    on("GET", LIST, () => {
      throw new ApiError({
        status: 400,
        code: "INVALID_QUERY",
        detail: "page 가 올바르지 않습니다.",
      });
    });
    renderGrowth();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "page 가 올바르지 않습니다.",
    );
    expect(screen.getByText("조회된 회차가 없습니다.")).toBeInTheDocument();
  });

  test("상태를 고르면 주소가 바뀌고 1페이지로 다시 조회한다", async () => {
    const { router } = renderGrowth("/admin/growthReports?page=3");
    await screen.findByText("kim@example.com");

    fireEvent.change(screen.getByLabelText("상태"), {
      target: { value: "archived" },
    });

    await waitFor(() =>
      expect(router.state.location.search).toBe("?status=archived"),
    );
    await waitFor(() =>
      expect(callsTo("GET", LIST).at(-1)?.options.searchParams).toEqual({
        status: "archived",
        page: 1,
        pageSize: 20,
      }),
    );
  });

  test("검색어는 조회를 눌러야 주소에 반영된다", async () => {
    const { router } = renderGrowth("/admin/growthReports?page=3");
    await screen.findByText("kim@example.com");

    fireEvent.change(screen.getByLabelText("검색어"), {
      target: { value: " 박 " },
    });
    expect(router.state.location.search).toBe("?page=3");

    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
        "박",
      ),
    );
  });

  test("알 수 없는 하위 주소는 목록으로 돌려보낸다", async () => {
    const { router } = renderGrowth("/admin/growthReports/a/b");
    await screen.findByText("kim@example.com");
    expect(router.state.location.pathname).toBe("/admin/growthReports");
  });
});

describe("GrowthReportsAdmin 상세 라우트", () => {
  test("이름 버튼을 누르면 검색 조건을 단 채 상세 주소로 가고 상세를 읽는다", async () => {
    const { router } = renderGrowth("/admin/growthReports?status=completed");

    fireEvent.click(await screen.findByRole("button", { name: "김학생" }));

    expect(
      await screen.findByRole("dialog", { name: /김학생 \(완료\)/ }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin/growthReports/r-1");
    expect(router.state.location.search).toBe("?status=completed");
    expect(callsTo("GET", detailPath("r-1"))).toHaveLength(1);
  });

  test("상세 주소로 바로 들어와도(새로고침) 상세가 열리고 목록도 그려진다", async () => {
    renderGrowth("/admin/growthReports/r-1?status=completed");

    expect(
      await screen.findByRole("dialog", { name: /김학생 \(완료\)/ }),
    ).toBeInTheDocument();
    // 목록 칸과 상세 설명에 한 번씩 나온다.
    expect(await screen.findAllByText("kim@example.com")).toHaveLength(2);
    expect(callsTo("GET", LIST)[0]?.options.searchParams).toMatchObject({
      status: "completed",
    });
  });

  test("상세를 읽는 동안은 불러오는 중으로 알린다", async () => {
    on("GET", detailPath("r-1"), () => new Promise(() => {}));
    renderGrowth("/admin/growthReports/r-1");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("데이터를 불러오는 중입니다.");
  });

  test("없는 회차는 서버 404 메시지를 보여준다", async () => {
    on("GET", detailPath("zzz"), () => {
      throw new ApiError({
        status: 404,
        code: "NOT_FOUND",
        detail: "회차를 찾을 수 없습니다.",
      });
    });
    renderGrowth("/admin/growthReports/zzz");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("회차를 찾을 수 없습니다.")).toBeVisible();
  });

  test("Esc 로 닫으면 같은 검색 조건의 목록으로 돌아간다", async () => {
    const { router } = renderGrowth(
      "/admin/growthReports/r-1?status=completed&page=2",
    );
    await screen.findByRole("dialog", { name: /김학생/ });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/growthReports"),
    );
    expect(router.state.location.search).toBe("?status=completed&page=2");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("브라우저 뒤로가기는 목록으로 돌아간다", async () => {
    const { router } = renderGrowth("/admin/growthReports?status=completed");
    fireEvent.click(await screen.findByRole("button", { name: "김학생" }));
    await screen.findByRole("dialog", { name: /김학생/ });

    await router.navigate(-1);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/admin/growthReports");
    expect(router.state.location.search).toBe("?status=completed");
  });
});
