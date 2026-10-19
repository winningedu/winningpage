import { useLocation, useNavigate, useParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import PdfSaveButton from "@/components/report/PdfSaveButton";
import ReportCoverPage from "@/components/report/ReportCoverPage";
import { formatGradeLabel } from "@/components/report/formatGradeLabel";
import { formatDotDate } from "@/components/selfeval/activities/activitiesLogic";
import {
  archiveName,
  archiveTitle,
} from "@/components/selfeval/archive/archiveLogic";
import { paragraphTexts } from "@/components/selfeval/result/resultLogic";
import {
  useSelfevalScreenStep,
  useSelfevalShell,
} from "@/components/selfeval/SelfevalShellContext";
import SessionDetailGate, {
  PAGE_BODY,
} from "@/components/selfeval/SessionDetailGate";
import { SELFEVAL_PATHS } from "@/components/selfeval/selfevalPaths";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { useToast } from "@/context/ToastContext";
import { copyTextWithToast } from "@/lib/clipboard";
import { useReportPdfSave } from "@/lib/report/useReportPdfSave";
import { buildSelfevalPdfFileName } from "@/lib/selfeval/pdfFileName";
import type {
  FinalizeReply,
  GenerationSections,
  SessionDetailResponse,
} from "@/lib/selfeval/types";

// 저장 완료 화면(시안 53~55, 명세 No.63, 64, 75, 131). 경로: /app/selfeval/s/:sessionId/done
// 보관함의 "다시 보기" 도 같은 화면을 연다. 완료 세션은 전부 여기서 읽기 전용으로 본다.
// 하단 고지는 SelfevalAppLayout 이 그린다.

const TITLE = "최종본을 저장했습니다";
const STORED_TEXT =
  "활동 기록 저장소에 7항목(주제, 개념, 방법, 결과, 한계, 수치, 자료명)으로 저장했습니다";

export default function DonePage() {
  useSelfevalScreenStep(6);
  const { sessionId = null } = useParams();
  return (
    <SessionDetailGate sessionId={sessionId} title={TITLE}>
      {(detail) =>
        sessionId ? <DoneBody sessionId={sessionId} detail={detail} /> : null
      }
    </SessionDetailGate>
  );
}

function replyMessage(
  reply: FinalizeReply | null,
  planTitle: string | null,
): { tone: "ok" | "info"; text: string } | null {
  if (!reply) return null;
  if (reply.status === "sent" && planTitle) {
    return {
      tone: "ok",
      text: `성장설계 실행계획의 '${planTitle}' 를 완료로 보냈습니다`,
    };
  }
  if (reply.status === "failed") {
    return {
      tone: "info",
      text: "자기평가서는 저장했어요. 성장설계 회신은 실패했어요. 다음에 들어오면 자동으로 다시 보내요",
    };
  }
  if (reply.status === "skipped" && planTitle) {
    return { tone: "ok", text: "과제는 완료로 보내지 않았어요" };
  }
  return null;
}

function DoneBody({
  sessionId,
  detail,
}: {
  sessionId: string;
  detail: SessionDetailResponse;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const { studentName } = useSelfevalShell();
  const { session, activities } = detail;
  const final = detail.reports.final;
  const pdf = useReportPdfSave(buildSelfevalPdfFileName(archiveName(session)));

  if (session.status !== "completed" || !final) {
    return (
      <>
        <GoalPageHeader title={TITLE} />
        <div className={PAGE_BODY}>
          <section className={CARD}>
            <p className={CARD_TITLE}>아직 최종본으로 저장하지 않았어요</p>
            <p className="mt-1 text-app-label text-ink-sub">
              검증 화면에서 확인하고 저장하면 이곳에서 볼 수 있어요.
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

  const sections = final.sections as GenerationSections;
  const texts = paragraphTexts(sections);
  const planTitle =
    session.planItemId && session.growthSnapshot
      ? (session.growthSnapshot.planItems.find(
          (p) => p.id === session.planItemId,
        )?.title ?? null)
      : null;
  const navReply = (location.state as { reply?: FinalizeReply } | null)?.reply;
  const reply: FinalizeReply | null =
    navReply ?? (session.replyPending ? { status: "failed" } : null);
  const message = replyMessage(reply, planTitle);
  const title = archiveTitle(session);
  const saved = session.completedAt ? formatDotDate(session.completedAt) : null;

  return (
    <>
      <GoalPageHeader
        title={TITLE}
        subcopy="저장한 자기평가서는 잠겨서 더 고치지 않습니다. 보관함에서 다시 볼 수 있습니다"
      />
      <div className={PAGE_BODY}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className={CARD}>
              <p className={CARD_TITLE}>{STORED_TEXT}</p>
              {message && (
                <p
                  className={`mt-3 rounded-lg px-4 py-3 text-app-label text-ink-strong ${
                    message.tone === "info"
                      ? "bg-surface-info"
                      : "bg-surface-04"
                  }`}
                >
                  {message.text}
                </p>
              )}
            </section>
            <div ref={pdf.contentRef}>
              <ReportCoverPage
                kind="selfeval"
                title={`${site.brandName}\n${title}`}
                infoItems={[
                  { label: "학생명", value: studentName },
                  {
                    label: "학년",
                    value: formatGradeLabel(session.gradeLabel),
                  },
                  { label: "저장일", value: saved },
                ]}
              />
              <section className={CARD} aria-label="최종 본문">
                <div className="flex items-center justify-between gap-2">
                  <h2 className={CARD_TITLE}>{title}</h2>
                  <span className="rounded-full bg-surface-04 px-2.5 py-0.5 text-app-caption font-semibold text-ink-sub print:hidden">
                    잠금
                  </span>
                </div>
                <div className="mt-3 flex select-text flex-col gap-4">
                  {texts.map((text, i) => (
                    // 문단은 순서가 곧 정체성이고 재정렬되지 않는다.
                    <p
                      // biome-ignore lint/suspicious/noArrayIndexKey: 읽기 전용 고정 목록
                      key={i}
                      className="text-app-body leading-[1.9] text-ink-strong print:text-black"
                    >
                      {text}
                    </p>
                  ))}
                </div>
              </section>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-10 px-5 text-app-label font-medium"
                onClick={() =>
                  void copyTextWithToast(texts.join("\n\n"), toast)
                }
              >
                전체 복사
              </Button>
              <PdfSaveButton onClick={pdf.save} isPreparing={pdf.isPreparing} />
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
          <aside className={CARD} aria-label="검증 요약">
            <h2 className={CARD_TITLE}>검증 요약</h2>
            <ul className="mt-3 flex flex-col gap-1.5 text-app-label text-ink-strong">
              {final.score !== null && (
                <li className="text-app-stat font-bold">{final.score} / 100</li>
              )}
              <li>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-app-caption font-semibold text-emerald-800">
                  제출 가능
                </span>
              </li>
              {saved && <li>저장일 {saved}</li>}
              {final.charCount && (
                <li>공백 포함 {final.charCount.withSpace}자</li>
              )}
              <li>사용한 활동 {activities.length}건</li>
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}
