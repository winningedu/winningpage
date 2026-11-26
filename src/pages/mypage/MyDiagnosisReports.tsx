import { useEffect, useState } from "react";
import { Link } from "react-router";
import DiagnosisReportList from "@/components/mypage/DiagnosisReportList";
import { useAuth } from "@/context/AuthProvider";
import {
  type DiagnosisReportListItem,
  listDiagnosisReports,
} from "@/lib/diagnosisReportQueries";

// 학생이 본인의 학습진단 리포트 회차 목록을 여는 화면(QA 2026-11-26 6-1: 유료 서비스라
// 탈퇴 전까지 모든 회차를 볼 수 있어야 한다). 진입: 마이페이지 나의 서비스의 학습진단 카드
// "결과 리포트 보기"(리포트가 2건 이상일 때). 비로그인은 라우트 가드(requireAuthMiddleware)가
// 막고, diagnosis_reports RLS 가 본인 행만 돌려준다.
export default function MyDiagnosisReports() {
  const { userId } = useAuth();
  const [reports, setReports] = useState<DiagnosisReportListItem[] | null>(
    null,
  );

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    listDiagnosisReports(userId).then((list) => {
      if (alive) setReports(list);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 pt-10 pb-20 sm:px-8">
        <Link
          to="/mypage?tab=services"
          className="text-[0.875rem] font-medium text-ink-sub underline underline-offset-4 transition hover:text-ink"
        >
          나의 서비스로
        </Link>
        <h1 className="mt-4 text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
          학습진단 리포트
        </h1>
        <DiagnosisReportList
          reports={reports}
          reportHref={(attemptId) => `/learning-diagnosis/report/${attemptId}`}
        />
      </div>
    </main>
  );
}
