import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import OnboardingCalculatingOverlay from "@/components/goal/onboarding/OnboardingCalculatingOverlay";
import OnboardingStepShell from "@/components/goal/onboarding/OnboardingStepShell";
import {
  MOCK_FLOW,
  NAESIN_EXAM_FLOW,
} from "@/components/goal/onboarding/onboardingOptions";
import Step1School from "@/components/goal/onboarding/steps/Step1School";
import Step2UpperUniversity from "@/components/goal/onboarding/steps/Step2UpperUniversity";
import Step3LowerUniversity from "@/components/goal/onboarding/steps/Step3LowerUniversity";
import Step4Naesin from "@/components/goal/onboarding/steps/Step4Naesin";
import Step5MockExam from "@/components/goal/onboarding/steps/Step5MockExam";
import Step6StudyHours from "@/components/goal/onboarding/steps/Step6StudyHours";
import Step7DailySchedule from "@/components/goal/onboarding/steps/Step7DailySchedule";
import { site } from "@/config/site";
import {
  GoalOnboardingProvider,
  type MockRoundState,
  type NaesinExamState,
  useGoalOnboarding,
} from "@/context/GoalOnboardingContext";
import { generateGoalAdvice, submitGoalIntake } from "@/lib/goalApi";
import { queryClient } from "@/lib/queryClient";
import { tenantBlockMessage } from "@/lib/tenantBlock";

// 로컬 E2E 버그(팀장 지시) — GoalOnboardingContext는 naesin.exams/mockExam.rounds에
// FLOW 전체 키(내신 12개・모의고사 14개)를 항상 빈 객체로 채워 들고 있다가(다른 시험/
// 회차를 다시 고르면 이전에 입력해 둔 값이 사라지지 않게 하려는 설계, 각 buildInitial*
// 주석 참고) 제출 시 통째로 서버에 실어 보낸다. 서버는 이제 "표시 창"(선택 회차 포함
// 역순 최대 3개) 밖・빈 회차를 무시하도록 방어했지만(api/_routes/goal/intake.ts), 클라이언트도
// 애초에 화면에 보이지도 않는 빈/스테일 데이터를 굳이 실어 보낼 필요가 없다 — 여기서
// 한 번 더 창 안 + 실제 값이 있는 회차만 걸러 payload를 sparse하게 만든다.

function hasNaesinGroupData(exam: NaesinExamState | undefined): boolean {
  if (!exam) return false;
  return Object.values(exam.groups).some(
    (group) => group.avg.trim() !== "" || group.subjects.length > 0,
  );
}

// Step4Naesin.tsx recentExams와 동일한 창 규칙(선택 시험 포함 역순 최대 3개)으로,
// 실제 데이터가 있는 시험만 골라 sparse exams를 만든다.
export function buildNaesinExamsPayload(
  lastExam: string,
  exams: Record<string, NaesinExamState>,
): Record<string, NaesinExamState> {
  if (lastExam === "") return {};
  const index = NAESIN_EXAM_FLOW.findIndex((exam) => exam.key === lastExam);
  if (index === -1) return {};

  const payload: Record<string, NaesinExamState> = {};
  for (const entry of NAESIN_EXAM_FLOW.slice(
    Math.max(0, index - 2),
    index + 1,
  )) {
    const exam = exams[entry.key];
    if (hasNaesinGroupData(exam)) payload[entry.key] = exam!;
  }
  return payload;
}

function hasMockRoundData(round: MockRoundState | undefined): boolean {
  if (!round) return false;
  return (
    round.kor.grade.trim() !== "" ||
    round.math.grade.trim() !== "" ||
    round.eng.grade.trim() !== "" ||
    round.tam1.grade.trim() !== "" ||
    round.tam2.grade.trim() !== ""
  );
}

