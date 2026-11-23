import { useNavigate, useParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import PdfSaveButton from "@/components/report/PdfSaveButton";
import { archiveName } from "@/components/selfeval/archive/archiveLogic";
import SelfevalReportDocument from "@/components/selfeval/report/SelfevalReportDocument";
import { useSelfevalReport } from "@/components/selfeval/report/useSelfevalReport";
import {
  useSelfevalScreenStep,
  useSelfevalShell,
} from "@/components/selfeval/SelfevalShellContext";
import SessionDetailGate, {
  PAGE_BODY,
} from "@/components/selfeval/SessionDetailGate";
import { SELFEVAL_PATHS } from "@/components/selfeval/selfevalPaths";
import { Button } from "@/components/ui/button";
import { useReportPdfSave } from "@/lib/report/useReportPdfSave";
import { buildSelfevalPdfFileName } from "@/lib/selfeval/pdfFileName";
import type { SessionDetailResponse } from "@/lib/selfeval/types";

// 자기평가서 리포트 화면(명세 No.133, 171, 201). 경로: /app/selfeval/s/:sessionId/report
// 완료 화면과 보관함에서 열고, 표지와 01~05장을 보여 준다. PDF 저장은 같은 문서를 인쇄한다.
// 리포트 만들기가 실패해도 최종 저장은 그대로다(다시 만들기만 제공한다).

const TITLE = "자기평가서 리포트";

export default function ReportPage() {
  useSelfevalScreenStep(6);
  const { sessionId = null } = useParams();
  return (
    <SessionDetailGate sessionId={sessionId} title={TITLE}>
      {(detail) =>
        sessionId ? <ReportBody sessionId={sessionId} detail={detail} /> : null
      }
    </SessionDetailGate>
  );
}

function ReportBody({
  sessionId,
  detail,
}: {
  sessionId: string;
  detail: SessionDetailResponse;
}) {
  const navigate = useNavigate();
  if (detail.session.status !== "completed" || !detail.reports.final) {
    return (
      <>
        <GoalPageHeader title={TITLE} />
        <div className={PAGE_BODY}>
          <section className={CARD}>
            <p className={CARD_TITLE}>아직 최종본으로 저장하지 않았어요</p>
            <p className="mt-1 text-app-label text-ink-sub">
              검증 화면에서 확인하고 저장하면 리포트를 볼 수 있어요.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-4 h-10 px-5 text-app-label font-semibold"
              onClick={() => navigate(SELFEVAL_PATHS.verify(sessionId))}
            >
              검증 화면으로
            </Button>
          </section>
        </div>
      </>
    );
  }
  return (
    <ReportView sessionId={sessionId} pdfTitle={archiveName(detail.session)} />
  );
}

function ReportView({
  sessionId,
  pdfTitle,
}: {
  sessionId: string;
  pdfTitle: string;
}) {
  const navigate = useNavigate();
  const { studentName } = useSelfevalShell();
  const report = useSelfevalReport(sessionId);
  const pdf = useReportPdfSave(buildSelfevalPdfFileName(pdfTitle));

  return (
    <>
      <GoalPageHeader
        title={TITLE}
        subcopy="저장한 자기평가서가 어떤 활동 기록에서 만들어졌는지 정리했어요"
      />
      <div className={PAGE_BODY}>
        {(report.phase === "loading" || report.phase === "building") && (
          <section className={CARD} role="status">
            <p className={CARD_TITLE}>리포트를 만드는 중이에요</p>
            <p className="mt-1 text-app-label text-ink-sub">
              잠시만 기다려 주세요. 최종 저장은 이미 끝났어요.
            </p>
          </section>
        )}
        {report.phase === "failed" && (
          <section className={CARD} role="alert">
            <p className={CARD_TITLE}>
              리포트를 만들지 못했어요. 최종 저장은 그대로예요.
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="mt-4 h-10 px-5 text-app-label"
              onClick={() => void report.rebuild()}
            >
              다시 만들기
            </Button>
          </section>
        )}
        {report.payload && (
          <div ref={pdf.contentRef}>
            <SelfevalReportDocument
              payload={report.payload}
              studentName={studentName}
              onRebuild={() => void report.rebuild()}
            />
          </div>
        )}
        <div className="flex justify-end gap-3 print:hidden">
          {report.payload && (
            <PdfSaveButton onClick={pdf.save} isPreparing={pdf.isPreparing} />
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-10 px-5 text-app-label font-medium"
            onClick={() => navigate(SELFEVAL_PATHS.done(sessionId))}
          >
            완료 화면으로
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-10 px-5 text-app-label font-semibold"
            onClick={() => navigate(SELFEVAL_PATHS.archive)}
          >
            보관함으로
          </Button>
        </div>
      </div>
    </>
  );
}
