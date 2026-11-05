// W13 학생조회-변경-이력. 탭과 필터 상태는 쿼리스트링에 둔다(새로 고침과 뒤로 가기가 이어지게).

import { useSearchParams } from "react-router";
import { gradeLabel } from "../classLabel";
import PageHeader from "../PageHeader";
import Tabs from "../Tabs";
import { useConsoleMe } from "../useConsoleMe";
import GraduatesTab from "./GraduatesTab";
import PendingRequestsTab from "./PendingRequestsTab";
import StudentListTab from "./StudentListTab";
import { useClasses } from "./useClasses";

export default function StudentHistoryPage() {
  const { me } = useConsoleMe();
  const [params, setParams] = useSearchParams();
  const admin = me.kind !== "homeroom";
  const tabs = [
    { key: "pending", label: "승인 대기" },
    { key: "students", label: "학생 조회와 이력" },
    ...(admin ? [{ key: "graduates", label: "졸업생" }] : []),
  ];
  const requested = params.get("tab");
  const tab = tabs.find((t) => t.key === requested)?.key ?? "pending";
  const classes = useClasses();

  // 필터를 건 학생 조회와 졸업생 탭은 지금 보는 범위를 빵부스러기로 보인다. 그 밖에는 기본 위치다.
  let breadcrumb: string[] | undefined;
  if (tab === "students") {
    const grade = params.get("grade");
    const className = classes.data?.find(
      (c) => c.id === params.get("classId"),
    )?.name;
    if (grade)
      breadcrumb = [
        me.tenant.name,
        gradeLabel(grade),
        ...(className ? [`${className}반`] : []),
      ];
  } else if (tab === "graduates") {
    const year = params.get("year");
    breadcrumb = [me.tenant.name, "졸업생", ...(year ? [`${year}학년도`] : [])];
  }

  return (
    <>
      <PageHeader
        title="학생조회-변경-이력"
        {...(breadcrumb && { breadcrumb })}
        subtitle="승인 대기 요청을 처리하고 학생의 학년그룹과 반 이력을 확인합니다"
      />
      <Tabs
        items={tabs}
        value={tab}
        onChange={(key) => setParams({ tab: key })}
      />
      <div className="px-4 pb-24 md:px-8 lg:px-12">
        {tab === "pending" && <PendingRequestsTab />}
        {tab === "students" && <StudentListTab />}
        {tab === "graduates" && <GraduatesTab />}
      </div>
    </>
  );
}
