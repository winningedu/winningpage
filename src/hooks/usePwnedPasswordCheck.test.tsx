import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const checkMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/pwnedPassword", () => ({
  checkPwnedPassword: checkMock,
}));

const { usePwnedPasswordCheck } = await import("./usePwnedPasswordCheck");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  checkMock.mockReset();
});

describe("usePwnedPasswordCheck", () => {
  test("blur 확인 결과가 pwned 이면 pwned 가 true", async () => {
    checkMock.mockResolvedValue("pwned");
    const { result } = renderHook(() => usePwnedPasswordCheck());

    await act(async () => {
      result.current.checkOnBlur("password");
    });

    expect(result.current.pwned).toBe(true);
  });

  test("blur 확인 결과가 ok 나 unknown 이면 pwned 는 false", async () => {
    const { result } = renderHook(() => usePwnedPasswordCheck());

    for (const outcome of ["ok", "unknown"]) {
      checkMock.mockResolvedValue(outcome);
      await act(async () => {
        result.current.checkOnBlur("Abcdef1!");
      });
      expect(result.current.pwned).toBe(false);
    }
  });

  test("조회가 끝나기 전에 비밀번호가 바뀌면 옛 결과를 버린다", async () => {
    const slow = deferred<"pwned">();
    checkMock.mockReturnValue(slow.promise);
    const { result } = renderHook(() => usePwnedPasswordCheck());

    act(() => {
      result.current.checkOnBlur("password");
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      slow.resolve("pwned");
    });

    expect(result.current.pwned).toBe(false);
  });

  test("다른 비밀번호로 다시 blur 해도 먼저 시작한 옛 결과는 버린다", async () => {
    const slow = deferred<"pwned">();
    checkMock.mockReturnValueOnce(slow.promise);
    checkMock.mockResolvedValueOnce("ok");
    const { result } = renderHook(() => usePwnedPasswordCheck());

    act(() => {
      result.current.checkOnBlur("password");
    });
    await act(async () => {
      result.current.checkOnBlur("Abcdef1!");
    });
    await act(async () => {
      slow.resolve("pwned");
    });

    expect(result.current.pwned).toBe(false);
  });

  test("제출 시 ensureChecked 는 조회를 기다려 pwned 면 true 로 풀린다", async () => {
    checkMock.mockResolvedValue("pwned");
    const { result } = renderHook(() => usePwnedPasswordCheck());

    let blocked = false;
    await act(async () => {
      blocked = await result.current.ensureChecked("password");
    });

    expect(blocked).toBe(true);
    expect(result.current.pwned).toBe(true);
  });

  test("ensureChecked 는 unknown 이면 false 로 풀려 막지 않는다", async () => {
    checkMock.mockResolvedValue("unknown");
    const { result } = renderHook(() => usePwnedPasswordCheck());

    let blocked = true;
    await act(async () => {
      blocked = await result.current.ensureChecked("password");
    });

    expect(blocked).toBe(false);
  });

  test("blur 로 이미 시작한 같은 비밀번호 조회를 ensureChecked 가 다시 하지 않는다", async () => {
    const pending = deferred<"pwned">();
    checkMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => usePwnedPasswordCheck());

    let blocked = false;
    await act(async () => {
      result.current.checkOnBlur("password");
      const submit = result.current.ensureChecked("password");
      pending.resolve("pwned");
      blocked = await submit;
    });

    expect(blocked).toBe(true);
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  test("조회 중 비밀번호가 바뀌어 버려진 결과면 ensureChecked 는 false 로 풀린다", async () => {
    const slow = deferred<"pwned">();
    checkMock.mockReturnValue(slow.promise);
    const { result } = renderHook(() => usePwnedPasswordCheck());

    let blocked = true;
    await act(async () => {
      const submit = result.current.ensureChecked("password");
      result.current.reset();
      slow.resolve("pwned");
      blocked = await submit;
    });

    expect(blocked).toBe(false);
    expect(result.current.pwned).toBe(false);
  });

  test("markPwned 는 pwned 를 켜고 reset 은 끈다", () => {
    const { result } = renderHook(() => usePwnedPasswordCheck());

    act(() => {
      result.current.markPwned();
    });
    expect(result.current.pwned).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.pwned).toBe(false);
  });
});
