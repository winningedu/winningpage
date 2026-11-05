// W7 이용현황. 교사 콘솔 /teacher/enrollment. 담임은 셸(ConsoleLayout)이 대시보드로 돌려보낸다.
// 학년, 반 조회는 서버가 준 전체 반 행을 화면에서 거른다(요약 합계도 보이는 행에서 낸다).

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "../api";
import Notice from "../Notice";
import PageHeader from "../PageHeader";
import ClassTable from "./ClassTable";
import EnrollmentSummaryCards from "./EnrollmentSummaryCards";
import { dotDate, type EnrollmentSummary, totalsOf } from "./format";

const SUMMARY_KEY = ["console", "enrollment-summary"] as const;

async function fetchSummary(): Promise<EnrollmentSummary> {
  const res = await consoleRequest("/api/console/enrollment/summary");
  if (res.status !== 200) throw new Error(`enrollment summary ${res.status}`);
  return res.body as EnrollmentSummary;
}

export default function EnrollmentPage() {
  const summary = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: fetchSummary,
    retry: false,
  });
  const data = summary.data;
  const rows = data?.classes ?? [];
  const totals = totalsOf(rows);
  const scopeLabel = data?.orgType === "학원" ? "학원 전체" : "학교 전체";

  return (
    <>
      <PageHeader
        title="이용현황"
        subtitle="학급별, 서비스별 이용 학생 수를 확인합니다"
        {...(data && {
          asOf: `집계 기준: ${scopeLabel}, ${dotDate(data.asOf)} 기준`,
        })}
      />
      <div className="flex max-w-content flex-col gap-6 px-4 pb-24 md:px-8 lg:px-12">
        {summary.isError && (
          <Notice tone="Danger">이용현황을 불러오지 못했어요</Notice>
        )}
        {data && (
          <>
            <EnrollmentSummaryCards totals={totals} scopeLabel={scopeLabel} />
            <ClassTable rows={rows} />
          </>
        )}
      </div>
    </>
  );
}
