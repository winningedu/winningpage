import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import DiagnosisReportView, {
  type DiagnosisReportData,
} from "@/components/renewal/report/DiagnosisReportView";
import { withStoredGradeRaw } from "@/lib/diagnosisReport";
import { fetchDiagnosisReport } from "@/lib/diagnosisReportQueries";
import { supabase } from "@/lib/supabase";

// 학부모가 자녀의 학습진단 리포트 한 건을 여는 뷰어. 진입: ChildDiagnosisReports(목록)의
// "리포트 보기" 링크.
//
// ── 권한 판정 ─────────────────────────────────────────────────────────
// 비로그인은 라우트 가드가 먼저 막는다(mypageRoutes.ts의 requireAuthMiddleware가
// /login?redirect=원래경로로 보낸다). ChildDiagnosisReports.tsx와 동일 —
// fn_parent_children UI 게이트 + diagnosis_reports
// RLS 재확인. 추가로 URL의 studentId와 조회된 리포트의 profile_id가 실제로 같은지도
// 확인한다(아래 profile_id 비교) — 어드민처럼 RLS는 통과하지만 이 화면 문맥(특정 자녀)과
// 안 맞는 attemptId를 URL에 직접 넣었을 때 엉뚱한 학생 리포트가 그 자녀 화면에 뜨는 것을
// 막는다.
//
// ── 본문 ────────────────────────────────────────────────────────────
// DiagnosisReportView는 FreeDiagnosisReport(자기 열람)와 완전히 동일한 프레젠테이션
// 컴포넌트를 그대로 재사용한다 — data 하나만 받는 순수 컴포넌트라 학부모 열람에도 그대로
// 맞는다. studentName은 넘기지 않는다 — data.student.name(저장된 payload)을 그대로
// 신뢰한다(별도 프로필 조회 없음, DiagnosisReportView 헤더 주석 참고). 리포트 자체가
// "뒤로가기·자녀 이름" 같은 셸 없이 완결된 A4 인쇄 문서라 이 페이지는 게이트만 하고
// 그 외에는 아무것도 얹지 않는다(FreeDiagnosisReport와 동일한 원칙).

type ParentChildRow = {
  student_profile_id: string;
  student_name: string;
  link_status: string;
};

export default function ChildDiagnosisReport() {
  const { studentId, attemptId } = useParams();

  // undefined 로딩 / null 권한없음 — ChildReport.tsx·ChildDiagnosisReports.tsx와 동일.
  const [child, setChild] = useState<ParentChildRow | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.rpc("fn_parent_children");
      if (!alive) return;

      if (error) {
        console.error("자녀 조회 실패:", error);
        setChild(null);
        return;
      }

      const found = (data || []).find(
        (row) =>
          row.student_profile_id === studentId &&
          row.link_status === "approved",
      );
      setChild(found || null);
    })();

    return () => {
      alive = false;
    };
  }, [studentId]);

  const [report, setReport] = useState<{ payload: unknown } | null | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!child || !attemptId) return;

    let alive = true;
    setReport(undefined);
    fetchDiagnosisReport(attemptId).then((row) => {
      if (!alive) return;
      // profile_id가 이 화면의 자녀와 다르면(권한 판정 위 주석 참고) 없음으로 취급한다.
      setReport(
        row && row.profile_id === child.student_profile_id
          ? { payload: withStoredGradeRaw(row.payload, row.snapshot) }
          : null,
      );
    });

    return () => {
      alive = false;
    };
  }, [child, attemptId]);

  if (child === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          리포트를 불러오는 중입니다.
        </p>
      </main>
    );
  }

  if (child === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white pt-16">
        <p className="text-[0.9375rem] font-medium text-ink">
          이 학생의 리포트를 볼 수 있는 권한이 없습니다.
        </p>
        <Link
          to="/mypage?tab=children"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[0.875rem] font-semibold text-white transition hover:opacity-90"
        >
          자녀 목록으로
        </Link>
      </main>
    );
  }

  if (report === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          리포트를 불러오는 중입니다.
        </p>
      </main>
    );
  }

  if (report === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white pt-16">
        <p className="text-[0.9375rem] font-medium text-ink">
          리포트를 찾을 수 없습니다.
        </p>
        <Link
          to={`/mypage/children/${studentId}/report/diagnosis`}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[0.875rem] font-semibold text-white transition hover:opacity-90"
        >
          리포트 목록으로
        </Link>
      </main>
    );
  }

  // 리포트 시트 위에 목록으로 돌아가는 길만 얹는다 — 자녀 이름·진단일은 시트 1페이지가
  // 이미 크게 보여주므로 헤딩을 중복하지 않는다. fd-no-print 로 인쇄·PDF 에서는 빠진다.
  return (
    <>
      <div className="fd-no-print mx-auto w-full max-w-content px-5 pt-8 sm:px-8">
        <Link
          to={`/mypage/children/${studentId}/report/diagnosis`}
          className="text-[0.875rem] font-medium text-ink-sub underline underline-offset-4 transition hover:text-ink"
        >
          ← 리포트 목록
        </Link>
      </div>
      <DiagnosisReportView data={report.payload as DiagnosisReportData} />
    </>
  );
}
