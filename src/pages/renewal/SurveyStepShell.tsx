import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import ServiceBlockedNotice from "@/components/service/ServiceBlockedNotice";
import { site } from "@/config/site";
import { useAuthOptional } from "@/context/AuthProvider";
// B-1(2026-08-11 확정) — q15 캐스케이드 fetch 상태(옵션 5벌 + loading + error)를 이 셸이 소유한다.
import {
  type CascadeValue,
  useAdmissionCascade,
} from "@/hooks/useAdmissionCascade";
import {
  type AdmissionTarget,
  type ValidationError,
  validateAnswers,
} from "@/lib/diagnosis-v3";
// 학습진단 유료 게이팅(20260821, 이용 요금 구조 최종본 20260806) — 진입 판정(마운트 시
// 1회)과 제출 소진(마지막 스텝 CTA) 둘 다 이 모듈을 거친다. 판정 정본은 서버이고,
// 여기서는 호출·fail-open 흡수·리다이렉트만 한다.
import {
  checkDiagnosisAccess,
  consumeDiagnosisAttempt,
} from "@/lib/diagnosisAccess";
// 이어 답하기 초안(사 #44, 스쿨멘토 전용). 이 기기 localStorage 에 사용자별로 저장한다.
import { clearDraft, loadDraft, saveDraft } from "@/lib/diagnosisDraft";
// v3 server scoring (judge-report 3-2): the browser sends answers and the
// server scores and stores the report; nothing is scored or saved here.
import {
  type AdmissionCascadeValue,
  resolveAdmissionTarget,
  submitDiagnosisV3,
} from "@/lib/diagnosisSubmitApi";
// sql/72(2026-08-13 확정) — 문항 제목/안내문구/선택지 라벨/리커트 문장 어드민 오버라이드.
// mount 1회 fetch, 실패·0행이면 빈 Map(= 정적 문구 그대로) — MentorFaq.jsx 의 키 단위 폴백과 같은 계약이다.
import { fetchSurveyCopyOverrides } from "@/lib/diagnosisSurveyCopyOverrides";
import { kstYMD } from "@/lib/goal/calc/virtualDate";
// 이용개시 시작 로그(programEntry.ts) — 진입 게이트가 allowed를 확인한 직후 기록한다.
import { markProgramEntry } from "@/lib/programEntry";
import {
  applyAnswer,
  firstErrorScreen,
  getStepPath,
  isCascadeComplete,
  reportPathFor,
  SURVEY_FIRST_STEP_PATH,
  SURVEY_V3_STEPS,
  screenProblems,
  toSubmitAnswers,
} from "@/lib/renewalSurvey";
import type { TenantBlockReason } from "@/lib/tenantBlock";

const SURVEY_BASE_PATH = SURVEY_FIRST_STEP_PATH.replace(/\/1$/, "");

/**
 * 설문 5스텝 공통 셸. `/free-diagnosis/survey` 부모 라우트의 element 이므로
 * 자식 라우트(`/1`~`/5`, `/preview`)만 바뀔 때 인스턴스가 유지된다 —
 * answers 가 스텝 간 이동에서 보존되는 근거다(새로고침 시 소실은 1차 사양).
 *
 * <Outlet> 은 gap-perf-inset 컬럼의 직속 자식이어야 한다.
 * 자식이 반환하는 형제(카드 스택 + 하단 배너)가 이 갭을 그대로 받는다.
 */
