import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";
import StoredDiagnosisReport from "@/components/renewal/report/StoredDiagnosisReport";
import { useAuth } from "@/context/AuthProvider";
import {
  type DiagnosisReportRow,
  fetchDiagnosisReport,
} from "@/lib/diagnosisReportQueries";
import { supabase } from "@/lib/supabase";

// 입력 없이 이 URL 로 진입했을 때 되돌려보낼 설문 시작점. 라우트 정본(App.jsx)과 같은 경로다.
const SURVEY_ENTRY_PATH = "/app/learning-diagnosis/survey";

/**
 * 무료진단 결과 리포트 페이지 — `/learning-diagnosis/report/:attemptId`.
 *
 * diagnosis_reports 를 attempt_id 로 읽어 저장된 payload 를 그대로 렌더한다(재조립하지
 * 않는다 — 리포트는 진단 완료일의 문서다). 설문 제출은 서버가 채점해 저장한 뒤 이 URL 로
 * 이동하고, 마이페이지 "결과 리포트 보기"·알림톡 같은 영속 링크도 같은 경로를 쓴다.
 * 저장 행의 schema_version 이 v3 면 ReportV3View, 그 이전 행은 기존 DiagnosisReportView 가
 * 그린다(StoredDiagnosisReport). :attemptId 없는 진입은 설문 시작점으로 보낸다 — 세션 저장분
 * 으로 리포트를 브라우저에서 조립하던 경로는 없앴다.
 *
 * 헤더/푸터는 SiteLayout(App.tsx 의 부모 라우트)이 공급 — 이 페이지에서 렌더하지 않는다.
 */
export default function FreeDiagnosisReport() {
  const { attemptId } = useParams<{ attemptId?: string }>();
  const location = useLocation();
  // SurveyStepShell marks the navigation that follows a successful submit.
  const fromSubmit = location.state?.fromSubmit === true;

  // QA 행 103 — 설문에는 이름 수집 문항이 없어 저장 payload 에 이름이 없을 수 있다. 이 페이지
  // 진입은 로그인 필수(diagnosisRoutes.tsx)라 profiles.name 으로 PDF 파일명을 채운다.
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

  // undefined 로딩 / null 없음(또는 권한없음, RLS가 조용히 빈 결과로 막는다).
  const [row, setRow] = useState<DiagnosisReportRow | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!attemptId) return undefined;
    let alive = true;
    setRow(undefined);
    fetchDiagnosisReport(attemptId).then((found) => {
      if (alive) setRow(found);
    });
    return () => {
      alive = false;
    };
  }, [attemptId]);

  // 904f474c (QA row 341): after seeing the just-submitted report, Back must not return
  // to the survey. The shell replaces the survey entry; this absorbs one Back and keeps the
  // user here. Only a navigation from a submit is held: stored links (my page, alimtalk)
  // keep a normal Back.
  const reportShown = row !== undefined && row !== null;
  useEffect(() => {
    if (!fromSubmit || !reportShown) return undefined;
    window.history.pushState(null, "", window.location.href);
    const trapBack = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", trapBack);
    return () => window.removeEventListener("popstate", trapBack);
  }, [fromSubmit, reportShown]);

  if (!attemptId) return <Navigate to={SURVEY_ENTRY_PATH} replace />;

  if (row === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          리포트를 불러오는 중입니다.
        </p>
      </main>
    );
  }

  if (row === null) {
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

  return <StoredDiagnosisReport row={row} studentName={studentName || null} />;
}
