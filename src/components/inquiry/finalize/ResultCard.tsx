import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INQUIRY_PATHS } from "../inquiryPaths";

const REPLY_TEXT = {
  true: "성장설계 실행계획 과제를 완료로 알렸어요",
  false: "성장설계 회신은 다음 접속 때 다시 보내요",
} as const;

export default function ResultCard({
  replySent,
}: {
  replySent: boolean | null;
}) {
  return (
    <section
      aria-label="적립 결과"
      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-6"
    >
      <h2 className="text-app-section font-bold text-ink-strong">
        적립을 마쳤어요
      </h2>
      <p role="status" className="text-app-body text-ink-strong">
        활동 기록에 적립됐어요. 다음 심화탐구를 시작할 때 출발 활동으로 고를 수
        있어요
      </p>
      {replySent !== null && (
        <p className="text-app-label text-ink-sub">
          {REPLY_TEXT[String(replySent) as "true" | "false"]}
        </p>
      )}
      <div className="mt-2 flex gap-3">
        <Link
          to={INQUIRY_PATHS.reports}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 px-5")}
        >
          보관함으로
        </Link>
        <Link
          to={INQUIRY_PATHS.home}
          className={cn(buttonVariants(), "h-10 px-5")}
        >
          새 심화탐구 시작
        </Link>
      </div>
    </section>
  );
}
