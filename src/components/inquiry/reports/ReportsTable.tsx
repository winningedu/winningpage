import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ReportRow } from "./reportsLogic";

const HEADS = ["일자", "과목", "주제", "연계 방식", "점수", "상태", "동작"];

export default function ReportsTable({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-white px-6 py-10 text-center text-app-body text-ink-sub">
        조건에 맞는 심화탐구가 없어요
      </p>
    );
  }
  return (
    <>
      <div className="md:hidden">
        <ul aria-label="심화탐구 보관함 목록" className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={`${row.statusKey}-${row.sessionId}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-white p-4"
            >
              <p className="break-keep text-app-body font-semibold text-ink-strong">
                {row.topic}
              </p>
              <p className="text-app-caption text-ink-sub">
                {row.date}, {row.subject}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-app-label text-ink-strong">
                  {row.statusLabel}
                </span>
                {row.to && row.actionLabel ? (
                  <Link
                    to={row.to}
                    className={cn(
                      buttonVariants({
                        variant:
                          row.statusKey === "open" ? "default" : "outline",
                      }),
                      "h-9 px-4 text-app-label",
                    )}
                  >
                    {row.actionLabel}
                  </Link>
                ) : (
                  <span className="text-right text-app-caption text-ink-sub">
                    {row.note}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden rounded-xl border border-border bg-white md:block">
        <Table>
          <TableCaption className="sr-only">심화탐구 보관함 목록</TableCaption>
          <TableHeader>
            <TableRow>
              {HEADS.map((h) => (
                <TableHead key={h} className="text-app-label text-ink-sub">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.statusKey}-${row.sessionId}`}>
                <TableCell className="text-app-body text-ink-strong">
                  {row.date}
                </TableCell>
                <TableCell className="text-app-body text-ink-strong">
                  {row.subject}
                </TableCell>
                <TableCell className="text-app-body font-semibold text-ink-strong">
                  {row.topic}
                </TableCell>
                <TableCell className="text-app-body text-ink-strong">
                  {row.linkKind}
                </TableCell>
                <TableCell className="text-app-body text-ink-strong">
                  {row.score}
                </TableCell>
                <TableCell className="text-app-body text-ink-strong">
                  {row.statusLabel}
                </TableCell>
                <TableCell>
                  {row.to && row.actionLabel ? (
                    <Link
                      to={row.to}
                      className={cn(
                        buttonVariants({
                          variant:
                            row.statusKey === "open" ? "default" : "outline",
                        }),
                        "h-9 px-4 text-app-label",
                      )}
                    >
                      {row.actionLabel}
                    </Link>
                  ) : (
                    <span className="text-app-caption text-ink-sub">
                      {row.note}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
