// GET /api/console/me. 셸 가드가 한 번 읽어 아래 화면들에 context 로 내려준다.

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { type ConsoleMe, consoleRequest, errorCode } from "./api";
import { type GradeLabeler, gradeLabel } from "./classLabel";

export type ConsoleMeResult =
  | { state: "ok"; me: ConsoleMe }
  | { state: "unauth" }
  | { state: "noaccess" };

export const CONSOLE_ME_KEY = ["console", "me"] as const;

async function fetchMe(): Promise<ConsoleMeResult> {
  const res = await consoleRequest("/api/console/me");
  if (res.status === 401) return { state: "unauth" };
  if (res.status === 403 && errorCode(res.body) === "NOT_CONSOLE")
    return { state: "noaccess" };
  if (res.status !== 200) throw new Error(`console me ${res.status}`);
  return { state: "ok", me: res.body as ConsoleMe };
}

export function useConsoleMeQuery() {
  return useQuery({
    queryKey: CONSOLE_ME_KEY,
    queryFn: fetchMe,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

interface ConsoleMeContextValue {
  me: ConsoleMe;
  /** 기관명처럼 바뀐 값을 다시 읽는다(교 #231). */
  reload: () => Promise<void>;
}

export const ConsoleMeContext = createContext<ConsoleMeContextValue | null>(
  null,
);

export function useConsoleMe(): ConsoleMeContextValue {
  const value = useContext(ConsoleMeContext);
  if (!value) throw new Error("useConsoleMe must be used inside ConsoleGate");
  return value;
}

/** 학원 기관만 "고1" 그대로, 학교는 "1학년". 학년 없는 학급은 "다학년". */
export function useGradeLabel(): GradeLabeler {
  const academy = useConsoleMe().me.tenant.orgType === "학원";
  return (grade) => gradeLabel(grade, academy);
}
