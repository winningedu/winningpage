// W13 학생조회-변경-이력. 탭과 필터 상태는 쿼리스트링에 둔다(새로 고침과 뒤로 가기가 이어지게).

import { useSearchParams } from "react-router";
import PageHeader from "../PageHeader";
import Tabs from "../Tabs";
import { useConsoleMe } from "../useConsoleMe";
import GraduatesTab from "./GraduatesTab";
import PendingRequestsTab from "./PendingRequestsTab";
import StudentListTab from "./StudentListTab";

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
  const tab = tabs.some((t) => t.key === requested) ? requested : "pending";

  return (
    <>
      <PageHeader
        title="학생조회-변경-이력"
        subtitle="승인 대기 요청을 처리하고 학생의 학년그룹과 반 이력을 확인합니다"
      />
      <Tabs
        items={tabs}
        value={tab ?? "pending"}
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
