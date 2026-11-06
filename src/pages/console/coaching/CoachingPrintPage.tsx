// W9c 코칭 PDF. 새 창에서 열리고 자료를 읽으면 브라우저 인쇄 창을 한 번 연다(교 #234).
// A4 두 쪽: 1쪽 학생과 한줄 진단과 5대 역량, 2쪽 6축. 교사 메모는 넣지 않는다(결정 3).
// @page 는 클래스로 스코프가 안 되므로 이 화면이 열려 있는 동안에만 <style> 로 둔다(학습진단 리포트와 같은 방식).

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { consoleRequest } from "../api";
import EmptyMessage from "../EmptyMessage";
import {
  AxisPanel,
  CompetencyList,
  StudentCard,
  SummaryCallout,
} from "./CoachingPage";
import { Narrative } from "./CoachingSections";
import { useCoaching } from "./useCoaching";

const PRINT_RULE = `
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    #root > header { display: none !important; }
    .coaching__print { break-after: page; }
  }
`;

export default function CoachingPrintPage() {
  const [params] = useSearchParams();
  const { data, isError } = useCoaching(params.get("studentId"));
  const printed = useRef(false);

  const [logFailed, setLogFailed] = useState(false);

  // 자료를 읽으면 인쇄 기록을 먼저 남기고, 남긴 뒤에만 인쇄 창을 한 번 연다(교 #234).
  useEffect(() => {
    if (!data || printed.current) return;
    printed.current = true;
    consoleRequest("/api/console/coaching/print-log", {
      method: "POST",
      body: { studentId: data.student.id },
    }).then((res) => {
      if (res.status === 200) window.print();
      else setLogFailed(true);
    });
  }, [data]);

  if (logFailed) return <EmptyMessage body="인쇄 기록을 남기지 못했어요" />;
  if (isError) return <EmptyMessage body="개인종합코칭을 불러오지 못했어요" />;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-6 p-6">
      <style>{PRINT_RULE}</style>
      <section className="coaching__print flex flex-col gap-6">
        <h1 className="text-app-title font-bold text-ink-strong">
          개인종합코칭
        </h1>
        <StudentCard data={data} />
        <SummaryCallout data={data} />
        <CompetencyList data={data} />
      </section>
      <section className="coaching__print-p2 flex flex-col gap-6">
        <AxisPanel data={data} />
        <Narrative data={data} />
      </section>
    </div>
  );
}
