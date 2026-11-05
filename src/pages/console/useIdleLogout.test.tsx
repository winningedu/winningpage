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

import {
  IDLE_ACTIVITY_KEY,
  IDLE_LOGOUT_MS,
  useIdleLogout,
} from "./useIdleLogout";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it("언마운트하면 타이머와 입력 리스너를 걷어 로그아웃하지 않는다", async () => {
    const { unmount } = renderHook(() => useIdleLogout());
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS * 2);
    });

    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("이 기기 세션만 끝내도록 local scope 로 signOut 한다", async () => {
    renderHook(() => useIdleLogout());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS);
    });

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signOut 이 실패해도 로그인 화면으로 이동한다", async () => {
    mocks.signOut.mockRejectedValue(new Error("network"));
    renderHook(() => useIdleLogout());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS);
    });

    expect(mocks.navigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("클릭하면 마지막 활동 시각을 localStorage 에 남긴다", () => {
    renderHook(() => useIdleLogout());

    act(() => {
      document.dispatchEvent(new Event("click", { bubbles: true }));
    });

    expect(localStorage.getItem(IDLE_ACTIVITY_KEY)).toBe(String(Date.now()));
  });

  it("다른 탭에서 더 늦게 활동했으면 이 탭의 30분이 지나도 로그아웃하지 않고 그 활동 기준 30분 뒤에 로그아웃한다", async () => {
    renderHook(() => useIdleLogout());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    });
    localStorage.setItem(IDLE_ACTIVITY_KEY, String(Date.now()));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS - 20 * 60 * 1000);
    });
    expect(mocks.signOut).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000 - 1);
    });
    expect(mocks.signOut).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("storage 이벤트로 다른 탭의 활동을 받으면 그 시각부터 30분을 다시 센다", async () => {
    renderHook(() => useIdleLogout());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    });
    const now = String(Date.now());
    localStorage.setItem(IDLE_ACTIVITY_KEY, now);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: IDLE_ACTIVITY_KEY, newValue: now }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS - 1);
    });
    expect(mocks.signOut).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("localStorage 를 쓸 수 없어도 이 탭 기준 30분 뒤 로그아웃한다", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderHook(() => useIdleLogout());

    act(() => {
      document.dispatchEvent(new Event("keydown", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS);
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("언마운트하면 storage 리스너도 걷는다", async () => {
    const { unmount } = renderHook(() => useIdleLogout());
    unmount();
    localStorage.setItem(IDLE_ACTIVITY_KEY, String(Date.now()));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: IDLE_ACTIVITY_KEY }),
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_MS * 2);
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