// Step5MockExam.tsx recentRounds와 동일한 창 규칙으로, 실제 값이 있는 회차만 골라
// sparse rounds를 만든다.
export function buildMockRoundsPayload(
  lastRound: string,
  rounds: Record<string, MockRoundState>,
): Record<string, MockRoundState> {
  if (lastRound === "") return {};
  const index = MOCK_FLOW.findIndex((round) => round.key === lastRound);
  if (index === -1) return {};

  const payload: Record<string, MockRoundState> = {};
  for (const entry of MOCK_FLOW.slice(Math.max(0, index - 2), index + 1)) {
    const round = rounds[entry.key];
    if (hasMockRoundData(round)) payload[entry.key] = round!;
  }
  return payload;
}

// 목표관리 온보딩 7단계 위저드 — docs/figma-goal/00-INDEX.md §3 G1 / §4-1.
// 라우트 계약(다른 에이전트가 App.jsx에 배선): `/app/goal/onboarding/:step` → 이 파일.
// step 파라미터는 'step-1' ~ 'step-7'만 유효하고, 범위 밖 값은 1단계로 리다이렉트한다.
// 마케팅 셸(SiteLayout) 안에서 렌더되므로 헤더/푸터는 이 파일이 그리지 않는다 — Header가
// position:fixed(4rem)라 pt-16으로 겹침만 보정한다.
const STEP_ORDER = [
  "step-1",
  "step-2",
  "step-3",
  "step-4",
  "step-5",
  "step-6",
  "step-7",
];

// 계산 로딩 연출 지속 시간(ms) — 시안 #11엔 로딩 시간이 명시돼 있지 않아 임의값(추정).
const CALCULATING_DURATION_MS = 1400;

type SubmitErrorBanner = {
  tone: "info" | "error";
  message: string;
};

export default function Onboarding() {
  return (
    <GoalOnboardingProvider>
      <OnboardingWizard />
    </GoalOnboardingProvider>
  );
}

