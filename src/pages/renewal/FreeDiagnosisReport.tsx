import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";
import DiagnosisReportView, {
  type DiagnosisReportData,
} from "@/components/renewal/report/DiagnosisReportView";
import { useAuth } from "@/context/AuthProvider";
// 저장 키·스키마 검증은 storage 모듈이 소유한다 — 저장 주체(설문 CTA)와 읽기 주체(이 페이지)가
// 다른 파일이라 리터럴을 양쪽에 두면 조용히 갈라진다.
import { loadDiagnosisInput } from "@/lib/diagnosisInputStorage";
import { withStoredGradeRaw } from "@/lib/diagnosisReport";
import { ensureDiagnosisReportSaved } from "@/lib/diagnosisReportApi";
import { buildReportFromInput } from "@/lib/diagnosisReportBuild";
import { fetchDiagnosisReport } from "@/lib/diagnosisReportQueries";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";

// 입력 없이 이 URL 로 진입했을 때 되돌려보낼 설문 시작점. 라우트 정본(App.jsx)과 같은 경로다.
const SURVEY_ENTRY_PATH = "/app/learning-diagnosis/survey";

// loadDiagnosisInput()/buildReport()의 JSDoc 반환 타입({object|null}/{object})이 이 파일이
// 읽는 필드를 담지 않아 여기서만 쓰는 최소 타입으로 좁혀 둔다(두 파일 다 이 배치 범위 밖).
type DiagnosisInput = {
  admissionCuts?: {
    cut50: number | null;
    cut70: number | null;
    finalAvg: number | null;
  } | null;
  admissionCutsError?: boolean;
  admissionMeta?: { year: string | number | null };
  // meta.attemptId 는 제출 시 normalizeAnswers 가 채운다(diagnosisScoring.ts). 구 페이로드라
  // 없으면 재시도 자체를 하지 않는다.
  meta?: {
    attemptId?: string | null;
    schemaVersion?: string;
    diagnosedAt?: string | null;
  };
};

/**
 * 무료진단 결과 리포트 페이지 — 데이터 소스 셸.
 *
 * 두 경로를 하나의 컴포넌트가 맡는다:
 *   1. `/learning-diagnosis/report/:attemptId` — DB 경로. diagnosis_reports를 그대로 읽어
 *      저장된 payload를 렌더한다(재조립하지 않는다 — 리포트는 진단 완료일의 문서다).
 *      마이페이지 "결과 리포트 보기"(다른 기기·다른 탭 포함)와 알림톡 등 영속 링크가 이 경로를 쓴다.
 *   2. `/learning-diagnosis/report` — 세션 경로(기존). router state 또는 sessionStorage에서
 *      DiagnosisInput을 읽어 buildReport()로 그 자리에서 조립한다. 채점 실행 위치는 이
 *      페이지 하나다(§7.4.2) — 제출 시점에는 normalizeAnswers() 결과만 저장하고 이동하므로,
 *      새로고침·직접 URL 진입·프리뷰가 전부 같은 경로 하나를 탄다. 무입력·손상 페이로드는
 *      설문 시작점으로 리다이렉트한다(가짜 리포트를 본인 결과로 오인하는 것을 원천 차단,
 *      2026-08-13 확정 — 예시 픽스처·샘플 배너·인쇄 워터마크 경로는 그때 전부 제거됐다).
 *      meta.attemptId가 있으면(설문 제출 직후 저장이 아직 안 됐을 수 있는 창) 렌더와 별개로
 *      ensureDiagnosisReportSaved를 1회 fire-and-forget으로 재시도한다 — 실패해도 열람은
 *      막지 않는다(diagnosisReportApi.ts 헤더 주석).
 *
 * 렌더 본문(A4 시트·부록·인쇄/PDF 버튼·모바일 안내)은 DiagnosisReportView가 전담한다 — 두
 * 경로가 완전히 같은 문서를 보여주므로 조립 방식만 갈리고 그리는 방식은 하나다.
 *
 * 헤더/푸터는 SiteLayout(App.tsx 의 부모 라우트)이 공급 — 이 페이지에서 렌더하지 않는다.
 */
