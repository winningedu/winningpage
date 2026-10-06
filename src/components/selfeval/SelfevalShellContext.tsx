import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "@/context/SessionContext";
import { growthProfileNameQuery } from "@/lib/growth/profile";
import { SelfevalApiError, selfevalEntryQuery } from "@/lib/selfeval/queries";
import type { EntryResponse, SessionListItem } from "@/lib/selfeval/types";
import type { SelfevalScreenStep } from "./deriveSelfevalSteps";

// 자기평가서 셸 전역 상태. 성장설계 GrowthShellContext 와 같은 구조다.
// 시작 화면, 기본 입력, 사이드바가 같은 진입 정보를 읽도록 셸에서 한 번만 받는다
// (각자 조회하면 같은 화면에서 이용권 잔여와 열린 세션이 어긋난다).
//
// 세션과 이용권 가드는 라우트 쪽(SessionProvider, RequireEntitlement)이 이미 판정했다.
// 값이 없으면 null 이다. 가짜 기본값을 만들지 않는다(화면은 null 이면 그 줄을 그리지 않는다).
//
// 화면 단계(currentStep)는 각 페이지가 `useSelfevalScreenStep(n)` 으로 올린다.

type Entry = EntryResponse["entry"];

type SelfevalShellValue = {
  entry: Entry | null;
  /** 열린(draft, in_progress) 세션. 진입 정보 전이거나 없으면 null. */
  openSession: Entry["openSession"];
  /** 보관함이 읽는 세션 목록. 진입 정보 전이면 null. */
  sessions: SessionListItem[] | null;
  /** 사이드바 "OO의 자기평가서" 이름. profiles 에서 읽으며 없으면 null. */
  studentName: string | null;
  /** 사이드바 학년 줄. 진입 정보 프로필의 학년이며 없으면 null. */
  gradeLabel: string | null;
  isEntryLoading: boolean;
  /** 진입 조회 실패. 원본 ApiResult 는 error.result 에 있다. */
  entryError: SelfevalApiError | null;
  /** 지금 화면의 단계. 단계 밖 화면이면 null. */
  currentStep: SelfevalScreenStep | null;
  setCurrentStep: (step: SelfevalScreenStep | null) => void;
  /** 세션 생성, 파기, 선택 확정 뒤에 호출해 시작 화면과 사이드바를 갱신한다. */
  refetchEntry: () => Promise<void>;
};

const SelfevalShellContext = createContext<SelfevalShellValue | null>(null);

export function SelfevalShellProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const [currentStep, setCurrentStep] = useState<SelfevalScreenStep | null>(
    null,
  );

  const query = useQuery(selfevalEntryQuery(userId));
  const { refetch } = query;
  // 이름 조회는 성장설계와 같은 profiles 본인 행이라 쿼리를 그대로 쓴다(캐시도 공유한다).
  const { data: studentName = null } = useQuery(growthProfileNameQuery(userId));
  const refetchEntry = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const entry = query.data?.entry ?? null;
  const entryError =
    query.error instanceof SelfevalApiError ? query.error : null;

  const value = useMemo<SelfevalShellValue>(
    () => ({
      entry,
      openSession: entry?.openSession ?? null,
      sessions: query.data?.sessions ?? null,
      studentName,
      gradeLabel: entry?.profile?.gradeLabel ?? null,
      isEntryLoading: query.isPending && query.fetchStatus !== "idle",
      entryError,
      currentStep,
      setCurrentStep,
      refetchEntry,
    }),
    [
      entry,
      query.data?.sessions,
      query.isPending,
      query.fetchStatus,
      entryError,
      studentName,
      currentStep,
      refetchEntry,
    ],
  );

  return (
    <SelfevalShellContext.Provider value={value}>
      {children}
    </SelfevalShellContext.Provider>
  );
}

export function useSelfevalShell(): SelfevalShellValue {
  const ctx = useContext(SelfevalShellContext);
  if (!ctx) {
    throw new Error(
      "useSelfevalShell은 SelfevalShellProvider 내부에서만 호출할 수 있다.",
    );
  }
  return ctx;
}

/**
 * 페이지가 자기 단계를 셸에 알린다. 마운트 때 올리고 언마운트 때 null 로 비운다
 * (비우지 않으면 다음 화면이 그려지기 전 한 프레임 동안 이전 단계가 사이드바에 남는다).
 */
export function useSelfevalScreenStep(step: SelfevalScreenStep | null) {
  const { setCurrentStep } = useSelfevalShell();
  useEffect(() => {
    setCurrentStep(step);
    return () => setCurrentStep(null);
  }, [step, setCurrentStep]);
}
