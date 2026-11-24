import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import EvalsAdmin from "./EvalsAdmin";
import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { goldenRow, prod, renderInRouter } from "./testKit";

const RUNS = "admin/knowledge-eval";
const QUERIES = "admin/knowledge-eval/queries";
const TITLES = "admin/knowledge-items/titles";

const runsBody = (items: unknown[] = []) => ({
  productionParams: { topic_pattern: prod, verified_resource: prod },
  items,
});

beforeEach(() => {
  resetApi();
  on("GET", RUNS, runsBody());
  on("GET", QUERIES, { items: [goldenRow] });
  on(
    "GET",
    TITLES,
    ({ searchParams }: { searchParams?: Record<string, string> }) => ({
      items: searchParams?.ids
        ? [
            { id: "r1", title: "자료 하나" },
            { id: "r2", title: "자료 둘" },
          ]
        : [],
    }),
  );
});

function expectScopedHeaders() {
  const headers = screen.getAllByRole("columnheader");
  expect(headers.length).toBeGreaterThan(0);
  for (const header of headers) {
    expect(header.getAttribute("scope")).toBe("col");
  }
}

function renderAdmin(path = "/evals") {
  return renderInRouter(
    <EvalsAdmin config={{ title: "지식 검색 품질 평가" }} />,
    path,
  );
}

const run = (id: string, created_at: string, mrr: number) => ({
  id,
  created_at,
  knowledge_type: "topic_pattern" as const,
  mode: "hybrid" as const,
  params: prod,
  query_count: 3,
  metrics: { recall: { "1": 0.5 }, mrr },
  per_query: [],
  note: null,
});

