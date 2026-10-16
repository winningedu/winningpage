import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { inquiryProfileNameQuery } from "@/lib/inquiry/profile";
import {
  InquiryApiError,
  inquiryQueryKeys,
  inquirySessionQuery,
} from "@/lib/inquiry/queries";
import type {
  AssetView,
  HandoffView,
  QuotaView,
  RecordCandidate,
  SessionResponse,
  SessionView,
  TopicView,
} from "@/lib/inquiry/types";
import type { InquiryScreenStep } from "./deriveInquirySteps";

// 심화탐구 셸 전역 상태(계약: 부록 C). 정보 입력 화면과 사이드바가 같은 부트스트랩을 읽도록
// 셸에서 inquirySessionQuery(resume) 하나만 받는다. 값이 없으면 null 이다(가짜 기본값 없음).
// 변경 응답(세션 생성, 자산 저장)은 applyBootstrap 으로 캐시에 즉시 반영한다.
// 화면 단계(currentStep)는 각 페이지가 useInquiryScreenStep(n) 으로 올린다.

type InquiryShellValue = {
  bootstrap: SessionResponse | null;
  session: SessionView | null;
  quota: QuotaView | null;
  handoff: HandoffView | null;
  records: RecordCandidate[];
  subjectCounts: SessionResponse["subjectCounts"];
  assets: AssetView[];
  topics: TopicView[];
  gradeNote: string | null;
  /** 사이드바 "OO의 심화탐구" 이름. profiles 에서 읽으며 없으면 null. */
  studentName: string | null;
  /** 사이드바 학년 줄. 세션 학년을 우선하고 없으면 student_profiles 학년. */
  gradeLabel: string | null;
  isBootstrapLoading: boolean;
  bootstrapError: InquiryApiError | null;
  /** 지금 화면의 단계. 단계 밖 화면이면 null. */
  currentStep: InquiryScreenStep | null;
  setCurrentStep: (step: InquiryScreenStep | null) => void;
  refetchBootstrap: () => Promise<void>;
  /** 변경 응답을 부트스트랩 캐시에 즉시 합친다. 캐시가 없으면 무동작. */
  applyBootstrap: (partial: Partial<SessionResponse>) => void;
};

const InquiryShellContext = createContext<InquiryShellValue | null>(null);

const EMPTY_RECORDS: RecordCandidate[] = [];
const EMPTY_ASSETS: AssetView[] = [];
const EMPTY_TOPICS: TopicView[] = [];
const EMPTY_COUNTS: SessionResponse["subjectCounts"] = [];

export function InquiryShellProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<InquiryScreenStep | null>(
    null,
  );

  const query = useQuery(inquirySessionQuery(userId));
  const { refetch } = query;
  const { data: studentName = null } = useQuery(
    inquiryProfileNameQuery(userId),
  );

  const refetchBootstrap = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const applyBootstrap = useCallback(
    (partial: Partial<SessionResponse>) => {
      queryClient.setQueryData<SessionResponse>(
        inquiryQueryKeys.session(userId),
        (prev) => (prev ? { ...prev, ...partial } : prev),
      );
    },
    [queryClient, userId],
  );

  const bootstrap = query.data ?? null;
  const bootstrapError =
    query.error instanceof InquiryApiError ? query.error : null;

  const value = useMemo<InquiryShellValue>(
    () => ({
      bootstrap,
      session: bootstrap?.session ?? null,
      quota: bootstrap?.quota ?? null,
      handoff: bootstrap?.handoff ?? null,
      records: bootstrap?.records ?? EMPTY_RECORDS,
      subjectCounts: bootstrap?.subjectCounts ?? EMPTY_COUNTS,
      assets: bootstrap?.assets ?? EMPTY_ASSETS,
      topics: bootstrap?.topics ?? EMPTY_TOPICS,
      gradeNote: bootstrap?.gradeNote ?? null,
      studentName,
      gradeLabel:
        bootstrap?.session?.gradeLabel ??
        bootstrap?.profile?.gradeLabel ??
        null,
      isBootstrapLoading: query.isPending && query.fetchStatus !== "idle",
      bootstrapError,
      currentStep,
      setCurrentStep,
      refetchBootstrap,
      applyBootstrap,
    }),
    [
      bootstrap,
      studentName,
      query.isPending,
      query.fetchStatus,
      bootstrapError,
      currentStep,
      refetchBootstrap,
      applyBootstrap,
    ],
  );

  return (
    <InquiryShellContext.Provider value={value}>
      {children}
    </InquiryShellContext.Provider>
  );
}

export function useInquiryShell(): InquiryShellValue {
  const ctx = useContext(InquiryShellContext);
  if (!ctx) {
    throw new Error(
      "useInquiryShell은 InquiryShellProvider 내부에서만 호출할 수 있다.",
    );
  }
  return ctx;
}

/**
 * 페이지가 자기 단계를 셸에 알린다. 마운트 때 올리고 언마운트 때 null 로 비운다
 * (비우지 않으면 다음 화면이 그려지기 전 한 프레임 동안 이전 단계가 사이드바에 남는다).
 */
export function useInquiryScreenStep(step: InquiryScreenStep | null) {
  const { setCurrentStep } = useInquiryShell();
  useEffect(() => {
    setCurrentStep(step);
    return () => setCurrentStep(null);
  }, [step, setCurrentStep]);
}
