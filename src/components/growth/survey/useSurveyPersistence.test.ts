import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { saveSurveyMock } = vi.hoisted(() => ({ saveSurveyMock: vi.fn() }));
vi.mock("@/lib/growth/api", () => ({ saveSurvey: saveSurveyMock }));

import { useSurveyPersistence } from "./useSurveyPersistence";

const ok = (reportId: string) => ({
  kind: "ok" as const,
  data: { ok: true, reportId, answered: 1, total: 24, savedAt: "" },
});

function setup(initial: Record<string, unknown>, reportId: string | undefined) {
  return renderHook(
    ({ answers }) =>
      useSurveyPersistence({
        answers: answers as never,
        savedAnswers: {},
        reportId,
        enabled: true,
      }),
    { initialProps: { answers: initial } },
  );
}

describe("useSurveyPersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveSurveyMock.mockReset();
  });

  test("바뀐 키만 모아 1.5초 뒤 한 번 저장한다", async () => {
    saveSurveyMock.mockResolvedValue(ok("r1"));
    const { rerender } = setup({}, "r0");
    rerender({ answers: { q1: "책 읽음" } });
    rerender({ answers: { q1: "책 읽음", q5: "정해짐" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(saveSurveyMock).toHaveBeenCalledTimes(1);
    expect(saveSurveyMock).toHaveBeenCalledWith({
      reportId: "r0",
      answers: { q1: "책 읽음", q5: "정해짐" },
    });
  });

  test("첫 저장 응답의 reportId 를 다음 저장에 쓴다", async () => {
    saveSurveyMock.mockResolvedValue(ok("r-new"));
    const { rerender, result } = setup({}, undefined);
    rerender({ answers: { q1: "a" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(saveSurveyMock.mock.calls[0]?.[0]).toEqual({ answers: { q1: "a" } });
    rerender({ answers: { q1: "ab" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(saveSurveyMock.mock.calls[1]?.[0]).toEqual({
      reportId: "r-new",
      answers: { q1: "ab" },
    });
    expect(result.current.saveState.phase).toBe("saved");
  });

  test("비운 문항은 null 로 보낸다", async () => {
    saveSurveyMock.mockResolvedValue(ok("r1"));
    const { rerender } = renderHook(
      ({ answers }) =>
        useSurveyPersistence({
          answers: answers as never,
          savedAnswers: { q1: "a" },
          reportId: "r1",
          enabled: true,
        }),
      { initialProps: { answers: { q1: "a" } as Record<string, unknown> } },
    );
    rerender({ answers: { q1: null } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(saveSurveyMock).toHaveBeenCalledWith({
      reportId: "r1",
      answers: { q1: null },
    });
  });

  test("409 REPORT_LOCKED 이면 잠금 상태가 되고 더는 저장하지 않는다", async () => {
    saveSurveyMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "REPORT_LOCKED",
      message: "",
    });
    const { rerender, result } = setup({}, "r1");
    rerender({ answers: { q1: "a" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.failure).toBe("locked");
    rerender({ answers: { q1: "ab" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(saveSurveyMock).toHaveBeenCalledTimes(1);
  });

  test("403 NO_ENTITLEMENT 이면 이용권 없음 상태가 된다", async () => {
    saveSurveyMock.mockResolvedValue({
      kind: "error",
      status: 403,
      code: "NO_ENTITLEMENT",
      message: "",
    });
    const { rerender, result } = setup({}, "r1");
    rerender({ answers: { q1: "a" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.failure).toBe("entitlement");
  });

  test("일반 실패는 error 상태이고 다시 시도하면 같은 patch 를 보낸다", async () => {
    saveSurveyMock.mockResolvedValueOnce({
      kind: "error",
      status: 500,
      code: "X",
      message: "",
    });
    saveSurveyMock.mockResolvedValueOnce(ok("r1"));
    const { rerender, result } = setup({}, "r1");
    rerender({ answers: { q1: "a" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.saveState.phase).toBe("error");
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(saveSurveyMock).toHaveBeenCalledTimes(2);
    expect(saveSurveyMock.mock.calls[1]?.[0]).toEqual({
      reportId: "r1",
      answers: { q1: "a" },
    });
    expect(result.current.saveState.phase).toBe("saved");
  });

  test("saveNow 는 대기 중인 변경을 즉시 저장하고 성공 여부를 돌려준다", async () => {
    saveSurveyMock.mockResolvedValue(ok("r1"));
    const { rerender, result } = setup({}, "r1");
    rerender({ answers: { q1: "a" } });
    let saved = false;
    await act(async () => {
      saved = await result.current.saveNow();
    });
    expect(saved).toBe(true);
    expect(saveSurveyMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(saveSurveyMock).toHaveBeenCalledTimes(1);
  });

  test("저장 실패 시 saveNow 는 false", async () => {
    saveSurveyMock.mockResolvedValue({ kind: "timeout" });
    const { rerender, result } = setup({}, "r1");
    rerender({ answers: { q1: "a" } });
    let saved = true;
    await act(async () => {
      saved = await result.current.saveNow();
    });
    expect(saved).toBe(false);
  });

  test("잠금 실패 뒤에는 saveNow 와 leave 가 더 보내지 않는다", async () => {
    saveSurveyMock.mockResolvedValue({
      kind: "error",
      status: 409,
      code: "REPORT_NOT_OPEN",
      message: "",
    });
    const { rerender, result } = setup({}, "r1");
    rerender({ answers: { q1: "a" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.failure).toBe("closed");
    rerender({ answers: { q1: "ab" } });
    await act(async () => {
      await result.current.saveNow();
      await result.current.leave();
    });
    expect(saveSurveyMock).toHaveBeenCalledTimes(1);
  });

  test("한 번도 편집하지 않았으면 leave 는 저장하지 않는다", async () => {
    saveSurveyMock.mockResolvedValue(ok("r1"));
    const { result } = setup({ q1: "프리필" }, undefined);
    await act(async () => {
      await result.current.leave();
    });
    expect(saveSurveyMock).not.toHaveBeenCalled();
  });

  test("편집했으면 leave 가 남은 변경을 저장한다", async () => {
    saveSurveyMock.mockResolvedValue(ok("r1"));
    const { rerender, result } = setup({ q1: "프리필" }, undefined);
    rerender({ answers: { q1: "고침" } });
    await act(async () => {
      await result.current.leave();
    });
    expect(saveSurveyMock).toHaveBeenCalledTimes(1);
  });
});
