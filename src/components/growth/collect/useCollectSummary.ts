// 활동 선택 화면의 집계 상태(명세 No.113). 트랙이나 성적 입력이 바뀌면 500ms 디바운스 뒤 summary 를
// 다시 부른다. 첫 호출은 기다리지 않는다. 업로드, 직접 입력 저장 직후에는 refresh() 로 바로 부른다.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ActivityView,
  type CollectSummary,
  type CurrentSemester,
  collectSummary,
  type SemesterKey,
  type Track,
} from "@/lib/growth/api";

export const SUMMARY_DEBOUNCE_MS = 500;

export type CollectSummaryStatus =
  | "idle"
  | "loading"
  | "ready"
  | "no-report"
  | "error";

export type CollectSummaryInput = {
  track: Track | null;
  current: CurrentSemester | undefined;
  directGrades: Partial<Record<SemesterKey, number>>;
};

export function useCollectSummary(input: CollectSummaryInput) {
  const [summary, setSummary] = useState<CollectSummary | null>(null);
  const [activities, setActivities] = useState<ActivityView[]>([]);
  const [status, setStatus] = useState<CollectSummaryStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef(input);
  inputRef.current = input;
  const requestId = useRef(0);
  const hasRequested = useRef(false);

  const fetchNow = useCallback(async () => {
    const { track, current, directGrades } = inputRef.current;
    if (track === null) return;
    const id = ++requestId.current;
    hasRequested.current = true;
    setStatus("loading");
    const result = await collectSummary({
      track,
      ...(current ? { current } : {}),
      directGrades,
    });
    if (id !== requestId.current) return;
    if (result.kind === "ok") {
      setSummary(result.data.summary);
      setActivities(result.data.activities);
      setErrorMessage(null);
      setStatus("ready");
      return;
    }
    if (result.kind === "error" && result.code === "NO_OPEN_REPORT") {
      setStatus("no-report");
      return;
    }
    setErrorMessage(
      result.kind === "error"
        ? result.message
        : "응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.",
    );
    setStatus("error");
  }, []);

  const key = JSON.stringify([input.track, input.current, input.directGrades]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 가 입력의 변화를 대표한다
  useEffect(() => {
    if (inputRef.current.track === null) return;
    if (!hasRequested.current) {
      void fetchNow();
      return;
    }
    const timer = setTimeout(() => void fetchNow(), SUMMARY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, fetchNow]);

  return { summary, activities, status, errorMessage, refresh: fetchNow };
}
