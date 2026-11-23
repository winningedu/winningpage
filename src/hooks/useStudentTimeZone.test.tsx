import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStudentTimeZone } from "./useStudentTimeZone";

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));

const api = vi.hoisted(() => ({ fetchGoalStudent: vi.fn() }));
vi.mock("@/lib/goalApi", () => api);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useStudentTimeZone", () => {
  beforeEach(() => api.fetchGoalStudent.mockReset());

  it("온보딩 끝난 학생 응답의 timeZone을 돌려준다", async () => {
    api.fetchGoalStudent.mockResolvedValue({
      kind: "onboarded",
      student: { timeZone: "America/Los_Angeles" },
    });
    const { result } = renderHook(() => useStudentTimeZone(), { wrapper });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe("America/Los_Angeles"));
  });

  it("학생 응답이 온보딩 전이면 undefined다(대체 시간대 없음)", async () => {
    api.fetchGoalStudent.mockResolvedValue({ kind: "not-onboarded" });
    const { result } = renderHook(() => useStudentTimeZone(), { wrapper });
    await waitFor(() => expect(api.fetchGoalStudent).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });
});
