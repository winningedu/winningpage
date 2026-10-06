import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { StepProgress } from "@/lib/growth/api";
import { useReportGeneration } from "./useReportGeneration";

function progressOf(done: number): StepProgress[] {
  return Array.from({ length: 8 }, (_, i) => ({
    step: i + 1,
    label: "",
    status: i < done ? "done" : "pending",
    attempts: 0,
  }));
}

describe("useReportGeneration", () => {
  test("마운트하면 자동으로 시작해 8단계를 끝내고 done 이 된다", async () => {
    const runStep = vi.fn(async ({ step }: { step: number }) => ({
      kind: "ok" as const,
      data: {
        ok: true as const,
        reportId: "r1",
        step,
        result: "ok" as const,
        attempts: 1,
        nextStep: step < 8 ? step + 1 : null,
        progress: progressOf(step),
      },
    }));
    const { result } = renderHook(() =>
      useReportGeneration({
        reportId: "r1",
        initialProgress: progressOf(0),
        runStep,
        fetchOpen: vi.fn(),
        sleep: async () => {},
      }),
    );

    await waitFor(() => expect(result.current.state.phase).toBe("done"));
    expect(runStep).toHaveBeenCalledTimes(8);
  });

  test("탭이 다시 보이면 실행 중이 아닐 때 서버 진행으로 동기화한다", async () => {
    const runStep = vi.fn(async () => ({
      kind: "error" as const,
      status: 502,
      code: "MODEL_UPSTREAM_FAILED",
      message: "x",
    }));
    const fetchOpen = vi.fn(async () => ({
      kind: "ok" as const,
      data: {
        ok: true as const,
        items: [],
        archivedCount: 0,
        lastTerminal: null,
        open: {
          id: "r1",
          status: "in_progress" as const,
          currentStep: 2,
          track: null,
          progress: progressOf(2),
          nextStep: 3,
          terminal: null,
          lastActivityAt: "t",
        },
      },
    }));
    const { result } = renderHook(() =>
      useReportGeneration({
        reportId: "r1",
        initialProgress: progressOf(0),
        runStep,
        fetchOpen,
        sleep: async () => {},
      }),
    );
    await waitFor(() => expect(result.current.state.phase).toBe("failed"));

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(result.current.state.currentStep).toBe(3));
    expect(fetchOpen).toHaveBeenCalledTimes(1);
  });
});
