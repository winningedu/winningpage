import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult } from "@/lib/selfeval/api";
import {
  createStepFlow,
  type FlowState,
  initialFlowState,
} from "./generationFlow";

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

type Options = {
  /** false 면 아무것도 부르지 않는다(세션 상세를 읽은 뒤에야 호출 여부를 정할 수 있다). */
  enabled: boolean;
  /** 값이 바뀌면 새 흐름으로 다시 시작한다(다시 생성, 다시 분석, 다시 검증). */
  runKey: number;
  sleep?: (ms: number) => Promise<void>;
};

/** enabled 가 되면 단계를 한 번 부르고, 실패하면 retry 로 같은 호출을 다시 보낸다. */
export function useStepFlow<T>(
  run: () => Promise<ApiResult<T>>,
  { enabled, runKey, sleep = realSleep }: Options,
) {
  const [state, setState] = useState<FlowState<T>>(() => initialFlowState<T>());
  const flowRef = useRef<ReturnType<typeof createStepFlow<T>> | null>(null);
  // 인라인 함수를 넘겨도 흐름이 다시 만들어지지 않도록 최신 값만 읽는다.
  const runRef = useRef(run);
  runRef.current = run;
  const sleepRef = useRef(sleep);
  sleepRef.current = sleep;

  // biome-ignore lint/correctness/useExhaustiveDependencies: runKey 는 재시작 신호로만 쓴다
  useEffect(() => {
    if (!enabled) return;
    const flow = createStepFlow<T>({
      run: () => runRef.current(),
      sleep: (ms) => sleepRef.current(ms),
      onState: setState,
    });
    flowRef.current = flow;
    void flow.start();
    return () => {
      flow.dispose();
      flowRef.current = null;
    };
  }, [enabled, runKey]);

  const retry = useCallback(() => {
    void flowRef.current?.retry();
  }, []);

  return { state, retry };
}
