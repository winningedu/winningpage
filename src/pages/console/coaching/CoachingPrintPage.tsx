// W9c 코칭 PDF. 새 창에서 열리고 자료를 읽으면 브라우저 인쇄 창을 한 번 연다(교 #234).
// A4 두 쪽: 1쪽 학생과 한줄 진단과 5대 역량, 2쪽 6축. 교사 메모는 넣지 않는다(결정 3).
// @page 는 클래스로 스코프가 안 되므로 이 화면이 열려 있는 동안에만 <style> 로 둔다(학습진단 리포트와 같은 방식).

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { consoleRequest } from "../api";
import { kstDotDateTime } from "../date";
import EmptyMessage from "../EmptyMessage";
import { useConsoleMe } from "../useConsoleMe";
import {
  AxisPanel,
  CompetencyList,
  StudentCard,
  SummaryCallout,
  studentClassText,
} from "./CoachingPage";
import { Narrative } from "./CoachingSections";
import { useCoaching } from "./useCoaching";

const PRINT_RULE = `
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    #root > header { display: none !important; }
    .console-frame-body { padding-top: 0 !important; }
    .coaching__print-root { padding: 0 !important; gap: 0 !important; }
    .coaching__print { break-after: page; }
    .coaching__print-p2 { break-after: avoid; }
    .coaching__print, .coaching__print-p2 { gap: 0.75rem !important; }
    .coaching__print p, .coaching__print-p2 p { line-height: 1.4 !important; }
    .coaching__print li, .coaching__print-p2 li, .coaching__print [class*="rounded-"], .coaching__print-p2 [class*="rounded-"], .coaching__keep { break-inside: avoid; }
  }
`;

export default function CoachingPrintPage() {
  const [params] = useSearchParams();
  const { data, isError } = useCoaching(params.get("studentId"));
  const printed = useRef(false);
  const { me } = useConsoleMe();
  const [printedAt] = useState(() => kstDotDateTime(new Date()));

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
  if (isError)
    return (
      <EmptyMessage body="개인종합코칭을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요" />
    );
  if (!data) return null;
  const classText = studentClassText(data.student);
  return (
    <div className="coaching__print-root flex flex-col gap-6 p-6">
      <style>{PRINT_RULE}</style>
      <section className="coaching__print flex flex-col gap-6">
        <h1 className="text-app-title font-bold text-ink-strong">
          개인종합코칭
        </h1>
        <p className="text-app-label text-ink-sub">
          교육기관 {me.tenant.name}, 학생 {data.student.name}
          {classText && `(${classText})`}, 출력일시 {printedAt}, 출력자{" "}
          {me.teacher
            ? `${me.teacher.name}(${me.teacher.loginId})`
            : "본사 대행"}
        </p>
        <StudentCard data={data} />
        <SummaryCallout data={data} />
        <CompetencyList data={data} />
      </section>
      <section className="coaching__print-p2 flex flex-col gap-6">
        <div className="coaching__keep">
          <AxisPanel data={data} />
        </div>
        <Narrative data={data} />
      </section>
    </div>
  );
}
