import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import type { ReportListItem, ReportsList } from "@/lib/growth/api";
import { cn } from "@/lib/utils";
import { GROWTH_PATHS } from "../growthPaths";
import {
  deriveOpenCard,
  formatKoreanDate,
  openTarget,
  planAvailability,
  sortReportItems,
  terminalNotice,
} from "./reportsLogic";

const CARD = "rounded-xl border border-border bg-white p-6";

function OpenCard({ open }: { open: NonNullable<ReportsList["open"]> }) {
  const { statusLabel, progressLabel } = deriveOpenCard(open);
  const last = formatKoreanDate(open.lastActivityAt);
  return (
    <section
      aria-label="미완 회차"
      className={cn(CARD, "flex items-center justify-between gap-4")}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-04 px-2 py-0.5 text-app-badge font-semibold text-ink-strong">
            {statusLabel}
          </span>
          <h2 className="text-app-card-title font-semibold text-ink-strong">
            {progressLabel}
          </h2>
        </div>
        {last ? (
          <p className="mt-1 text-app-label text-ink-sub">마지막 활동 {last}</p>
        ) : null}
      </div>
      <Link
        to={openTarget(open)}
        className={cn(buttonVariants(), "h-10 px-5 text-app-label")}
      >
        이어서 하기
      </Link>
    </section>
  );
}

function TerminalCard({ reason, at }: { reason: string; at: string }) {
  return (
    <section
      aria-label="종결 안내"
      className={cn(CARD, "flex items-center justify-between gap-4")}
    >
      <div className="min-w-0">
        <h2 className="text-app-card-title font-semibold text-ink-strong">
          지난 회차는 생성에 실패해 이용권이 복구됐어요
        </h2>
        <p className="mt-1 text-app-label text-ink-sub">
          {reason}, {formatKoreanDate(at)}
        </p>
      </div>
      <Link
        to={GROWTH_PATHS.home}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-10 px-5 text-app-label",
        )}
      >
        새로 시작
      </Link>
    </section>
  );
}

function ReportCard({ item, index }: { item: ReportListItem; index: number }) {
  const plan = planAvailability(index);
  const issued = formatKoreanDate(item.issuedAt);
  return (
    <li className={cn(CARD, "flex items-center justify-between gap-4")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-app-card-title font-semibold text-ink-strong">
            {issued ? `${issued} 발행 리포트` : "발행 리포트"}
          </h3>
          {index === 0 ? (
            <span className="rounded-full bg-surface-04 px-2 py-0.5 text-app-badge font-semibold text-ink-strong">
              최신
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-app-label text-ink-sub">
          {[item.track, item.theme].filter(Boolean).join(", ")}
        </p>
        {item.plan ? (
          <p className="mt-0.5 text-app-label text-ink-sub">
            실행계획 {item.plan.total}건 중 {item.plan.done}건 완료
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to={GROWTH_PATHS.report(item.id)}
          className={cn(buttonVariants(), "h-10 px-5 text-app-label")}
        >
          리포트 보기
        </Link>
        {plan.enabled && plan.href ? (
          <Link
            to={plan.href}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-10 px-5 text-app-label",
            )}
          >
            실행계획
          </Link>
        ) : (
          <span
            title="실행계획은 가장 최근 리포트에서만 열 수 있어요"
            className="text-app-caption text-ink-sub"
          >
            최신 회차에서만 열 수 있어요
          </span>
        )}
      </div>
    </li>
  );
}

export default function ReportsView({ data }: { data: ReportsList }) {
  const items = sortReportItems(data.items);
  const notice = terminalNotice(data.lastTerminal, data.open);

  return (
    <div className="flex flex-col gap-4">
      {data.open ? <OpenCard open={data.open} /> : null}
      {notice ? <TerminalCard reason={notice.reason} at={notice.at} /> : null}

      {items.length === 0 ? (
        <section className={cn(CARD, "flex flex-col items-center gap-4 py-12")}>
          <p className="text-app-card-title font-semibold text-ink-strong">
            아직 완료한 리포트가 없어요
          </p>
          <Link
            to={GROWTH_PATHS.home}
            className={cn(buttonVariants(), "h-10 px-5 text-app-label")}
          >
            시작하기
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item, index) => (
            <ReportCard key={item.id} item={item} index={index} />
          ))}
        </ul>
      )}

      {data.archivedCount > 0 ? (
        <p className="text-app-caption text-ink-sub">
          보관된 회차 {data.archivedCount}개
        </p>
      ) : null}
    </div>
  );
}