describe("EvalsAdmin", () => {
  test("안내 문구와 기준 문제집 질의 목록을 그린다", async () => {
    renderAdmin();
    expect(
      screen.getByText(
        "문제집은 30문항부터 시작하고, 운영 검색 설정 변경은 이 결과를 근거로 별도로 결정합니다.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("마찰력 실험")).toBeTruthy();
    expect(screen.getByText("기계공학")).toBeTruthy();
    expect(callsTo("GET", QUERIES)[0]?.options.searchParams).toEqual({
      knowledgeType: "topic_pattern",
    });
    expect(callsTo("GET", QUERIES)[0]?.options.signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  test("기대 자료 제목은 titles 라우트로 읽어 셀 title 에 붙인다", async () => {
    renderAdmin();
    await screen.findByText("마찰력 실험");
    await waitFor(() =>
      expect(screen.getByText("2").closest("td")?.getAttribute("title")).toBe(
        "자료 하나\n자료 둘",
      ),
    );
    expect(callsTo("GET", TITLES)[0]?.options.searchParams).toEqual({
      ids: "r1,r2",
    });
  });

  test("평가 실행은 채운 칸만 덮어써서 보내고 지표와 질의별 적중을 그린다", async () => {
    on("POST", RUNS, {
      runId: "run1",
      queryCount: 1,
      params: { ...prod, rrfK: 20 },
      metrics: { recall: { "1": 0.5, "3": 0.5, "5": 1, "10": 1 }, mrr: 0.75 },
      perQuery: [
        {
          queryId: "q1",
          label: "고2 물리학Ⅰ 마찰력 실험",
          expectedIds: ["r1", "r2"],
          ranks: [1, null],
        },
      ],
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "평가 실행" }));
    const rrf = await screen.findByPlaceholderText("60");
    fireEvent.change(rrf, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    await waitFor(() => expect(callsTo("POST", RUNS)).toHaveLength(1));
    const call = callsTo("POST", RUNS)[0];
    expect(call?.options.json).toEqual({
      action: "run",
      knowledgeType: "topic_pattern",
      mode: "hybrid",
      params: { rrfK: 20 },
    });
    expect(call?.options.timeout).toBe(65_000);
    expect(await screen.findByText("0.750")).toBeTruthy();
    expect(await screen.findByText("자료 하나")).toBeTruthy();
    expect(screen.getByText("미적중")).toBeTruthy();
    // 저장된 이력이 늘었으니 이력을 다시 읽는다.
    await waitFor(() => expect(callsTo("GET", RUNS).length).toBeGreaterThan(1));
  });

  test("실행 중에는 버튼이 비활성이고 같은 요청을 한 번만 보낸다", async () => {
    let finish: (value: unknown) => void = () => {};
    on(
      "POST",
      RUNS,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "평가 실행" }));
    const button = await screen.findByRole("button", { name: "실행" });
    fireEvent.click(button);
    const busy = await screen.findByRole("button", { name: "실행 중" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(callsTo("POST", RUNS)).toHaveLength(1);
    finish({
      runId: "r",
      queryCount: 0,
      params: prod,
      metrics: { recall: {}, mrr: 0 },
      perQuery: [],
    });
    await screen.findByRole("button", { name: "실행" });
  });

  test("평가 실행 실패는 서버가 준 문구를 오류 상자에 보여 준다", async () => {
    on("POST", RUNS, () => {
      throw new FakeApiError(
        422,
        "NO_QUERIES",
        "활성 질의가 없습니다. 기준 문제집에 질의를 먼저 추가하세요.",
      );
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "평가 실행" }));
    fireEvent.click(await screen.findByRole("button", { name: "실행" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "활성 질의가 없습니다.",
    );
  });

  test("조합 비교는 grid 를 보내고 MRR 내림차순으로 그리며 운영값 조합 행을 강조한다", async () => {
    const m = (mrr: number) => ({
      recall: { "1": 0, "3": 0, "5": 0, "10": 0 },
      mrr,
    });
    on("POST", RUNS, {
      queryCount: 3,
      productionParams: prod,
      items: [
        { status: "done", runId: "a", params: prod, metrics: m(0.4) },
        {
          status: "done",
          runId: "b",
          params: { ...prod, rrfK: 20 },
          metrics: m(0.9),
        },
        { status: "skipped", params: { ...prod, rrfK: 30 } },
      ],
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "평가 실행" }));
    fireEvent.change(await screen.findByPlaceholderText("예 20, 60"), {
      target: { value: "20, 60, 30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조합 비교 실행" }));

    await waitFor(() => expect(callsTo("POST", RUNS)).toHaveLength(1));
    const call = callsTo("POST", RUNS)[0];
    expect(call?.options.json).toEqual({
      action: "sweep",
      knowledgeType: "topic_pattern",
      grid: { rrfK: [20, 60, 30], weights: [], matchThreshold: [] },
    });
    expect(call?.options.timeout).toBe(65_000);
    const mrrCells = await screen.findAllByText(/^0\.(900|400)$/);
    expect(mrrCells.map((c) => c.textContent)).toEqual(["0.900", "0.400"]);
    expect(mrrCells[1]?.closest("tr")?.className).toContain("bg-amber-50");
    expect(mrrCells[0]?.closest("tr")?.className).not.toContain("bg-amber-50");
    expect(screen.getByText("시간 예산을 넘겨 건너뛰었습니다.")).toBeTruthy();
  });

  test("이력에서 두 실행을 고르면 앞 실행 대비 지표 차이를 보여 준다", async () => {
    on(
      "GET",
      RUNS,
      runsBody([
        run("new", "2026-10-07T02:00:00Z", 0.75),
        run("old", "2026-10-07T01:00:00Z", 0.5),
      ]),
    );
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "이력" }));
    const boxes = await screen.findAllByRole("checkbox");
    expect(screen.queryByText("두 실행 비교")).toBeNull();
    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[1] as HTMLElement);
    expect(await screen.findByText("두 실행 비교")).toBeTruthy();
    expect(screen.getByText("+0.250")).toBeTruthy();
  });

  test("질의 추가는 기대 자료를 검색해 고른 뒤 저장하고 목록을 다시 읽는다", async () => {
    const uuid = "7f3c2a10-5b1e-4c55-9a52-0f6d1f8f9b11";
    on(
      "GET",
      TITLES,
      ({ searchParams }: { searchParams?: Record<string, string> }) => ({
        items: searchParams?.q
          ? [{ id: uuid, title: "마찰 계수 측정 자료" }]
          : searchParams?.ids
            ? [
                { id: "r1", title: "자료 하나" },
                { id: "r2", title: "자료 둘" },
              ]
            : [],
      }),
    );
    on("POST", QUERIES, { ...goldenRow, id: "q2" });
    renderAdmin();
    await screen.findByText("마찰력 실험");
    fireEvent.click(screen.getByRole("button", { name: "질의 추가" }));
    fireEvent.change(await screen.findByPlaceholderText("고2"), {
      target: { value: "고1" },
    });
    const [subject] = screen.getAllByRole("textbox").slice(1, 2);
    fireEvent.change(subject as HTMLElement, { target: { value: "통합과학" } });
    fireEvent.change(screen.getByPlaceholderText("자료 제목 검색"), {
      target: { value: "마찰" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: "추가" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(callsTo("POST", QUERIES)).toHaveLength(1));
    expect(callsTo("POST", QUERIES)[0]?.options.json).toEqual({
      knowledge_type: "topic_pattern",
      grade: "고1",
      subject: "통합과학",
      career: null,
      selected_topic: null,
      assessment_info: null,
      note: null,
      expected_resource_ids: [uuid],
    });
    const search = callsTo("GET", TITLES).find(
      (c) => c.options.searchParams?.q,
    );
    expect(search?.options.searchParams).toEqual({
      knowledgeType: "topic_pattern",
      q: "마찰",
    });
    await waitFor(() =>
      expect(callsTo("GET", QUERIES).length).toBeGreaterThan(1),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("질의 편집은 knowledge_type 없이 PATCH 하고 유형은 쿼리로 보낸다", async () => {
    on("PATCH", `${QUERIES}/q1`, goldenRow);
    renderAdmin();
    await screen.findByText("마찰력 실험");
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    fireEvent.click(await screen.findByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(callsTo("PATCH", `${QUERIES}/q1`)).toHaveLength(1),
    );
    const call = callsTo("PATCH", `${QUERIES}/q1`)[0];
    expect(call?.options.searchParams).toEqual({
      knowledgeType: "topic_pattern",
    });
    expect(call?.options.json).toEqual({
      grade: "고2",
      subject: "물리학Ⅰ",
      career: "기계공학",
      selected_topic: "마찰력 실험",
      assessment_info: null,
      note: null,
      expected_resource_ids: ["r1", "r2"],
    });
  });

  test("질의 저장 실패는 질의 저장에 실패했습니다 로 알린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    on("PATCH", `${QUERIES}/q1`, () => {
      throw new FakeApiError(500, "INTERNAL_ERROR", "서버 내부 문구");
    });
    renderAdmin();
    await screen.findByText("마찰력 실험");
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    fireEvent.click(await screen.findByRole("button", { name: "저장" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent).join()).toContain(
      "질의 저장에 실패했습니다.",
    );
  });

  test("비활성 버튼은 질의를 지우지 않고 is_active 만 바꾸고 목록을 다시 읽는다", async () => {
    on("PATCH", `${QUERIES}/q1`, { ...goldenRow, is_active: false });
    renderAdmin();
    await screen.findByText("마찰력 실험");
    fireEvent.click(screen.getByRole("button", { name: "비활성" }));
    await waitFor(() =>
      expect(callsTo("PATCH", `${QUERIES}/q1`)).toHaveLength(1),
    );
    const call = callsTo("PATCH", `${QUERIES}/q1`)[0];
    expect(call?.options.json).toEqual({ is_active: false });
    expect(call?.options.searchParams).toEqual({
      knowledgeType: "topic_pattern",
    });
    await waitFor(() =>
      expect(callsTo("GET", QUERIES).length).toBeGreaterThan(1),
    );
  });

  test("비활성 처리 중에는 토글 버튼이 비활성이다", async () => {
    let finish: (value: unknown) => void = () => {};
    on(
      "PATCH",
      `${QUERIES}/q1`,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderAdmin();
    await screen.findByText("마찰력 실험");
    const button = screen.getByRole("button", { name: "비활성" });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    finish({ ...goldenRow, is_active: false });
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  test("비활성 처리 실패는 질의 상태 변경에 실패했습니다 로 알린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    on("PATCH", `${QUERIES}/q1`, () => {
      throw new FakeApiError(404, "NOT_FOUND", "질의를 찾지 못했어요.");
    });
    renderAdmin();
    await screen.findByText("마찰력 실험");
    fireEvent.click(screen.getByRole("button", { name: "비활성" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "질의 상태 변경에 실패했습니다.",
    );
  });

  test("목록을 못 읽으면 문제집 조회에 실패했습니다 로 알린다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    on("GET", QUERIES, () => {
      throw new FakeApiError(500, "INTERNAL_ERROR", "서버 내부 문구");
    });
    renderAdmin();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "문제집 조회에 실패했습니다.",
    );
  });

  test("탭은 role tab 이고 고른 탭만 aria-selected 가 된다", async () => {
    renderAdmin();
    await screen.findByText("마찰력 실험");
    expect(screen.getByRole("tab", { name: "기준 문제집" }).ariaSelected).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "이력" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "이력" }).ariaSelected).toBe(
        "true",
      ),
    );
    expect(screen.getByRole("tab", { name: "기준 문제집" }).ariaSelected).toBe(
      "false",
    );
  });

  test("이력을 불러오지 못하면 서버 문구를 오류 상자가 alert 로 알린다", async () => {
    on("GET", RUNS, () => {
      throw new FakeApiError(
        500,
        "INTERNAL_ERROR",
        "이력을 불러오지 못했습니다.",
      );
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "이력" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "이력을 불러오지 못했습니다.",
    );
  });

  test("기준 문제집 표의 열 머리글은 scope col 이다", async () => {
    renderAdmin();
    await screen.findByText("마찰력 실험");
    expectScopedHeaders();
  });

  test("평가 실행 결과 표와 조합 비교 표의 열 머리글은 scope col 이다", async () => {
    const m = { recall: { "1": 1, "3": 1, "5": 1, "10": 1 }, mrr: 1 };
    on("POST", RUNS, ({ json }: { json?: { action?: string } }) =>
      json?.action === "sweep"
        ? {
            queryCount: 1,
            productionParams: prod,
            items: [{ status: "done", runId: "a", params: prod, metrics: m }],
          }
        : {
            runId: "run1",
            queryCount: 1,
            params: prod,
            metrics: m,
            perQuery: [
              {
                queryId: "q1",
                label: "질의",
                expectedIds: ["r1"],
                ranks: [1],
              },
            ],
          },
    );
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "평가 실행" }));
    fireEvent.click(await screen.findByRole("button", { name: "실행" }));
    await screen.findByText("적중");
    fireEvent.click(screen.getByRole("button", { name: "조합 비교 실행" }));
    await screen.findByText(/굵은 행이 운영값 조합입니다/);
    expect(screen.getAllByRole("table").length).toBe(2);
    expectScopedHeaders();
  });

  test("이력 표와 비교 표의 열 머리글은 scope col 이다", async () => {
    on(
      "GET",
      RUNS,
      runsBody([
        run("new", "2026-10-07T02:00:00Z", 0.5),
        run("old", "2026-10-07T01:00:00Z", 0.5),
      ]),
    );
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "이력" }));
    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[1] as HTMLElement);
    await screen.findByText("두 실행 비교");
    expect(screen.getAllByRole("table").length).toBe(2);
    expectScopedHeaders();
  });

  test("평가 실행 지표 타일 5개는 작은 Card 로 그린다", async () => {
    on("POST", RUNS, {
      runId: "run1",
      queryCount: 1,
      params: prod,
      metrics: { recall: { "1": 1, "3": 1, "5": 1, "10": 1 }, mrr: 1 },
      perQuery: [],
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("tab", { name: "평가 실행" }));
    fireEvent.click(await screen.findByRole("button", { name: "실행" }));
    await screen.findByText("recall@10");
    expect(
      document.querySelectorAll('[data-slot="card"][data-size="sm"]').length,
    ).toBe(5);
  });
});

