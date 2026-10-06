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
import type {
  OpenReport,
  SurveyBootstrap,
  SurveyEntitlement,
} from "@/lib/growth/api";
import { growthProfileNameQuery, pickGradeLabel } from "@/lib/growth/profile";
import {
  GrowthApiError,
  growthSurveyBootstrapQuery,
} from "@/lib/growth/queries";
import type { GrowthScreenStep } from "./deriveGrowthSteps";

// 성장설계 셸 전역 상태. 시작 화면과 사이드바가 같은 부트스트랩을 읽도록 셸에서 한 번만 받는다
// (각자 조회하면 같은 화면에서 이용권 잔여와 회차 상태가 어긋난다. PerformanceShellContext 와 같은 이유).
//
// 세션과 이용권 가드는 라우트 쪽(SessionProvider, RequireEntitlement)이 이미 판정했다.
// 여기서 노출하는 `entitlement` 는 부트스트랩 응답(/api/growth/survey GET)의 값이라,
// 리포트 생성으로 차감된 뒤 `refetchBootstrap()` 을 부르면 잔여 회차가 갱신된다.
//
// 값이 없으면 null 이다. 가짜 기본값을 만들지 않는다(화면은 null 이면 그 줄을 그리지 않는다).
//
// 화면 단계(currentStep)는 각 페이지가 `useGrowthScreenStep(n)` 으로 올린다. 라우트 경로에서
// 유도하지 않는 이유: 리포트 상세와 지난 리포트 목록처럼 경로 접두어가 같아도 단계가 다른
// 화면이 있어 페이지가 자기 단계를 가장 정확히 안다.

type GrowthShellValue = {
  bootstrap: SurveyBootstrap | null;
  /** 진행 중(draft, in_progress) 회차. 부트스트랩 전이거나 없으면 null. */
  openReport: OpenReport | null;
  entitlement: SurveyEntitlement | null;
  /** 가장 최근 완료 리포트 id. 없으면 null. */
  latestCompletedReportId: string | null;
  /** 사이드바 "OO의 성장설계" 이름. profiles 에서 읽으며 없으면 null. */
  studentName: string | null;
  /** 사이드바 학년 줄. 부트스트랩 student_profiles 의 학년이며 없으면 null. */
  gradeLabel: string | null;
  isBootstrapLoading: boolean;
  /** 부트스트랩 조회 실패. 원본 ApiResult 는 error.result 에 있다. */
  bootstrapError: GrowthApiError | null;
  /** 지금 화면의 단계. 단계 밖 화면이면 null. */
  currentStep: GrowthScreenStep | null;
  setCurrentStep: (step: GrowthScreenStep | null) => void;
  /** 설문 저장, 회차 생성, 차감 뒤에 호출해 시작 화면과 사이드바를 갱신한다. */
  refetchBootstrap: () => Promise<void>;
};

const GrowthShellContext = createContext<GrowthShellValue | null>(null);

export function GrowthShellProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const [currentStep, setCurrentStep] = useState<GrowthScreenStep | null>(null);

  const query = useQuery(growthSurveyBootstrapQuery(userId));
  const { refetch } = query;
  const { data: studentName = null } = useQuery(growthProfileNameQuery(userId));
  const refetchBootstrap = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const bootstrap = query.data ?? null;
  const bootstrapError =
    query.error instanceof GrowthApiError ? query.error : null;

  const value = useMemo<GrowthShellValue>(
    () => ({
      bootstrap,
      openReport: bootstrap?.openReport ?? null,
      entitlement: bootstrap?.entitlement ?? null,
      // 서버가 issuedAt 내림차순으로 준다(surveyBootstrap.ts 의 reports 정렬).
      latestCompletedReportId: bootstrap?.reports[0]?.id ?? null,
      studentName,
      gradeLabel: pickGradeLabel(bootstrap?.profile ?? null),
      isBootstrapLoading: query.isPending && query.fetchStatus !== "idle",
      bootstrapError,
      currentStep,
      setCurrentStep,
      refetchBootstrap,
    }),
    [
      bootstrap,
      query.isPending,
      query.fetchStatus,
      bootstrapError,
      studentName,
      currentStep,
      refetchBootstrap,
    ],
  );

  return (
    <GrowthShellContext.Provider value={value}>
      {children}
    </GrowthShellContext.Provider>
  );
}

export function useGrowthShell(): GrowthShellValue {
  const ctx = useContext(GrowthShellContext);
  if (!ctx) {
    throw new Error(
      "useGrowthShell은 GrowthShellProvider 내부에서만 호출할 수 있다.",
    );
  }
  return ctx;
}

/**
 * 페이지가 자기 단계를 셸에 알린다. 마운트 때 올리고 언마운트 때 null 로 비운다
 * (비우지 않으면 다음 화면이 그려지기 전 한 프레임 동안 이전 단계가 사이드바에 남는다).
 */
export function useGrowthScreenStep(step: GrowthScreenStep | null) {
  const { setCurrentStep } = useGrowthShell();
  useEffect(() => {
    setCurrentStep(step);
    return () => setCurrentStep(null);
  }, [step, setCurrentStep]);
}
