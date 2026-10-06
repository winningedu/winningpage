import { useLocation, useNavigate, useParams } from "react-router";
import GoalPageHeader from "@/components/goal/GoalPageHeader";
import { CARD, CARD_TITLE } from "@/components/growth/start/cardStyles";
import { formatDotDate } from "@/components/selfeval/activities/activitiesLogic";
import { archiveTitle } from "@/components/selfeval/archive/archiveLogic";
import { paragraphTexts } from "@/components/selfeval/result/resultLogic";
import { useSelfevalScreenStep } from "@/components/selfeval/SelfevalShellContext";
import SessionDetailGate, {
  PAGE_BODY,
} from "@/components/selfeval/SessionDetailGate";
import { SELFEVAL_PATHS } from "@/components/selfeval/selfevalPaths";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/ToastContext";
import type {
  FinalizeReply,
  GenerationSections,
  SessionDetailResponse,
} from "@/lib/selfeval/types";

// 저장 완료 화면(시안 53~55, 명세 No.63, 64, 75, 131). 경로: /app/selfeval/s/:sessionId/done
// 보관함의 "다시 보기" 도 같은 화면을 연다. 완료 세션은 전부 여기서 읽기 전용으로 본다.
// 하단 고지는 SelfevalAppLayout 이 그린다.

const TITLE = "최종본을 저장했습니다";
const PREVIEW_SENTENCES = 3;
const STORED_TEXT =
  "활동 기록 저장소에 7항목(주제, 개념, 방법, 결과, 한계, 수치, 자료명)으로 적립했습니다";

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
  const { session, activities } = detail;
  const final = detail.reports.final;

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
  // 미리보기는 앞 몇 문장만 잘라 보여 준다. 전체는 복사로 가져간다.
  const preview = sections.paragraphs
    .flatMap((p) => p.sentences)
    .slice(0, PREVIEW_SENTENCES)
    .map((s) => s.text)
    .join(" ");

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

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(texts.join("\n\n"));
      toast.success("복사했어요");
    } catch {
      toast.error("복사하지 못했어요. 직접 선택해서 복사해 주세요.");
    }
  }

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
            <section className={CARD} aria-label="본문 미리보기">
              <div className="flex items-center justify-between gap-2">
                <h2 className={CARD_TITLE}>{title}</h2>
                <span className="rounded-full bg-surface-04 px-2.5 py-0.5 text-app-caption font-semibold text-ink-sub">
                  잠금
                </span>
              </div>
              <p className="mt-3 text-app-body leading-[1.9] text-ink-strong">
                {preview}
              </p>
            </section>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-10 px-5 text-app-label font-medium"
                onClick={() => void copyAll()}
              >
                전체 복사
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
