// W7 이용현황. 교사 콘솔 /teacher/enrollment. 담임은 셸(ConsoleLayout)이 대시보드로 돌려보낸다.
// 학년, 반 조회는 서버가 준 전체 반 행을 화면에서 거른다(요약 합계도 보이는 행에서 낸다).

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { consoleRequest } from "../api";
import { gradeLabel } from "../classLabel";
import FilterSelect from "../FilterSelect";
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
  const [grade, setGrade] = useState("");
  const [classId, setClassId] = useState("");
  const data = summary.data;
  const all = data?.classes ?? [];
  const rows = all.filter(
    (r) => (!grade || r.grade === grade) && (!classId || r.classId === classId),
  );
  const totals = totalsOf(rows);
  const picked = all.find((r) => r.classId === classId);
  const wholeLabel = data?.orgType === "학원" ? "학원 전체" : "학교 전체";
  const scopeLabel = picked
    ? `${gradeLabel(picked.grade)} ${picked.className}반`
    : grade
      ? gradeLabel(grade)
      : wholeLabel;
  const grades = [...new Set(all.map((r) => r.grade))];

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
            <div className="flex flex-wrap justify-end gap-2.5">
              <FilterSelect
                label="학년그룹"
                value={grade}
                options={[
                  { value: "", label: "전체" },
                  ...grades.map((g) => ({ value: g, label: gradeLabel(g) })),
                ]}
                onChange={(next) => {
                  setGrade(next);
                  setClassId("");
                }}
              />
              <FilterSelect
                label="반"
                value={classId}
                disabled={grade === ""}
                options={[
                  { value: "", label: "전체" },
                  ...all
                    .filter((r) => r.grade === grade)
                    .map((r) => ({
                      value: r.classId,
                      label: `${r.groupName ? `${r.groupName} ` : ""}${r.className}반`,
                    })),
                ]}
                onChange={setClassId}
              />
            </div>
            <ClassTable rows={rows} />
          </>
        )}
      </div>
    </>
  );
}