function OnboardingWizard() {
  const { step } = useParams();
  const navigate = useNavigate();
  const [isCalculating, setIsCalculating] = useState(false);
  // submitGoalIntake() 실패 시 화면에 남길 안내 배너. { tone: 'info' | 'error', message }.
  // tone 'info'는 422(컷 데이터 준비 중) 전용 — 사용자 잘못이 아니므로 에러색을 쓰지 않는다.
  const [submitError, setSubmitError] = useState<SubmitErrorBanner | null>(
    null,
  );
  const {
    schoolType,
    grade,
    upperUniversity,
    lowerUniversity,
    naesin,
    mockExam,
    studyHours,
    weekSchedule,
    resetOnboardingFlow,
  } = useGoalOnboarding();

  // step은 라우트 파라미터라 undefined일 수 있다 — indexOf는 빈 문자열에도 항상 -1을
  // 반환해 아래 미존재 분기(step-1로 리다이렉트)로 동일하게 흘러간다.
  const stepIndex = STEP_ORDER.indexOf(step ?? "");

  if (stepIndex === -1) {
    return <Navigate to="/app/goal/onboarding/step-1" replace />;
  }

  const current = stepIndex + 1;
  const total = STEP_ORDER.length;

  function goPrev() {
    if (stepIndex === 0) return;
    navigate(`/app/goal/onboarding/${STEP_ORDER[stepIndex - 1]}`);
  }

  function goNext() {
    if (stepIndex === STEP_ORDER.length - 1) return;
    navigate(`/app/goal/onboarding/${STEP_ORDER[stepIndex + 1]}`);
  }

  // 7단계 "다음" 클릭 = 온보딩 완료. #11(전면 딤)을 "학습량 계산 중" 로딩으로 간주해 잠깐
  // 오버레이를 띄운 뒤 대시보드로 이동한다(작업 지시 §확정 사항 3).
  //
  // 2026-08-11: goal_students 테이블이 생겨 실제 제출은 submitGoalIntake()
  // (src/lib/goalApi.js, POST /api/goal/intake)로 한다 — 더 이상 콘솔 로그로 대체하지
  // 않는다. body는 GoalOnboardingContext state 8개 필드를 그대로 넘긴다(계약이 이미
  // 일치하므로 변환 불필요, api/_routes/goal/intake.js 주석 참고).
  //
  // 분기(작업 지시 §서버 계약):
  //   200(success) · 409(already-onboarded) — 서버가 이미 완료로 인정한다는 뜻이 같으므로
  //     둘 다 계산 오버레이 → resetOnboardingFlow() → /app/goal 로 동일하게 처리한다.
  //     서버가 진실이므로 클라이언트 완료 플래그(markOnboardingDone())는 더 이상 세우지
  //     않는다 — 다음 진입 시 RequireGoalAccess의 3단계가 서버에 다시 물어본다.
  //   422(cuts-missing) — 입력은 이미 서버에 저장됐다(status='awaiting_cuts'). 계산에
  //     성공한 척 오버레이를 띄우면 안 된다 — 온보딩 화면에 머무르며 안내만 띄운다.
  //   400(validation-error) — 정상 경로에선 나오지 않아야 할 방어적 분기. 입력 유지,
  //     에러 메시지만 띄우고 재시도 가능케 한다.
  //   401 → /login, 403 → /pricing?service=goal.
  //   그 외(error: 500·네트워크 오류·예상 밖 상태) — 일반 에러, 입력 유지, 재시도 가능.
  //
  // 오버레이 최소 노출 시간: 네트워크 왕복이 CALCULATING_DURATION_MS보다 짧게 끝나도
  // "계산 중" 연출이 순간 깜빡이지 않도록, 성공 경로에서는 경과 시간을 빼고 남은 시간만큼
  // 더 기다렸다가 이동한다. 실패 경로는 오버레이를 즉시 내린다(실패했는데 계산 중인 척
  // 붙잡아 둘 이유가 없다).
  async function handleFinish() {
    setSubmitError(null);
    setIsCalculating(true);

    const startedAt = Date.now();
    const result = await submitGoalIntake({
      schoolType,
      grade,
      upperUniversity,
      lowerUniversity,
      // naesin은 {lastExam, overall, priorNaesinGrade, exams}를 싣는다. priorNaesinGrade는
      // lastExam==="" ("아직 없음")일 때만 서버가 읽는다(그 외에는 무시하고 저장도 하지 않는다).
      // exams는 그대로 보내지 않는다 — Context가 FLOW 전체 키(12개)를 항상 빈 객체로 들고
      // 있으므로, buildNaesinExamsPayload로 표시 창(선택 시험 포함 역순 최대 3개) 안에서
      // 실제 값이 있는 시험만 골라 sparse하게 줄인다(로컬 E2E 버그 수정).
      naesin: {
        ...naesin,
        exams: buildNaesinExamsPayload(naesin.lastExam, naesin.exams),
      },
      // mockExam.rounds도 같은 이유로 sparse하게 줄인다.
      mockExam: {
        ...mockExam,
        rounds: buildMockRoundsPayload(mockExam.lastRound, mockExam.rounds),
      },
      studyHours,
      weekSchedule,
    });

    if (result.kind === "success" || result.kind === "already-onboarded") {
      const remaining = Math.max(
        0,
        CALCULATING_DURATION_MS - (Date.now() - startedAt),
      );
      // 진입 가드(isOnboardingDone)가 ['goal','student'] 캐시를 stale-while-
      // revalidate로 통과시키므로, 방금 저장된 "온보딩 완료"를 캐시가 모르는 채
      // 대시보드로 가면 step-1로 되돌아온다. 이동 전에 명시 무효화한다.
      await queryClient.invalidateQueries({ queryKey: ["goal", "student"] });
      // QA 행295 — 온보딩 완료 직후 AI 입시조언을 1회 생성해 둔다(fire-and-forget,
      // 화면 이동을 막지 않는다). 실패해도 대시보드는 GET /api/goal/advice로 다시
      // 조회하거나 규칙 기반 폴백을 그대로 쓴다 — 여기서 에러를 표면화하지 않는다.
      generateGoalAdvice("intake").catch((error) => {
        console.error("[Onboarding] AI 입시조언 생성 요청 실패:", error);
      });
      window.setTimeout(() => {
        resetOnboardingFlow();
        navigate("/app/goal");
      }, remaining);
      return;
    }

    setIsCalculating(false);

    if (result.kind === "cuts-missing") {
      setSubmitError({
        tone: "info",
        message:
          "입력하신 목표 대학의 합격 기준 데이터를 아직 준비 중이에요. 데이터가 준비되는 대로 학습량을 계산해 드릴게요.",
      });
      return;
    }

    if (result.kind === "validation-error") {
      setSubmitError({
        tone: "error",
        message: result.detail || "입력 내용을 다시 확인해 주세요.",
      });
      return;
    }

    if (result.kind === "no-session") {
      navigate("/login");
      return;
    }

    if (result.kind === "not-allowed") {
      // 스쿨멘토는 결제 페이지가 아니라 기관 설정 사유를 안내한다(결정 99).
      if (site.features.tenantServiceGate) {
        setSubmitError({
          tone: "error",
          message: tenantBlockMessage(result.tenantReason),
        });
        return;
      }
      navigate("/pricing?service=goal");
      return;
    }

    // result.kind === 'error' — 500 / 네트워크 오류 / 예상 밖 상태코드.
    setSubmitError({
      tone: "error",
      message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  return (
    // 페이지 배경(아주 옅은 회청색) — part-01.md:39 "카드만 흰색". 이 div가 SiteLayout(Header
    // fixed / Outlet / SiteFooter) 안에서 헤더~푸터 사이를 채우는 실제 전체 폭 루트라 배경은
    // 여기 둔다(OnboardingStepShell은 콘텐츠 폭 제한용 컨테이너라 배경을 주면 회색 패널이
    // 떠 보인다). 정확한 HEX가 시안에 없어 기존 surface.04(#F5F5F7) 토큰으로 근사한다(추정).
    <div className="min-h-screen bg-surface-04 pt-16">
      <OnboardingStepShell current={current} total={total}>
        {renderStep(step, { goPrev, goNext, onFinish: handleFinish })}
      </OnboardingStepShell>

      {isCalculating && <OnboardingCalculatingOverlay />}

      {/* submitGoalIntake() 실패 안내 — 오버레이와 달리 화면을 가리지 않는다(422/400/
          네트워크 오류 전부 온보딩 화면에 그대로 머무르며 재시도할 수 있어야 하므로).
          tone 'info'(422, 컷 데이터 준비 중)는 사용자 잘못이 아니라 파랑 계열로,
          'error'(400/500/네트워크)는 빨강 계열로 구분한다. */}
      {submitError && (
        <div
          role="alert"
          className={`fixed inset-x-0 bottom-8 z-55 mx-auto w-[calc(100%-2.5rem)] max-w-md rounded-xl border px-5 py-4 text-center text-app-body font-semibold shadow-[0_18px_45px_rgba(13,27,42,0.15)] ${
            submitError.tone === "error"
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {submitError.message}
        </div>
      )}
    </div>
  );
}

function renderStep(
  step: string | undefined,
  {
    goPrev,
    goNext,
    onFinish,
  }: { goPrev: () => void; goNext: () => void; onFinish: () => void },
) {
  switch (step) {
    case "step-1":
      return <Step1School goNext={goNext} />;
    case "step-2":
      return <Step2UpperUniversity goPrev={goPrev} goNext={goNext} />;
    case "step-3":
      return <Step3LowerUniversity goPrev={goPrev} goNext={goNext} />;
    case "step-4":
      return <Step4Naesin goPrev={goPrev} goNext={goNext} />;
    case "step-5":
      return <Step5MockExam goPrev={goPrev} goNext={goNext} />;
    case "step-6":
      return <Step6StudyHours goPrev={goPrev} goNext={goNext} />;
    case "step-7":
      return <Step7DailySchedule goPrev={goPrev} onFinish={onFinish} />;
    default:
      return null;
  }
}
