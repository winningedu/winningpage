// 콘솔 셸 유휴 로그아웃: 클릭이나 키 입력 없이 30분이 지나면 signOut 후 로그인으로 보낸다.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: mocks.signOut } },
}));
vi.mock("react-router", () => ({ useNavigate: () => mocks.navigate }));

import { IDLE_LOGOUT_MS, useIdleLogout } from "./useIdleLogout";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useIdleLogout", () => {
  it("30분 동안 입력이 없으면 signOut 후 로그인 화면으로 이동한다", async () => {
    renderHook(() => useIdleLogout());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS - 1);
    });
    expect(mocks.signOut).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it.each(["click", "keydown"])(
    "%s 입력이 있으면 타이머가 처음부터 다시 시작한다",
    async (type) => {
      renderHook(() => useIdleLogout());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS - 1000);
      });
      act(() => {
        document.dispatchEvent(new Event(type, { bubbles: true }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS - 1);
      });
      expect(mocks.signOut).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
    },
  );
});
