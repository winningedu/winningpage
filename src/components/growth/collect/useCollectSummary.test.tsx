import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { collectSummaryMock } = vi.hoisted(() => ({
  collectSummaryMock: vi.fn(),
}));
vi.mock("@/lib/growth/api", () => ({ collectSummary: collectSummaryMock }));

import { useCollectSummary } from "./useCollectSummary";

const response = (total: number) => ({
  kind: "ok" as const,
  data: {
    ok: true,
    reportId: "r1",
    summary: { bySource: { total } },
    activities: [],
  },
});

describe("useCollectSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    collectSummaryMock.mockReset();
    collectSummaryMock.mockResolvedValue(response(3));
  });
  afterEach(() => vi.useRealTimers());

  test("처음에는 기다리지 않고 바로 집계를 부른다", async () => {
    const { result } = renderHook(() =>
      useCollectSummary({ track: "고2", current: undefined, directGrades: {} }),
    );
    await act(async () => {});
    expect(collectSummaryMock).toHaveBeenCalledWith({
      track: "고2",
      directGrades: {},
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.summary).toMatchObject({ bySource: { total: 3 } });
  });

  test("트랙이나 성적이 바뀌면 500ms 디바운스 뒤 한 번만 다시 부른다", async () => {
    const { rerender } = renderHook(
      (props: { grades: Record<string, number> }) =>
        useCollectSummary({
          track: "고2",
          current: { grade: 2, semester: 1 },
          directGrades: props.grades,
        }),
      { initialProps: { grades: {} } },
    );
    await act(async () => {});
    collectSummaryMock.mockClear();

    rerender({ grades: { "고1-1": 2 } });
    rerender({ grades: { "고1-1": 2.5 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(collectSummaryMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(collectSummaryMock).toHaveBeenCalledTimes(1);
    expect(collectSummaryMock).toHaveBeenCalledWith({
      track: "고2",
      current: { grade: 2, semester: 1 },
      directGrades: { "고1-1": 2.5 },
    });
  });

  test("트랙을 아직 고르지 않았으면 부르지 않는다", async () => {
    renderHook(() =>
      useCollectSummary({ track: null, current: undefined, directGrades: {} }),
    );
    await act(async () => {});
    expect(collectSummaryMock).not.toHaveBeenCalled();
  });

  test("NO_OPEN_REPORT 는 no-report 상태가 된다", async () => {
    collectSummaryMock.mockResolvedValue({
      kind: "error",
      status: 404,
      code: "NO_OPEN_REPORT",
      message: "x",
    });
    const { result } = renderHook(() =>
      useCollectSummary({ track: "고2", current: undefined, directGrades: {} }),
    );
    await act(async () => {});
    expect(result.current.status).toBe("no-report");
  });

  test("그 밖의 실패는 서버 문구와 함께 error 상태가 되고 refresh 로 다시 부른다", async () => {
    collectSummaryMock.mockResolvedValueOnce({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "서버 문구",
    });
    const { result } = renderHook(() =>
      useCollectSummary({ track: "고2", current: undefined, directGrades: {} }),
    );
    await act(async () => {});
    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("서버 문구");

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe("ready");
  });

  test("늦게 도착한 옛 응답은 최신 응답을 덮지 못한다", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    collectSummaryMock
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(response(9));
    const { result } = renderHook(() =>
      useCollectSummary({ track: "고2", current: undefined, directGrades: {} }),
    );
    await act(async () => {});
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      resolveFirst(response(1));
    });
    expect(result.current.summary).toMatchObject({ bySource: { total: 9 } });
  });
});
