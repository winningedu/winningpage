import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import GoalCard from "@/components/goal/GoalCard";
import GrowthReportBody, {
  type GrowthReport as GrowthReportData,
} from "@/components/goal/report/GrowthReportBody";
import { fetchGoalReport } from "@/lib/goalApi";
import { supabase } from "@/lib/supabase";

// 학부모 뷰어 셸 — 자녀의 목표관리 성장 리포트(주간/월간)를 학부모가 열람한다.
// 진입: 마이페이지 > 자녀 등록 및 수정 > 자녀 카드 > "목표관리 리포트 →",
// 또는 목표관리 주간/월간 알림톡 링크(src/routes/alimtalkLinkRoutes.tsx).
//
// ── 권한 판정 ─────────────────────────────────────────────────────────
// 비로그인은 이 컴포넌트가 아니라 라우트 가드가 먼저 막는다(mypageRoutes.ts의
// requireAuthMiddleware가 /login?redirect=원래경로로 보낸다). 여기서는 로그인은
// 됐지만 이 자녀와 연결되지 않은 경우만 다룬다 — fn_parent_children(sql/73)이 UI
// 게이트다 — 반환 목록에 이 studentId가 approved로
// 없으면 화면 진입 자체를 막는다(아래 child===null). 진짜 방어선은 api/goal/report.ts가
// studentId 쿼리를 받을 때 서버에서 fn_is_linked_pair로 다시 확인하는 쪽이다(403
// NOT_LINKED) — 판정 축을 둘로 늘리지 않기 위해 여기서 fn_is_linked_pair를 따로
// 부르지 않는다(자녀 목록과 열람 권한이 갈라지면 목록엔 보이는데 못 여는 상태가 난다).
//
// ── 본문 ────────────────────────────────────────────────────────────
// GrowthReportBody는 학생 뷰(src/pages/goal/GrowthReport.tsx)와 완전히 동일한 프레젠테이션
// 컴포넌트를 그대로 재사용한다 — period/onPeriodChange/report 3개 prop만 받는 순수
// 컴포넌트라 학부모 열람에도 그대로 맞는다(그 파일 주석이 원래 예고했던 재사용 지점).
// 데이터는 새 RPC를 만들지 않고 기존 api/goal/report.ts에 studentId 쿼리 파라미터를
// 추가해 조회한다 — 이용권 게이트·온보딩 게이트·weekly/monthly 집계 파이프라인이 이미
// 이 엔드포인트에 있고, 학부모 열람은 그 파이프라인을 자녀 프로필 기준으로 그대로 태우면
// 되기 때문이다.
//
// 학습진단 리포트·성장설계 리포트는 이번 범위 밖이다(학습진단은 영속 저장 구조가 없고,
// 성장설계는 서비스 데이터가 없다 — 상위 세션 판단) — 링크나 빈 자리를 만들지 않는다.

const VALID_PERIODS = ["weekly", "monthly"] as const;
type ReportPeriod = (typeof VALID_PERIODS)[number];

type ParentChildRow = {
  student_profile_id: string;
  student_name: string;
  link_status: string;
};

// fetchGoalReport()의 discriminated union 중 이 화면이 실제로 구분해 보여줄 상태만
// 좁혀 재선언한다(GrowthReport.tsx와 같은 관례) — not-onboarded/not-allowed는 학부모
// 관점에서 같은 안내("자녀가 아직 시작하지 않음")이므로 여기서 하나로 합친다.
type ChildReportResult =
  | { kind: "success"; report: GrowthReportData }
  | { kind: "awaiting-cuts" }
  | { kind: "not-started" }
  | { kind: "error" };

// 안내 문구 — 2026-09-02 승인(QA 시트 행 210, 목표관리 화면 기존 문구와 동일 어조).
const NOT_STARTED_NOTICE = "자녀가 아직 목표관리를 시작하지 않았어요.";

export default function ChildReport() {
  const { studentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const periodParam = searchParams.get("period");
  const period: ReportPeriod = VALID_PERIODS.includes(
    periodParam as ReportPeriod,
  )
    ? (periodParam as ReportPeriod)
    : "weekly";

  // `at` — 어느 주/달의 리포트인가. 알림톡 링크가 넘겨주는 값이고
  // (src/routes/alimtalkLinkRoutes.tsx), 형식은 학생 뷰(GrowthReport.tsx)와
  // 동일하다: 주간은 그 주 월요일 YMD, 월간은 'YYYY-MM'. 없으면 API 가 오늘
  // (KST) 기준 이번 주/이번 달로 잡는다.
  const at = searchParams.get("at") || undefined;

  // undefined 로딩 / null 권한없음
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

  const [result, setResult] = useState<ChildReportResult | null>(null);

  useEffect(() => {
    // child가 승인된 연결로 확정되기 전에는 조회하지 않는다 — 권한 판정 두 번(UI 게이트 +
    // 서버 재확인)을 순서대로 태워 불필요한 403 깜빡임을 피한다.
    if (!child || !studentId) return;

    let alive = true;
    setResult(null);
    fetchGoalReport(period, at, undefined, studentId).then((r) => {
      if (!alive) return;
      if (r.kind === "success") {
        setResult({ kind: "success", report: r.report });
      } else if (r.kind === "awaiting-cuts") {
        setResult({ kind: "awaiting-cuts" });
      } else if (r.kind === "not-onboarded" || r.kind === "not-allowed") {
        setResult({ kind: "not-started" });
      } else if (r.kind === "not-linked") {
        // 서버가 재확인한 결과 승인된 쌍이 아니다(fn_parent_children UI 게이트를
        // 이미 통과했더라도 서버가 최종 방어선이다) — 기존 권한없음 화면으로
        // 떨어뜨린다(child를 null로 되돌리면 아래 렌더가 그 화면을 그대로 쓴다).
        setChild(null);
      } else {
        setResult({ kind: "error" });
      }
    });

    return () => {
      alive = false;
    };
  }, [child, studentId, period, at]);

  function handlePeriodChange(nextPeriod: ReportPeriod) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("period", nextPeriod);
      // 탭을 바꾸면 at 은 버린다 — 주간 키('2026-08-17')와 월간 키('2026-08')는
      // 형식이 달라서 그대로 들고 넘어가면 반대편 탭에서 해석되지 않는다
      // (GrowthReport.tsx와 동일 규칙).
      params.delete("at");
      return params;
    });
  }

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
      {child.student_name} 학생의 성장 리포트
    </h1>
  );

  if (result === null || result.kind !== "success") {
    const message =
      result === null
        ? "리포트를 불러오는 중입니다…"
        : result.kind === "awaiting-cuts"
          ? "합격 기준 데이터를 준비 중입니다. 잠시 후 다시 확인해 주세요."
          : result.kind === "not-started"
            ? NOT_STARTED_NOTICE
            : "리포트를 불러오지 못했습니다. 새로고침해 주세요.";

    return (
      <main className="min-h-screen bg-white pt-16">
        <div className="mx-auto w-full max-w-content px-5 pt-10 sm:px-8">
          {backLink}
          {heading}
          <GoalCard tone="neutral" className="mt-6 px-8 py-7">
            <p className="text-[0.9375rem] leading-[1.4] text-ink-sub">
              {message}
            </p>
          </GoalCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16">
      <div className="mx-auto w-full max-w-content px-5 pt-10 sm:px-8">
        {backLink}
        {heading}
      </div>
      <GrowthReportBody
        period={period}
        onPeriodChange={handlePeriodChange}
        report={result.report}
        studentName={child.student_name}
      />
    </main>
  );
}
