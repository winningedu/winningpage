import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import {
  type DiagnosisReportListItem,
  listDiagnosisReports,
} from "@/lib/diagnosisReportQueries";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/time/format";

// 학부모가 자녀의 학습진단 리포트 "회차 목록"을 여는 뷰어.
// 진입: 마이페이지 > 자녀 등록 및 수정 > 자녀 카드 > "학습진단 리포트 보기"(다른 유닛이 건다).
//
// ── 권한 판정 ─────────────────────────────────────────────────────────
// 비로그인은 라우트 가드가 먼저 막는다(mypageRoutes.ts의 requireAuthMiddleware가
// /login?redirect=원래경로로 보낸다). ChildReport.tsx(성장 리포트 학부모 뷰어)와
// 셸·권한 게이트를 그대로 맞춘다 —
// fn_parent_children(sql/73)이 UI 게이트고, 반환 목록에 이 studentId가 approved로
// 없으면 화면 진입 자체를 막는다(아래 child===null). ChildReport와 달리 여기는 서버
// 재확인용 API를 따로 두지 않는다 — diagnosis_reports RLS(본인·승인된 연결의 학부모·
// 관리자만 select)가 listDiagnosisReports 호출 자체에서 그 재확인을 겸한다(권한 없는
// studentId로 조회해도 빈 배열만 돌아온다, 에러 아님).

type ParentChildRow = {
  student_profile_id: string;
  student_name: string;
  link_status: string;
};

// "YYYY. MM. DD" 를 보는 사람의 브라우저 시간대로 표기한다(MyServicesTab.formatDateSpaced와 같은 표기).
function formatDiagnosedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDate(date).replaceAll("-", ". ");
}

// 신규 카피 — 승인 대기(0건 빈 상태, QA 시트 행 210).
const EMPTY_STATE_NOTICE = "아직 완료된 학습진단이 없어요.";

export default function ChildDiagnosisReports() {
  const { studentId } = useParams();

  // undefined 로딩 / null 권한없음 — ChildReport.tsx와 동일한 3상태.
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

  const [reports, setReports] = useState<DiagnosisReportListItem[] | null>(
    null,
  );

  useEffect(() => {
    // child가 승인된 연결로 확정되기 전에는 조회하지 않는다 — ChildReport.tsx와 같은 이유
    // (권한 판정 두 번을 순서대로 태워 불필요한 빈 목록 깜빡임을 피한다).
    if (!child || !studentId) return;

    let alive = true;
    setReports(null);
    listDiagnosisReports(studentId).then((list) => {
      if (alive) setReports(list);
    });

    return () => {
      alive = false;
    };
  }, [child, studentId]);

  if (child === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white pt-16">
        <p className="text-[0.875rem] font-medium text-ink-sub">
          목록을 불러오는 중입니다.
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

  const backLink = (
    <Link
      to="/mypage?tab=children"
      className="text-[0.875rem] font-medium text-ink-sub underline underline-offset-4 transition hover:text-ink"
    >
      ← 자녀 목록
    </Link>
  );

  const heading = (
    <h1 className="mt-4 text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
      {child.student_name} 학생의 학습진단 리포트
    </h1>
  );

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 pt-10 pb-20 sm:px-8">
        {backLink}
        {heading}

        {reports === null ? (
          <GoalCard tone="neutral" className="mt-6 px-8 py-7">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
              목록을 불러오는 중입니다…
            </p>
          </GoalCard>
        ) : reports.length === 0 ? (
          <GoalCard tone="neutral" className="mt-6 px-8 py-7">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
              {EMPTY_STATE_NOTICE}
            </p>
          </GoalCard>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {reports.map((report, index) => (
              <li key={report.attempt_id}>
                <Link
                  to={`/mypage/children/${studentId}/report/diagnosis/${report.attempt_id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-[#e5e5e5] px-6 py-5 transition hover:bg-surface-04"
                >
                  <span className="text-[0.9375rem] font-medium text-ink">
                    {/* 최신순 목록이라 마지막(가장 오래된) 행이 1회차다. */}
                    {reports.length - index}회차 학습진단 ·{" "}
                    {formatDiagnosedAt(report.diagnosed_at)}
                  </span>
                  <span className="text-[0.875rem] font-medium text-accent">
                    리포트 보기 →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
