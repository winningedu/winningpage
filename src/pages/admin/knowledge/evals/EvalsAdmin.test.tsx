import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({
  fetchRuns: vi.fn(),
  postRun: vi.fn(),
  postSweep: vi.fn(),
  listGoldenQueries: vi.fn(),
  saveGoldenQuery: vi.fn(),
  setGoldenQueryActive: vi.fn(),
  searchKnowledgeResources: vi.fn(),
  fetchResourceTitles: vi.fn(),
}));

import * as api from "./api";
import EvalsAdmin from "./EvalsAdmin";

const prod = {
  matchThreshold: 0.5,
  rrfK: 60,
  fullTextWeight: 1,
  semanticWeight: 1,
  matchCount: 12,
};

const query = {
  id: "q1",
  knowledge_type: "topic_pattern" as const,
  grade: "고2",
  subject: "물리학Ⅰ",
  career: "기계공학",
  selected_topic: "마찰력 실험",
  assessment_info: null,
  note: null,
  expected_resource_ids: ["r1", "r2"],
  is_active: true,
  created_at: "2026-10-07T00:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listGoldenQueries).mockResolvedValue({
    ok: true,
    data: [query],
  });
  vi.mocked(api.fetchResourceTitles).mockResolvedValue({
    ok: true,
    data: { r1: "자료 하나", r2: "자료 둘" },
  });
  vi.mocked(api.fetchRuns).mockResolvedValue({
    ok: true,
    data: {
      productionParams: { topic_pattern: prod, verified_resource: prod },
      items: [],
    },
  });
});

function renderAdmin() {
  return render(<EvalsAdmin config={{ title: "지식 검색 품질 평가" }} />);
}

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
    expect(api.listGoldenQueries).toHaveBeenCalledWith("topic_pattern");
  });

  test("평가 실행은 채운 칸만 덮어써서 보내고 지표와 질의별 적중을 그린다", async () => {
    vi.mocked(api.postRun).mockResolvedValue({
      ok: true,
      data: {
        runId: "run1",
        queryCount: 1,
        params: { ...prod, rrfK: 20 },
        metrics: {
          recall: { "1": 0.5, "3": 0.5, "5": 1, "10": 1 },
          mrr: 0.75,
        },
        perQuery: [
          {
            queryId: "q1",
            label: "고2 물리학Ⅰ 마찰력 실험",
            expectedIds: ["r1", "r2"],
            ranks: [1, null],
          },
        ],
      },
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "평가 실행" }));
    const rrf = await screen.findByPlaceholderText("60");
    fireEvent.change(rrf, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    await waitFor(() => expect(api.postRun).toHaveBeenCalled());
    expect(vi.mocked(api.postRun).mock.calls[0]?.[0]).toEqual({
      knowledgeType: "topic_pattern",
      mode: "hybrid",
      params: { rrfK: 20 },
    });
    expect(await screen.findByText("0.750")).toBeTruthy();
    expect(await screen.findByText("자료 하나")).toBeTruthy();
    expect(screen.getByText("미적중")).toBeTruthy();
  });

  test("조합 비교는 grid 를 보내고 MRR 내림차순으로 그리며 운영값 조합 행을 강조한다", async () => {
    const m = (mrr: number) => ({
      recall: { "1": 0, "3": 0, "5": 0, "10": 0 },
      mrr,
    });
    vi.mocked(api.postSweep).mockResolvedValue({
      ok: true,
      data: {
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
      },
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "평가 실행" }));
    fireEvent.change(await screen.findByPlaceholderText("예 20, 60"), {
      target: { value: "20, 60, 30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조합 비교 실행" }));

    await waitFor(() => expect(api.postSweep).toHaveBeenCalled());
    expect(vi.mocked(api.postSweep).mock.calls[0]?.[0]).toEqual({
      knowledgeType: "topic_pattern",
      grid: { rrfK: [20, 60, 30], weights: [], matchThreshold: [] },
    });
    const mrrCells = await screen.findAllByText(/^0\.(900|400)$/);
    expect(mrrCells.map((c) => c.textContent)).toEqual(["0.900", "0.400"]);
    expect(mrrCells[1]?.closest("tr")?.className).toContain("bg-amber-50");
    expect(mrrCells[0]?.closest("tr")?.className).not.toContain("bg-amber-50");
    expect(screen.getByText("시간 예산을 넘겨 건너뛰었습니다.")).toBeTruthy();
  });

  test("이력에서 두 실행을 고르면 앞 실행 대비 지표 차이를 보여 준다", async () => {
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
    vi.mocked(api.fetchRuns).mockResolvedValue({
      ok: true,
      data: {
        productionParams: { topic_pattern: prod, verified_resource: prod },
        items: [
          run("new", "2026-10-07T02:00:00Z", 0.75),
          run("old", "2026-10-07T01:00:00Z", 0.5),
        ],
      },
    });
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "이력" }));
    const boxes = await screen.findAllByRole("checkbox");
    expect(screen.queryByText("두 실행 비교")).toBeNull();
    fireEvent.click(boxes[0] as HTMLElement);
    fireEvent.click(boxes[1] as HTMLElement);
    expect(await screen.findByText("두 실행 비교")).toBeTruthy();
    expect(screen.getByText("+0.250")).toBeTruthy();
  });

  test("질의 추가는 기대 자료를 검색해 고른 뒤 저장한다", async () => {
    vi.mocked(api.searchKnowledgeResources).mockResolvedValue({
      ok: true,
      data: [{ id: "r9", title: "마찰 계수 측정 자료" }],
    });
    vi.mocked(api.saveGoldenQuery).mockResolvedValue({ ok: true, data: null });
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

    await waitFor(() => expect(api.saveGoldenQuery).toHaveBeenCalled());
    expect(vi.mocked(api.saveGoldenQuery).mock.calls[0]).toEqual([
      null,
      {
        knowledge_type: "topic_pattern",
        grade: "고1",
        subject: "통합과학",
        career: null,
        selected_topic: null,
        assessment_info: null,
        note: null,
        expected_resource_ids: ["r9"],
      },
    ]);
    expect(api.searchKnowledgeResources).toHaveBeenCalledWith(
      "topic_pattern",
      "마찰",
    );
  });

  test("비활성 버튼은 질의를 지우지 않고 비활성으로 바꾼다", async () => {
    vi.mocked(api.setGoldenQueryActive).mockResolvedValue({
      ok: true,
      data: null,
    });
    renderAdmin();
    await screen.findByText("마찰력 실험");
    fireEvent.click(screen.getByRole("button", { name: "비활성" }));
    await waitFor(() =>
      expect(api.setGoldenQueryActive).toHaveBeenCalledWith("q1", false),
    );
  });
});
