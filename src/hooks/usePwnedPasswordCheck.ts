// 비밀번호 필드가 포커스를 잃을 때(와 제출할 때) 유출 여부를 확인하는 훅.
// 키 입력마다 조회하지 않는다. 조회가 실패하면(unknown) 막지 않는다.
import { useCallback, useRef, useState } from "react";
import { checkPwnedPassword } from "@/lib/pwnedPassword";

export function usePwnedPasswordCheck() {
  const [pwned, setPwned] = useState(false);
  // 가장 최근에 확인을 시작한 비밀번호. 조회가 끝났을 때 달라져 있으면 결과를 버린다.
  const latest = useRef<string | null>(null);
  const inflight = useRef<{ password: string; promise: Promise<boolean> }>(
    null,
  );

  const start = useCallback((password: string) => {
    if (inflight.current?.password === password)
      return inflight.current.promise;

    latest.current = password;
    const promise = checkPwnedPassword(password).then((result) => {
      // 조회 중 비밀번호가 바뀌어 버려진 결과는 제출을 막지 않는다(막으면 안내 없이 멈춘다).
      if (latest.current !== password) return false;
      const isPwned = result === "pwned";
      setPwned(isPwned);
      return isPwned;
    });
    inflight.current = { password, promise };
    // 끝난 조회는 재사용하지 않는다(unknown 이었다면 제출 때 다시 시도한다).
    void promise.then(() => {
      if (inflight.current?.promise === promise) inflight.current = null;
    });
    return promise;
  }, []);

  const checkOnBlur = useCallback(
    (password: string) => {
      void start(password);
    },
    [start],
  );

  const markPwned = useCallback(() => setPwned(true), []);

  const reset = useCallback(() => {
    latest.current = null;
    inflight.current = null;
    setPwned(false);
  }, []);

  return { pwned, checkOnBlur, ensureChecked: start, markPwned, reset };
}
