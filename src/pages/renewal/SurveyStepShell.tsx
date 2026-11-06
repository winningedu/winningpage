import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import ServiceBlockedNotice from "@/components/service/ServiceBlockedNotice";
import { site } from "@/config/site";
// QA 행348(2026-09-02) — q1(학년) 응답으로 q4(등급 체계)를 자동 결정한다(카드 자체는 화면에서 제거).
import { getGradeSystemLabelForGradeLevel } from "@/data/renewalSurveyQuestions";
// B-1(2026-08-11 확정) — q15 캐스케이드 fetch 상태(옵션 5벌 + loading + error)를 이 셸이 소유한다.
import {
  type CascadeValue,
  useAdmissionCascade,
} from "@/hooks/useAdmissionCascade";
// 학습진단 유료 게이팅(20260821, 이용 요금 구조 최종본 20260806) — 진입 판정(마운트 시
// 1회)과 제출 소진(마지막 스텝 CTA) 둘 다 이 모듈을 거친다. 판정 정본은 서버이고,
// 여기서는 호출·fail-open 흡수·리다이렉트만 한다.
import {
  checkDiagnosisAccess,
  consumeDiagnosisAttempt,
} from "@/lib/diagnosisAccess";
// 리포트 '페이지'가 아니라 storage 모듈만 import 한다 — 페이지를 가져오면 인쇄 CSS 가 설문 번들로 끌려온다.
// 저장 키·직렬화·스키마 검증의 정의처도 그 모듈 하나다(여기에 리터럴을 두면 읽기 쪽과 갈라진다).
import { submitDiagnosisAnswers } from "@/lib/diagnosisInputStorage";
// 리포트 영속화(diagnosis_reports, QA 행210) — buildReportFromInput 도 diagnosisReportBuild.ts
// 하나뿐인 정본이다(FreeDiagnosisReport.tsx 의 ctx 조립 로직과 동일 규칙, 그 페이지는 아직
// 이 헬퍼로 교체되지 않았다). saveDiagnosisReport 는 실패해도 던지지 않는다 — 저장 실패는
// 열람(sessionStorage 경로)을 막지 않고, 리포트 페이지의 ensureDiagnosisReportSaved 가
// 재시도한다.
import { saveDiagnosisReport } from "@/lib/diagnosisReportApi";
import { buildReportFromInput } from "@/lib/diagnosisReportBuild";
// sql/72(2026-08-13 확정) — 문항 제목/안내문구/선택지 라벨/리커트 문장 어드민 오버라이드.
// mount 1회 fetch, 실패·0행이면 빈 Map(= 정적 문구 그대로) — MentorFaq.jsx 의 키 단위 폴백과 같은 계약이다.
import { fetchSurveyCopyOverrides } from "@/lib/diagnosisSurveyCopyOverrides";
// 이용개시 시작 로그(programEntry.ts) — 진입 게이트가 allowed를 확인한 직후 기록한다.
import { markProgramEntry } from "@/lib/programEntry";
import type { TenantBlockReason } from "@/lib/tenantBlock";
import type { Json } from "@/types/database.types";
// Q-01(2026-08-11 확정) — 제출 시점에 로그인 학생 이름을 조회한다. 비로그인·조회 실패는 null.
import { fetchLoggedInStudentName } from "./diagnosisStudentName";

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
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
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

  // QA 행348(2026-09-02) — q4(등급 체계) 카드를 없애고 q1(학년) 응답으로 자동 결정한다.
  // q4 는 여전히 answers 맵에 라벨 문자열로 저장된다 — q6 입력 규격(GRADE_SYSTEM_INPUT_RULES)과
  // 채점(diagnosisScoring.normalizeAnswers)이 그 계약을 그대로 기대하기 때문이다(양쪽 다 무수정).
  const setAnswer = useCallback((questionId: string, nextValue: unknown) => {
    setAnswers((prev) => {
      if (questionId !== "q1") return { ...prev, [questionId]: nextValue };
      const gradeSystemLabel = getGradeSystemLabelForGradeLevel(
        nextValue as string,
      );
      return {
        ...prev,
        [questionId]: nextValue,
        ...(gradeSystemLabel ? { q4: gradeSystemLabel } : {}),
      };
    });
  }, []);

  // B-1 — q15(목표 대학 입결 조회) 캐스케이드 옵션·컷 fetch 상태. answers.q15 가 바뀔 때마다
  // 훅 내부에서 대학→학과→전형유형/세부전형명/반영교과 순으로 필요한 조회만 다시 tap 한다.
  const admissionCascade = useAdmissionCascade(
    answers.q15 as CascadeValue | undefined,
  );
  const { awaitCuts } = admissionCascade;

  /**
   * 제출 — answers 를 DiagnosisInput 으로 정규화해 저장하고 그 값을 돌려준다(§7.4.2).
   *
   * 감싸는 이유는 소유권이다. answers 를 들고 있는 것이 이 셸이고, 리포트로 이동하는 순간
   * 이 인스턴스가 언마운트되며 응답이 사라진다. 스텝 페이지와 preview 가 각자
   * `submitDiagnosisAnswers(answers)` 를 부르면 제출 진입점이 두 곳으로 갈라져,
   * 한쪽만 고치면 그 경로로 들어온 진단만 조용히 저장되지 않는다.
   *
   * async 인 이유는 Q-01 이다 — 이름은 폼에 없고 제출 시점에 세션에서 조회한다. 입결 컷(B-1)은
   * 스텝5 캐스케이드가 선택 시점에 이미 조회해 둔 값을 그대로 싣는다 — 제출 시점에 다시
   * 조회하지 않는다. 단, **선택은 됐지만 조회가 아직 안 끝난 경합 구간(G-1a)**이 있을 수 있어
   * cuts/cutsError 를 직접 읽지 않고 awaitCuts() 로 그 경합이 끝나길 기다린 뒤 확정값을 쓴다.
   *
   * 게이팅 소진(20260821) — 정규화·저장보다 **먼저** consumeDiagnosisAttempt 를 부른다.
   * 서버가 명시적으로 거부하면(quota_exhausted 등) null 을 돌려주고 /pricing 으로 보낸다 —
   * 호출부(SurveyStepPage/SurveyPreview)는 null 이면 리포트로 이동하지 않아야 한다.
   * 네트워크 실패는 fail-open이라 계속 진행한다(diagnosisAccess.ts 내부 주석 참고).
   */
  const submitDiagnosis = useCallback(async () => {
    if (!diagnosisAttemptIdRef.current) {
      diagnosisAttemptIdRef.current = crypto.randomUUID();
    }
    const consumeResult = await consumeDiagnosisAttempt(
      diagnosisAttemptIdRef.current,
    );
    if (consumeResult.outcome === "check-failed") {
      // 스쿨멘토는 소진 판정을 못 받으면 저장하지 않는다. 같은 attemptId 로 다시 시도하면 멱등이다.
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

    const [name, admissionResolved] = await Promise.all([
      fetchLoggedInStudentName(),
      // G-1a — cascadeComplete 직후 fetch 가 아직 안 끝난 채로 제출하면 cuts=null·cutsError=false
      // (둘 다 초기값)로 읽혀 '조회 미확정'이 '자료 영구 부재'로 낙관 처리된다(3회 중 2회 재현
      // 실측). awaitCuts() 가 진행 중인 조회를 기다린 뒤 그 순간의 확정 결과를 직접 돌려준다.
      awaitCuts(),
    ]);
    const attemptId = diagnosisAttemptIdRef.current;
    const payload = submitDiagnosisAnswers(answers, {
      name,
      // submitDiagnosisAnswers(범위 밖 파일)의 admissionCuts는 Record<string, unknown> | null 시그니처다.
      // useAdmissionCascade의 CutsData(범위 밖 파일)는 필드가 이미 알려진 값이라 값 타입은 항상 unknown의 부분집합.
      admissionCuts: admissionResolved.cuts as Record<string, unknown> | null,
      admissionMeta: admissionResolved.cuts
        ? { year: admissionResolved.cuts.year }
        : null,
      // F-22 — 참조 비교(ADMISSION_FETCH_ERROR)로 판정해 올린 불리언. 이 한 줄이 없으면
      // '조회 실패'가 payload 에서 통째로 사라져 리포트가 일시 오류를 '자료 영구 부재'로 단정한다.
      admissionCutsError: admissionResolved.cutsError,
      attemptId,
    });

    // 리포트 영속화 — diagnosedAt 은 항상 이 함수(submitDiagnosisAnswers)가 방금 new
    // Date().toISOString() 으로 채웠으므로 실제로는 항상 존재한다(엔진 자체는 시계를 읽지
    // 않아 타입은 string|null 로 넓게 잡혀 있다). null 이면(있을 수 없는 손상 상태) 저장을
    // 건너뛴다 — 저장 실패와 동일하게 열람 경로는 막지 않는다.
    if (attemptId && payload.meta.diagnosedAt) {
      const report = buildReportFromInput(payload);
      const saveResult = await saveDiagnosisReport({
        attemptId,
        snapshot: payload as unknown as Json,
        payload: report as unknown as Json,
        schemaVersion: payload.meta.schemaVersion,
        diagnosedAt: payload.meta.diagnosedAt,
      });
      if (!saveResult.ok) {
        console.warn(
          "[SurveyStepShell] 학습진단 리포트 저장 실패 — 열람은 sessionStorage 경로로 계속 가능:",
          saveResult.reason,
        );
      }
    }

    return payload;
    // awaitCuts 는 훅 안에서 useCallback(빈 deps)로 안정된 참조라 이 콜백도 answers 가 바뀔 때만
    // 재생성된다 — admissionCascade 객체 전체를 deps 에 넣으면 매 렌더 재생성되어 의미가 없다.
  }, [answers, awaitCuts, navigate]);

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
                17개 문항을 답하면 가장 먼저 필요한 서비스를 추천해 드려요
              </p>
            </div>

            <Outlet
              context={{
                answers,
                setAnswer,
                submitDiagnosis,
                cascadeLevels: admissionCascade.levels,
                surveyCopyOverrides,
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