export default function SurveyStepShell() {
  const navigate = useNavigate();
  // 진입 시점의 경로. 사용자가 나중에 직접 1단계로 돌아가도 초안 복원 이동이 다시 일어나지 않게 한다.
  const { pathname } = useLocation();
  const entryPathRef = useRef(pathname);
  const userId = useAuthOptional()?.userId ?? null;
  const resumeEnabled = site.features.diagnosisResume && !!userId;
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  // q23 shuffle seed (기능요구명세서 row 31): one per survey, kept in the draft
  // so a resumed survey shows the same order.
  const [seed, setSeed] = useState<string>(() => crypto.randomUUID());
  // KST calendar date the survey runs on: q4 default and q13 date bounds.
  // Submit moves it to the submit day, the date the server scores with.
  const [diagnosedAt, setDiagnosedAt] = useState(() => kstYMD());
  const [surveyCopyOverrides, setSurveyCopyOverrides] = useState<
    Map<string, unknown>
  >(() => new Map());
  // 제출 플로우당 1회만 생성해 재사용한다(더블클릭 시 같은 attemptId로 재호출 →
  // 서버가 already_recorded로 멱등 처리). 셸 인스턴스가 answers와 같은 생애주기를
  // 공유하므로(새로고침 시 함께 소실 — 셸 상단 주석 참고) ref 하나로 충분하다.
  const diagnosisAttemptIdRef = useRef<string | null>(null);

  // 스쿨멘토는 이용 거부를 결제 이동이 아니라 기관 사유 안내로 보인다(결정 99).
  // accessCheck 는 소속코드 입력 뒤 진입 판정을 다시 돌리는 트리거다.
  const [tenantBlock, setTenantBlock] = useState<{
    reason: TenantBlockReason | null;
  } | null>(null);
  const [accessCheck, setAccessCheck] = useState(0);
  // 스쿨멘토에서 진입 판정 자체를 못 받은 상태. 거부가 아니라 다시 시도하게 한다.
  const [accessFailed, setAccessFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSurveyCopyOverrides().then((map) => {
      if (alive) setSurveyCopyOverrides(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 진입 게이트 — 무료 1회 미사용이거나 이용권이 있으면 통과. 서버 판정 불가는
  // fail-open(진입 허용, checkDiagnosisAccess 내부 주석 참고).
  // biome-ignore lint/correctness/useExhaustiveDependencies: accessCheck 는 effect 안에서 읽지 않는 재판정 트리거 전용 값이다.
  useEffect(() => {
    let alive = true;
    checkDiagnosisAccess().then((result) => {
      if (!alive) return;
      if (result.checkFailed) {
        setAccessFailed(true);
        return;
      }
      if (result.allowed) {
        // 무료 1회 사용자(부여된 이용권 없음)는 서버가 0행 UPDATE로 무해하게
        // 처리한다(fn_mark_program_entry는 program_access_grants 행이 있을 때만
        // 기록한다 — programEntry.ts 상단 주석 참고).
        markProgramEntry("diagnose");
        return;
      }
      if (site.features.tenantServiceGate) {
        setTenantBlock({ reason: result.tenantReason });
        return;
      }
      // 카피 톤은 QA 행 27 안내문("회원가입을 하면 전문적인 학생 학습진단 리포트를
      // 받아보실 수 있습니다")과 요금표(20260806)의 "회원가입 시 1회 무료" 규정을 따른다.
      window.alert(
        "학습진단은 회원가입 시 1회 무료로 제공됩니다. 이미 이용하신 경우 이용권을 구매하시면 학습진단 리포트를 다시 받아보실 수 있습니다.",
      );
      navigate("/pricing", { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [navigate, accessCheck]);

  // q1 fills the q4 default and resets track-specific answers (applyAnswer).
  const setAnswer = useCallback(
    (questionId: string, nextValue: unknown) => {
      setAnswers((prev) =>
        applyAnswer(prev, questionId, nextValue, diagnosedAt),
      );
    },
    [diagnosedAt],
  );

  // 이어 답하기(사 #44): 이 사용자의 초안이 있으면 답을 채운다. 막힌 사용자는 설문 화면이
  // 렌더되지 않아 채워도 보이지 않는다.
  useEffect(() => {
    if (!resumeEnabled || !userId) return;
    const draft = loadDraft(userId);
    if (!draft) return;
    setAnswers((prev) => ({ ...draft.answers, ...prev }));
    setSeed(draft.seed);
    // 1단계로 들어왔으면 답이 끝난 단계를 건너뛰어 첫 미완료 단계에서 이어 답하게 한다.
    // 인덱스 진입은 자식 라우트가 1단계로 리다이렉트하므로 둘 다 대상이다.
    const entry = entryPathRef.current;
    if (entry !== SURVEY_FIRST_STEP_PATH && entry !== SURVEY_BASE_PATH) return;
    for (let step = 1; step <= SURVEY_V3_STEPS; step++) {
      if (screenProblems(step, draft.answers, diagnosedAt).length === 0)
        continue;
      if (step > 1) navigate(getStepPath(step), { replace: true });
      return;
    }
  }, [resumeEnabled, userId, navigate, diagnosedAt]);

  // 이어 답하기(사 #44): 답이 바뀔 때마다 이 기기에 저장한다. 빈 답은 기존 초안을 덮지 않는다.
  useEffect(() => {
    if (!resumeEnabled || !userId) return;
    if (Object.keys(answers).length === 0) return;
    saveDraft(userId, { answers, seed });
  }, [answers, seed, resumeEnabled, userId]);

  // B-1 — q15(목표 대학 입결 조회) 캐스케이드 옵션·컷 fetch 상태. answers.q15 가 바뀔 때마다
  // 훅 내부에서 대학→학과→전형유형/세부전형명/반영교과 순으로 필요한 조회만 다시 tap 한다.
  const admissionCascade = useAdmissionCascade(
    answers.q15 as CascadeValue | undefined,
  );

  /**
   * Submit (v3): validate, consume, then POST /api/diagnosis/submit and open
   * the stored report. Resolves the server payload, or null when anything
   * stopped the flow (the caller then stays on the survey).
   *
   * The answers are checked with validateAnswers before consume, so a
   * malformed answer set never uses up an attempt. consume keeps its
   * idempotent attemptId contract: a failed submit retried in the same flow
   * reuses the attemptId, and the server returns the stored report for it.
   */
  const showAnswerProblem = useCallback(
    (errors: readonly ValidationError[]) => {
      window.alert("응답하지 않은 문항이 있어요. 문항을 다시 확인해 주세요.");
      navigate(getStepPath(firstErrorScreen(errors)));
    },
    [navigate],
  );

  const submitDiagnosis = useCallback(async () => {
    let target: AdmissionTarget | null = null;
    if (isCascadeComplete(answers.q15)) {
      const resolved = await resolveAdmissionTarget(
        answers.q15 as AdmissionCascadeValue,
      );
      if (!resolved.ok) {
        window.alert(
          "목표 대학 입결 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        );
        return null;
      }
      target = resolved.target;
    }
    const submitAnswers = toSubmitAnswers(answers, target);
    // The server checks the answers against the submit day (KST), so a survey
    // that crossed midnight is checked again before consume (16 r30 dates).
    const today = kstYMD();
    setDiagnosedAt(today);
    const checked = validateAnswers(submitAnswers, today);
    if (!checked.ok) {
      showAnswerProblem(checked.errors);
      return null;
    }

    if (!diagnosisAttemptIdRef.current) {
      diagnosisAttemptIdRef.current = crypto.randomUUID();
    }
    const attemptId = diagnosisAttemptIdRef.current;
    const consumeResult = await consumeDiagnosisAttempt(attemptId);
    if (
      consumeResult.outcome === "check-failed" ||
      consumeResult.outcome === "fail-open"
    ) {
      // Without a recorded attempt the server cannot store a report (404
      // ATTEMPT_NOT_FOUND), so v3 stops on both sites. Retrying with the same
      // attemptId is idempotent.
      window.alert(
        "이용 횟수를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
      return null;
    }
    if (consumeResult.outcome === "blocked") {
      if (site.features.tenantServiceGate) {
        // 충돌은 서비스 막힘이 아니다. 서버 메시지를 보이고 다음 시도에 새 attemptId 를 쓴다.
        if (consumeResult.code === "ATTEMPT_CONFLICT") {
          window.alert(consumeResult.message);
          diagnosisAttemptIdRef.current = null;
          return null;
        }
        setTenantBlock({ reason: consumeResult.tenantReason });
        return null;
      }
      // 이용권 계열 거부 3종은 사용자 입장에서 같은 상황(무료 1회 소진 + 쓸 수 있는
      // 이용권 없음)이라 같은 안내문으로 합친다 — 카피 톤은 진입 게이트와 동일(QA 행 27).
      // ATTEMPT_CONFLICT 등 나머지는 서버 메시지를 그대로 보여준다.
      const entitlementCodes = [
        "QUOTA_EXHAUSTED",
        "NO_ENTITLEMENT",
        "ENTITLEMENT_EXPIRED",
      ];
      window.alert(
        entitlementCodes.includes(consumeResult.code)
          ? "회원가입 무료 1회를 이미 이용하셨습니다. 이용권을 구매하시면 학습진단 리포트를 다시 받아보실 수 있습니다."
          : consumeResult.message,
      );
      navigate("/pricing", { replace: true });
      return null;
    }

    const result = await submitDiagnosisV3({
      attemptId,
      answers: submitAnswers,
    });
    if (!result.ok) {
      if (result.reason === "no-session") {
        window.alert("로그인 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
        navigate(`/login?redirect=${encodeURIComponent(pathname)}`);
        return null;
      }
      if (result.reason === "rejected" && result.errors) {
        showAnswerProblem(result.errors);
        return null;
      }
      // Other 4xx answers repeat on retry, so the server message is shown as
      // is (like consume's blocked codes); retry is for network and 5xx only.
      if (
        result.reason === "rejected" &&
        result.status < 500 &&
        result.message
      ) {
        window.alert(result.message);
        return null;
      }
      window.alert("진단 결과를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      return null;
    }
    // 이어 답하기(사 #44): 제출이 끝났으니 초안을 지운다.
    if (resumeEnabled && userId) clearDraft(userId);
    // Replace the survey entry so Back cannot re-enter the submitted survey; the flag
    // tells the report page to hold the user there (see FreeDiagnosisReport).
    navigate(reportPathFor(attemptId), {
      replace: true,
      state: { fromSubmit: true },
    });
    return result.payload;
  }, [answers, navigate, pathname, userId, resumeEnabled, showAnswerProblem]);

  if (accessFailed) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[#FBFAFA] px-5 pt-16">
        <div
          role="status"
          className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-[#0D1B2A]/10 bg-white px-6 py-8 text-center"
        >
          <p className="text-sm font-extrabold text-[#0D1B2A]">
            이용 가능 여부를 확인하지 못했어요.
          </p>
          <button
            type="button"
            onClick={() => {
              setAccessFailed(false);
              setAccessCheck((n) => n + 1);
            }}
            className="rounded-full bg-[#0D1B2A] px-5 py-2 text-xs font-extrabold text-white"
          >
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  if (tenantBlock) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[#FBFAFA] px-5 pt-16">
        <ServiceBlockedNotice
          reason={tenantBlock.reason}
          onJoined={() => {
            setTenantBlock(null);
            setAccessCheck((n) => n + 1);
          }}
          className="max-w-sm"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-[#FBFAFA] pt-16">
      {/* 상단 패딩 56px(3.5rem)은 이 section이 소유한다 — <main>은 pt-16으로 헤더만 비운다. */}
      <section className="w-full pt-14 pb-16 sm:pb-20 lg:pb-30">
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          {/* 컬럼 스택 gap 60 — 타이틀 블록 / 카드 스택 / 하단 배너가 형제로 이 갭을 공유한다. */}
          <div className="mx-auto flex w-full max-w-content flex-col items-start gap-perf-inset">
            <div className="flex w-full max-w-perf-bubble flex-col items-start gap-5 text-ink">
              <h1 className="break-keep text-[1.75rem] font-bold leading-[1.4] tracking-[-0.02em] sm:text-[2.25rem] lg:text-[2.75rem]">
                학습진단으로
                <br />
                나에게 딱 맞는 서비스를 추천받아요
              </h1>
              <p className="break-keep text-lg font-normal leading-[1.3] sm:text-2xl">
                {/* 기능요구명세서 row 3: 21개 문항 */}
                21개 문항을 답하면 가장 먼저 필요한 서비스를 추천해 드려요
              </p>
            </div>

            <Outlet
              context={{
                answers,
                setAnswer,
                submitDiagnosis,
                cascadeLevels: admissionCascade.levels,
                surveyCopyOverrides,
                diagnosedAt,
                seed,
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
