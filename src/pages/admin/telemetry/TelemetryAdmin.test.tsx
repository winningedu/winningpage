import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);
vi.mock("@/lib/time/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time/zone")>()),
  browserTimeZone: () => "Asia/Seoul",
}));

import { callsTo, FakeApiError, on, paramsOf, resetApi } from "./fakeApi";
import { callsBody, renderTelemetry, summaryBody } from "./testKit";

const PATH = "admin/ai-telemetry";

beforeEach(() => {
  resetApi();
  // 서울 기준 오늘은 2026-10-07 이다.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T16:00:00Z"));
  on("GET", PATH, summaryBody());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("요약 탭", () => {
  test("주소에 값이 없으면 요약 탭과 기본 기간으로 읽고 totals 를 그린다", async () => {
    renderTelemetry();
    expect(await screen.findByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("2.8%")).toBeInTheDocument();
    expect(screen.getByText("4,200")).toBeInTheDocument();
    expect(paramsOf(callsTo("GET", PATH)[0])).toEqual({
      view: "summary",
      from: "2026-09-08",
      to: "2026-10-07",
    });
  });

  test("단가가 설정되지 않았으면 안내 띠를 보여준다", async () => {
    on("GET", PATH, summaryBody(false));
    renderTelemetry();
    expect(
      await screen.findByText(
        "단가가 없어 금액은 비워 둡니다. 단가 탭에서 입력하세요.",
      ),
    ).toBeInTheDocument();
  });

  test("불러오는 중에는 status, 실패하면 서버 메시지를 alert 로 알린다", async () => {
    on("GET", PATH, () => {
      throw new FakeApiError(500, "INTERNAL_ERROR", "조회에 실패했습니다.");
    });
    renderTelemetry();
    expect(screen.getByRole("status")).toHaveTextContent(
      "데이터를 불러오는 중입니다.",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "조회에 실패했습니다.",
    );
  });

  test("값 검증 실패는 서버가 알려 준 첫 사유를 보여준다", async () => {
    on("GET", PATH, () => {
      throw new FakeApiError(
        400,
        "VALIDATION_FAILED",
        "요청 값이 올바르지 않아요.",
        [{ path: "query", message: "from 은 to 보다 뒤일 수 없습니다." }],
      );
    });
    renderTelemetry();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "from 은 to 보다 뒤일 수 없습니다.",
    );
  });
});

describe("주소와 화면 상태", () => {
  const CALLS_URL =
    "/admin/telemetry?tab=calls&from=2026-10-01&to=2026-10-05&service=growth&feature=report&status=error&retried=1&kind=embed&page=3";

  beforeEach(() => {
    on("GET", PATH, callsBody({ total: 100, page: 3 }));
  });

  test("새로고침해도 주소의 탭, 필터, 페이지로 같은 조회를 한다", async () => {
    renderTelemetry(CALLS_URL);
    await screen.findByText("100");
    expect(paramsOf(callsTo("GET", PATH)[0])).toEqual({
      view: "calls",
      from: "2026-10-01",
      to: "2026-10-05",
      service: "growth",
      feature: "report",
      status: "error",
      retried: "1",
      kind: "embed",
      page: "3",
      pageSize: "20",
    });
    expect(screen.getByRole("tab", { name: "호출 목록" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("시작일")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("서비스")).toHaveValue("growth");
    expect(screen.getByLabelText("기능")).toHaveValue("report");
    expect(screen.getByLabelText("재요청만")).toBeChecked();
  });

  test("조회를 누르면 입력값이 주소에 적용되고 1페이지로 다시 읽는다", async () => {
    const view = renderTelemetry(CALLS_URL);
    await screen.findByText("100");
    fireEvent.change(screen.getByLabelText("기능"), {
      target: { value: "chat" },
    });
    expect(view.search().feature).toBe("report");
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    await waitFor(() => expect(callsTo("GET", PATH)).toHaveLength(2));
    expect(view.search()).toMatchObject({
      tab: "calls",
      feature: "chat",
      from: "2026-10-01",
    });
    expect(view.search().page).toBeUndefined();
    expect(paramsOf(callsTo("GET", PATH)[1])).toMatchObject({
      feature: "chat",
      page: "1",
    });
  });

  test("페이지를 넘기면 주소의 page 가 바뀌고 그 쪽을 읽는다", async () => {
    const view = renderTelemetry(CALLS_URL);
    await screen.findByText("100");
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await waitFor(() => expect(callsTo("GET", PATH)).toHaveLength(2));
    expect(view.search().page).toBe("4");
    expect(paramsOf(callsTo("GET", PATH)[1]).page).toBe("4");
  });

  test("탭을 바꾸면 주소의 tab 이 바뀌고 요약은 tab 을 비운다", async () => {
    on("GET", PATH, (options: { searchParams?: unknown }) =>
      new URLSearchParams(String(options.searchParams)).get("view") === "calls"
        ? callsBody()
        : summaryBody(),
    );
    const view = renderTelemetry();
    await screen.findByText("1,234");
    fireEvent.click(screen.getByRole("tab", { name: "호출 목록" }));
    await waitFor(() => expect(view.search().tab).toBe("calls"));
    fireEvent.click(screen.getByRole("tab", { name: "요약" }));
    await waitFor(() => expect(view.search().tab).toBeUndefined());
  });

  test("모르는 tab 값과 잘못된 page 는 기본값으로 읽는다", async () => {
    on("GET", PATH, summaryBody());
    renderTelemetry("/admin/telemetry?tab=nope&page=-2");
    await screen.findByText("1,234");
    expect(paramsOf(callsTo("GET", PATH)[0]).view).toBe("summary");
  });
});

describe("단가 탭", () => {
  const TABLE = {
    "gemini-x": {
      input_usd_per_1m: 1,
      output_usd_per_1m: 2,
      cached_input_usd_per_1m: 0.5,
    },
  };

  function pricingOn(updatedAt: string | null = null) {
    on("GET", PATH, (options: { searchParams?: unknown }) =>
      new URLSearchParams(String(options.searchParams)).get("view") ===
      "pricing"
        ? { pricing: TABLE, updatedAt }
        : summaryBody(),
    );
  }

  test("저장하면 PUT 으로 보내고 저장 메시지를 보여 준다", async () => {
    pricingOn();
    on("PUT", "admin/ai-telemetry-pricing", { pricing: TABLE });
    renderTelemetry("/admin/telemetry?tab=pricing");
    await screen.findByDisplayValue("gemini-x");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("단가를 저장했습니다.")).toBeInTheDocument();
    expect(
      callsTo("PUT", "admin/ai-telemetry-pricing")[0]?.options.json,
    ).toEqual({ pricing: TABLE });
  });

  test("저장 중에는 버튼이 막히고 성공하면 단가를 다시 읽는다", async () => {
    pricingOn();
    let finish: (v: unknown) => void = () => {};
    on(
      "PUT",
      "admin/ai-telemetry-pricing",
      () => new Promise((resolve) => (finish = resolve)),
    );
    renderTelemetry("/admin/telemetry?tab=pricing");
    await screen.findByDisplayValue("gemini-x");
    expect(callsTo("GET", PATH)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(
      await screen.findByRole("button", { name: "저장 중..." }),
    ).toBeDisabled();
    finish({ pricing: TABLE });
    await screen.findByText("단가를 저장했습니다.");
    await waitFor(() => expect(callsTo("GET", PATH)).toHaveLength(2));
  });

  test("저장 실패는 서버 메시지를 alert 로 보여 준다", async () => {
    pricingOn();
    on("PUT", "admin/ai-telemetry-pricing", () => {
      throw new FakeApiError(403, "FORBIDDEN", "이 메뉴를 쓸 권한이 없습니다.");
    });
    renderTelemetry("/admin/telemetry?tab=pricing");
    await screen.findByDisplayValue("gemini-x");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이 메뉴를 쓸 권한이 없습니다.",
    );
    expect(screen.queryByText("단가를 저장했습니다.")).not.toBeInTheDocument();
  });
});
