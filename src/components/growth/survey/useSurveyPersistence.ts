import { useCallback, useRef, useState } from "react";
import { useDebouncedAutosave } from "@/components/performance/step5/useDebouncedAutosave";
import { type SurveyAnswers, saveSurvey } from "@/lib/growth/api";
import {
  classifySaveFailure,
  type SaveFailure,
  type SaveState,
} from "./surveySave";
import { diffAnswers } from "./surveyState";

type Options = {
  /** 지금 화면의 답. 바뀌면 1.5초 디바운스 뒤 자동 저장한다. */
  answers: SurveyAnswers;
  /** 서버가 이미 가진 답. 이 값과 다른 키만 patch 로 보낸다(프리필 값은 첫 저장 때 함께 간다). */
  savedAnswers: SurveyAnswers;
  /** 진행 중 회차 id. 없으면 첫 저장이 회차를 만들고 응답의 id 를 이어서 쓴다. */
  reportId: string | undefined;
  enabled: boolean;
};

/**
 * 학생 조사 자동 저장. 저장은 한 줄로 직렬화하고, 실행 시점에 저장본과 지금 답을 비교하므로
 * 디바운스, 이동 전 저장, 언마운트 flush 가 겹쳐도 같은 patch 가 두 번 가지 않는다.
 * 409 REPORT_LOCKED 와 403 NO_ENTITLEMENT 는 failure 로 올리고 이후 저장을 멈춘다.
 */
export function useSurveyPersistence({
  answers,
  savedAnswers,
  reportId,
  enabled,
}: Options) {
  const [saveState, setSaveState] = useState<SaveState>({ phase: "idle" });
  const [failure, setFailure] = useState<SaveFailure | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const savedRef = useRef(savedAnswers);
  const reportIdRef = useRef(reportId);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  const run = useCallback(async () => {
    const patch = diffAnswers(savedRef.current, answersRef.current);
    if (Object.keys(patch).length === 0) return;
    setSaveState({ phase: "saving" });
    const currentReportId = reportIdRef.current;
    const result = await saveSurvey(
      currentReportId === undefined
        ? { answers: patch }
        : { reportId: currentReportId, answers: patch },
    );
    if (result.kind !== "ok") {
      const kind = classifySaveFailure(result);
      if (kind === "failed") {
        setSaveState({ phase: "error" });
      } else {
        setFailure(kind);
        setSaveState({ phase: "idle" });
      }
      throw new Error(`survey-save-${kind}`);
    }
    reportIdRef.current = result.data.reportId;
    const next = { ...savedRef.current };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete next[key];
      else next[key] = value;
    }
    savedRef.current = next;
    setSaveState({ phase: "saved", savedAt: Date.now() });
  }, []);

  /** 저장을 한 줄로 세운다. 이미 줄에 선 저장이 끝난 뒤 그 시점의 답으로 비교한다. */
  const persist = useCallback((): Promise<void> => {
    const next = chainRef.current.then(run);
    chainRef.current = next.catch(() => undefined);
    return next;
  }, [run]);

  const autosave = useDebouncedAutosave({
    value: answers,
    onSave: persist,
    enabled: enabled && failure === null,
  });

  /** 화면 이동 전 호출한다. 대기 중인 변경까지 저장하고 성공 여부를 돌려준다. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    autosave.cancel();
    try {
      await persist();
      return true;
    } catch {
      return false;
    }
  }, [autosave, persist]);

  return {
    saveState,
    failure,
    persist,
    saveNow,
    retry: () => autosave.flush({ force: true }),
  };
}
