import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchReports,
  runReportStep,
  type StepProgress,
} from "@/lib/growth/api";
import {
  createGenerationEngine,
  firstPendingStep,
  type GenerationEngineDeps,
  type GenerationState,
} from "./generationEngine";
import { STEP_COUNT } from "./stepLabels";

type Options = {
  reportId: string;
  initialProgress: StepProgress[];
} & Partial<Pick<GenerationEngineDeps, "runStep" | "fetchOpen" | "sleep">>;

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 진입하면 바로 생성을 시작하고, 탭이 다시 보이면 서버 진행과 맞춘다. 의존성은 테스트용으로 바꿀 수 있다. */
export function useReportGeneration({
  reportId,
  initialProgress,
  runStep = runReportStep,
  fetchOpen = fetchReports,
  sleep = realSleep,
}: Options) {
  const [state, setState] = useState<GenerationState>(() => ({
    phase: "idle",
    progress: initialProgress,
    currentStep: firstPendingStep(initialProgress) ?? STEP_COUNT,
    attempts: 0,
    issues: null,
    errorCode: null,
    errorMessage: null,
    charged: null,
    completion: null,
  }));
  const engineRef = useRef<ReturnType<typeof createGenerationEngine> | null>(
    null,
  );
  // 처음 받은 값만 쓴다(재렌더로 바뀐 인자가 진행 중인 엔진을 다시 만들지 않게 한다).
  const initialRef = useRef(initialProgress);
  // 주입 함수도 최신 값만 읽는다(인라인 함수를 넘겨도 엔진이 재생성되지 않게 한다).
  const depsRef = useRef({ runStep, fetchOpen, sleep });
  depsRef.current = { runStep, fetchOpen, sleep };

  useEffect(() => {
    const engine = createGenerationEngine({
      reportId,
      initialProgress: initialRef.current,
      runStep: (req) => depsRef.current.runStep(req),
      fetchOpen: () => depsRef.current.fetchOpen(),
      sleep: (ms) => depsRef.current.sleep(ms),
      onState: setState,
    });
    engineRef.current = engine;
    const onVisible = () => {
      if (document.visibilityState === "visible") void engine.sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    void engine.start();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      engine.dispose();
      engineRef.current = null;
    };
  }, [reportId]);

  const retry = useCallback(() => {
    void engineRef.current?.retry();
  }, []);

  return { state, retry };
}