export default function FreeDiagnosisReport() {
  const location = useLocation();
  const { attemptId } = useParams<{ attemptId?: string }>();

  // QA 행 103 — 설문에는 이름 수집 문항이 없어(StudentInfoBlock.tsx:38 주석) data.student.name이
  // 상시 null이다. 이 페이지 진입은 이제 로그인 필수(비회원 가드, diagnosisRoutes.tsx)라
  // profiles.name으로 대신 채운다 — PaymentsTab.tsx와 동일한 조회 패턴. 두 경로(세션/DB) 모두
  // "내가 보는 내 리포트"라 본인 프로필 이름을 그대로 쓴다.
  const [studentName, setStudentName] = useState("");
  // 세션은 AuthProvider(전역 단일 구독)에서 읽는다(명세 B-3 §4).
  const { userId: uid } = useAuth();

  useEffect(() => {
    let alive = true;
    if (!uid) return undefined;

    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", uid)
        .maybeSingle();

      if (!alive) return;
      setStudentName(profile?.name || "");
    })();

    return () => {
      alive = false;
    };
  }, [uid]);

  // DB 경로 — undefined 로딩 / null 없음(또는 권한없음, RLS가 조용히 빈 결과로 막는다).
  const [dbReport, setDbReport] = useState<
    | {
        payload: Json;
      }
    | null
    | undefined
  >(attemptId ? undefined : null);

  useEffect(() => {
    if (!attemptId) {
      setDbReport(null);
      return undefined;
    }
    let alive = true;
    setDbReport(undefined);
    fetchDiagnosisReport(attemptId).then((row) => {
      if (!alive) return;
      setDbReport(
        row
          ? {
              payload: withStoredGradeRaw(row.payload, row.snapshot) as Json,
            }
          : null,
      );
    });
    return () => {
      alive = false;
    };
  }, [attemptId]);

  // 세션 경로 — :attemptId가 없을 때만 조립한다(DB 경로에서는 재조립하지 않는다).
  const sessionResult = useMemo(() => {
    if (attemptId) return null;
    const input = loadDiagnosisInput(location.state);
    if (!input) return null; // 무입력 → 가드(아래에서 리다이렉트)
    try {
      // 조립 규칙(입결 컷·cutsError·admissionMeta → BuildReportCtx)은 제출 시 저장 경로
      // (SurveyStepShell)와 반드시 같아야 한다 — 저장된 payload 와 화면이 어긋나면 안 되므로
      // 한 헬퍼(diagnosisReportBuild.buildReportFromInput)로 모았다. 배경 주석은 그 파일 참고.
      const typedInput = input as DiagnosisInput;
      const report = buildReportFromInput(input) as DiagnosisReportData;
      return { input: typedInput, report };
    } catch (error) {
      // 스키마 버전은 맞지만 내부가 손상된 페이로드(수기 편집·부분 저장). 흰 화면이나 가짜
      // 리포트 대신 설문으로 돌려보낸다 — null 을 반환하면 아래 가드가 리다이렉트한다.
      if (import.meta.env?.DEV)
        console.error(
          "[free-diagnosis] 리포트 조립 실패 — 설문으로 리다이렉트한다",
          error,
        );
      return null;
    }
  }, [location.state, attemptId]);

  // 저장 재시도(fire-and-forget, 1회) — 세션 경로 전용. DB 경로는 이미 저장된 문서를
  // 그대로 보는 것이라 재저장할 이유가 없다. 저장 재시도는 부가 기능이라 실패해도 리포트
  // 열람 자체(이미 sessionStorage에서 조립한 화면)는 막지 않는다.
  useEffect(() => {
    if (attemptId) return undefined;
    if (!sessionResult) return undefined;

    const meta = sessionResult.input.meta;
    if (!meta?.attemptId || meta.schemaVersion == null || !meta.diagnosedAt)
      return undefined;
    const { attemptId: metaAttemptId, schemaVersion, diagnosedAt } = meta;

    (async () => {
      try {
        await ensureDiagnosisReportSaved({
          attemptId: metaAttemptId,
          snapshot: sessionResult.input as unknown as Json,
          payload: sessionResult.report as unknown as Json,
          schemaVersion,
          diagnosedAt,
        });
      } catch (error) {
        if (import.meta.env?.DEV)
          console.warn(
            "[free-diagnosis] 리포트 저장 재시도 실패(무시):",
            error,
          );
      }
    })();

    return undefined;
  }, [sessionResult, attemptId]);

  // QA 행341 — 리포트 도달 후 브라우저 뒤로가기로 설문 스텝(응답을 다시 고를 수 있는 화면)에
  // 재진입할 수 있었다. 셸(SurveyStepShell)의 answers는 컴포넌트 상태라 뒤로가기로 되짚어가도
  // 이전 응답이 복원되지는 않지만, 여전히 "제출을 마친 설문을 다시 채워 넣을 수 있는 화면"으로
  // 돌아가지는 것 자체가 문제다. DB 경로(:attemptId)는 설문 흐름 밖에서 도달하는 링크라 이
  // 트랩이 불필요하다 — 세션 경로에서만 건다.
  //
  // 설문 스텝에서 "이미 제출된 세션이면 리포트로 forward redirect"하는 방식 대신 이 페이지에서
  // popstate를 가드하는 쪽을 택했다 — sessionStorage(loadDiagnosisInput)는 설문을 다시 시작해
  // 재진단(이용권 재구매 등)하는 정상 플로우에서도 이전 진단 결과를 계속 들고 있으므로, 그 값의
  // 존재만으로 설문 진입을 막으면 정당한 재진단까지 리포트로 되튕긴다. 반면 popstate 가드는
  // "리포트를 실제로 본 이후의 뒤로가기"만 좁게 겨눈다. 과한 히스토리 조작(추가 페이지 이동 등)
  // 없이 현재 URL을 다시 push해 그 자리에 머무르게만 한다.
  useEffect(() => {
    if (attemptId) return undefined;
    if (!sessionResult) return undefined;
    window.history.pushState(null, "", window.location.href);
    const trapBack = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", trapBack);
    return () => window.removeEventListener("popstate", trapBack);
  }, [sessionResult, attemptId]);

  if (attemptId) {
    if (dbReport === undefined) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-white pt-16">
          <p className="text-[0.875rem] font-medium text-ink-sub">
            리포트를 불러오는 중입니다.
          </p>
        </main>
      );
    }

    if (dbReport === null) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white pt-16">
          <p className="text-[0.9375rem] font-medium text-ink">
            리포트를 찾을 수 없거나 볼 수 있는 권한이 없습니다.
          </p>
          <Link
            to={SURVEY_ENTRY_PATH}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[0.875rem] font-semibold text-white transition hover:opacity-90"
          >
            학습진단 설문 시작하기
          </Link>
        </main>
      );
    }

    return (
      <DiagnosisReportView
        data={dbReport.payload as DiagnosisReportData}
        studentName={studentName || null}
      />
    );
  }

  // 무입력·손상 페이로드는 설문 시작점으로 돌려보낸다(가짜 리포트를 본인 결과로 오인하는 것을 원천 차단).
  if (!sessionResult) {
    return <Navigate to={SURVEY_ENTRY_PATH} replace />;
  }

  return (
    <DiagnosisReportView
      data={sessionResult.report}
      studentName={studentName || null}
    />
  );
}