describe("EvalsAdmin 응답 전 대기", () => {
  test("문제집 응답 전에는 스켈레톤만 보이고 활성 문항 수와 표는 없다", async () => {
    on("GET", QUERIES, () => new Promise(() => {}));
    renderAdmin();
    expect(
      await screen.findByRole("status", { name: "문제집을 불러오는 중" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((_, el) => el?.textContent === "활성 0문항"),
    ).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("실행 탭은 이력 응답 전에 스켈레톤을 보이고 실행 폼은 아직 없다", async () => {
    on("GET", RUNS, () => new Promise(() => {}));
    renderAdmin("/evals?tab=run");
    expect(
      await screen.findByRole("status", { name: "평가 설정을 불러오는 중" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실행" })).toBeNull();
  });

  test("이력 탭은 이력 응답 전에 스켈레톤을 보이고 표는 아직 없다", async () => {
    on("GET", RUNS, () => new Promise(() => {}));
    renderAdmin("/evals?tab=history");
    expect(
      await screen.findByRole("status", { name: "실행 이력을 불러오는 중" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("EvalsAdmin 주소의 탭과 지식 유형", () => {
  test("처음 그릴 때 주소의 tab 과 type 을 읽는다", async () => {
    renderAdmin("/evals?tab=run&type=verified_resource");
    expect(
      (await screen.findByRole("tab", { name: "평가 실행" })).ariaSelected,
    ).toBe("true");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "verified_resource",
    );
    await waitFor(() =>
      expect(callsTo("GET", RUNS)[0]?.options.searchParams).toEqual({
        view: "runs",
        knowledgeType: "verified_resource",
      }),
    );
    expect(callsTo("GET", QUERIES)).toHaveLength(0);
  });

  test("tab 과 type 이 없거나 올바르지 않으면 기준 문제집, 수행 주제다", async () => {
    renderAdmin("/evals?tab=nope&type=nope");
    expect(
      (await screen.findByRole("tab", { name: "기준 문제집" })).ariaSelected,
    ).toBe("true");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "topic_pattern",
    );
    await waitFor(() =>
      expect(callsTo("GET", QUERIES)[0]?.options.searchParams).toEqual({
        knowledgeType: "topic_pattern",
      }),
    );
  });

  test("탭을 누르면 주소의 tab 이 바뀌고 type 은 그대로다", async () => {
    const { router } = renderAdmin("/evals?type=verified_resource");
    fireEvent.click(await screen.findByRole("tab", { name: "이력" }));
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("tab")).toBe(
        "history",
      ),
    );
    expect(new URLSearchParams(router.state.location.search).get("type")).toBe(
      "verified_resource",
    );
  });

  test("지식 유형을 바꾸면 주소의 type 이 바뀌고 그 유형으로 다시 읽는다", async () => {
    const { router } = renderAdmin("/evals?tab=run");
    fireEvent.change(await screen.findByRole("combobox"), {
      target: { value: "verified_resource" },
    });
    await waitFor(() =>
      expect(
        new URLSearchParams(router.state.location.search).get("type"),
      ).toBe("verified_resource"),
    );
    expect(new URLSearchParams(router.state.location.search).get("tab")).toBe(
      "run",
    );
    await waitFor(() =>
      expect(
        callsTo("GET", RUNS).some(
          (c) => c.options.searchParams?.knowledgeType === "verified_resource",
        ),
      ).toBe(true),
    );
  });
});
