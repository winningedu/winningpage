import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import DesignBody from "@/components/inquiry/design/DesignBody";
import EvaluationBody from "@/components/inquiry/evaluate/EvaluationBody";
import {
  useInquiryScreenStep,
  useInquiryShell,
} from "@/components/inquiry/InquiryShellContext";
import { INQUIRY_PATHS } from "@/components/inquiry/inquiryPaths";
import PdfSaveButton from "@/components/report/PdfSaveButton";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import { formatGradeLabel } from "@/components/report/formatGradeLabel";
import FinalFieldsTable from "@/components/inquiry/reports/FinalFieldsTable";
import LoadError, { errorCode } from "@/components/inquiry/reports/LoadError";
import {
  formatReportDate,
  resumePath,
} from "@/components/inquiry/reports/reportsLogic";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { site } from "@/config/site";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { copyTextWithToast } from "@/lib/clipboard";
import {
  submissionBodyEntries,
  submissionCopyText,
} from "@/lib/inquiry/copyText";
import { buildInquiryPdfFileName } from "@/lib/inquiry/pdfFileName";
import { inquirySessionDetailQuery } from "@/lib/inquiry/queries";
import type { SessionDetail } from "@/lib/inquiry/types";
import { useReportPdfSave } from "@/lib/report/useReportPdfSave";
import { cn } from "@/lib/utils";

const PAGE_TITLE = "심화탐구 기록";
const BODY = "mx-auto w-full max-w-[83.75rem] px-12 pb-12";
const BUTTON = "h-10 px-5 text-app-label";

function BackLink() {
  return (
    <Link
      to={INQUIRY_PATHS.reports}
      className={cn(buttonVariants({ variant: "outline" }), BUTTON)}
    >
      보관함으로
    </Link>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border bg-white p-6"
    >
      <h2 id={id} className="text-app-card-title font-bold text-ink-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Missing({ text }: { text: string }) {
  return <p className="text-app-body text-ink-sub">{text}</p>;
}

function subcopyFor(session: SessionDetail["session"]): string {
  if (session.status === "completed") {
    return `${formatReportDate(session.completedAt)} 확정. 설계 리포트와 평가 리포트를 함께 봐요`;
  }
  if (session.status === "archived") {
    return "만료되었거나 종결된 세션이라 이어서 할 수 없어요";
  }
  return "작성 중인 세션이에요. 이어서 하기";
}

// 경로: /app/inquiry/reports/:sessionId (단계 밖 화면이라 null)
export default function ReportDetailPage() {
  useInquiryScreenStep(null);
  const { userId } = useSession();
  const { studentName } = useInquiryShell();
  const toast = useToast();
  const { sessionId } = useParams();
  const { data, error, isError, refetch } = useQuery(
    inquirySessionDetailQuery(userId ?? null, sessionId ?? null),
  );
  const pdf = useReportPdfSave(
    buildInquiryPdfFileName("report", data?.topic?.detail?.title),
  );

  if (isError && errorCode(error) === "SESSION_NOT_FOUND") {
    return (
      <>
        <GoalPageHeader
          title="리포트를 찾을 수 없어요"
          actions={<BackLink />}
        />
        <div className={BODY}>
          <Missing text="지워졌거나 내 계정의 기록이 아니에요. 보관함에서 다시 골라 주세요." />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <GoalPageHeader title={PAGE_TITLE} actions={<BackLink />} />
        <div className={BODY}>
          <LoadError
            error={error}
            message="리포트를 불러오지 못했어요."
            onRetry={() => refetch()}
          />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <GoalPageHeader title={PAGE_TITLE} actions={<BackLink />} />
        <div className={BODY}>
          <div aria-busy="true" className="flex flex-col gap-4">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </>
    );
  }

  const { session, topic, design, evaluation, final, submission } = data;
  const isCompleted = session.status === "completed";
  // 확정한 작성본이 있을 때만 복사할 수 있다. 작성 중인 초안은 복사 대상이 아니다.
  const finalSections = isCompleted && submission ? submission.sections : null;
  const bodyEntries = finalSections ? submissionBodyEntries(finalSections) : [];
  const copyBody =
    finalSections && bodyEntries.length > 0
      ? submissionCopyText(finalSections)
      : null;
  const canResume =
    session.status === "draft" || session.status === "in_progress";

  return (
    <>
      <GoalPageHeader
        title={topic?.detail.title ?? PAGE_TITLE}
        subcopy={subcopyFor(session)}
        actions={
          <>
            <BackLink />
            <PdfSaveButton onClick={pdf.save} isPreparing={pdf.isPreparing} />
            {canResume ? (
              <Link
                to={resumePath(session.currentStep)}
                className={cn(buttonVariants(), BUTTON)}
              >
                이어서 하기
              </Link>
            ) : null}
          </>
        }
      />
      <div className={BODY}>
        <div ref={pdf.contentRef} className="flex flex-col gap-6">
          <ReportCoverPage
            kind={isCompleted ? "inquiryFinal" : "inquiryRecord"}
            title={`${site.brandName}\n${isCompleted ? "최종 심화탐구 리포트" : "심화탐구 기록"}`}
            infoItems={[
              { label: "학생명", value: studentName },
              {
                label: "학년",
                value: formatGradeLabel(session.gradeLabel),
              },
              ...(isCompleted && session.completedAt
                ? [
                    {
                      label: "확정일",
                      value: formatReportDate(session.completedAt),
                    },
                  ]
                : []),
            ]}
          />
          <Section id="inquiry-detail-design" title="설계 리포트">
            {design && topic ? (
              <DesignBody design={design} topic={topic} compact />
            ) : (
              <Missing text="설계 리포트가 아직 없어요" />
            )}
          </Section>
          <Section id="inquiry-detail-evaluation" title="평가 리포트">
            {evaluation ? (
              <EvaluationBody evaluation={evaluation} compact />
            ) : (
              <Missing text="평가 리포트가 아직 없어요" />
            )}
          </Section>
          {final ? (
            <Section id="inquiry-detail-final" title="확정 저장 내용">
              <FinalFieldsTable fields={final} />
            </Section>
          ) : null}
          {copyBody !== null ? (
            <section
              aria-label="최종 본문"
              className="flex flex-col gap-4 rounded-xl border border-border bg-white p-6"
            >
              <h2 className="text-app-card-title font-bold text-ink-strong">
                최종 본문
              </h2>
              <div className="flex select-text flex-col gap-5">
                {bodyEntries.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-1">
                    <h3 className="text-app-body font-semibold text-ink-strong">
                      {entry.heading}
                    </h3>
                    <p className="whitespace-pre-wrap text-app-body leading-[1.9] text-ink-strong">
                      {entry.body}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        {copyBody !== null ? (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 px-5 text-app-label font-medium"
              onClick={() => void copyTextWithToast(copyBody, toast)}
            >
              전체 복사
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
