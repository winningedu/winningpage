import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildDailyTrend,
  buildProgramShare,
  buildRevenueKpis,
  buildSummaryRows,
  type RevenueRowLike,
} from "@/lib/revenueDashboard";

// ---------------------------------------------------------------------------
// 매출 총괄 대시보드 (QA 274) — 파일18 「위닝에듀 정산관리」의 정산 총괄표.
//
// 원본 화면은 KPI 5칸 · 일별 추이 · 처리 필요 항목 · 프로그램별 비중 · 항목별
// 집계 요약 다섯 블록이다. 그중 **원장이 있는 것만** 그린다:
//   - 매출조정 / 매출취소 : 수기 조정 장부가 2026-08-23 에 삭제됐다(실제 결제와
//     연결이 없어 빈 화면이었다). 원장이 없으므로 집계 요약에서 두 행이 빠지고,
//     처리 필요 항목의 "매출조정/취소 검토중"도 빠진다.
//   - 일일정산 미마감 : 정산 확정 원장이 없다(QA 313 이 그 건이다).
// 없는 숫자를 0으로 지어내면 "처리할 게 없다"로 읽혀 더 나쁘다 — 행 자체를 뺀다.
//
// 계산은 전부 lib/revenueDashboard 에 있다. 여기는 그리기만 한다.
// ---------------------------------------------------------------------------

const TONE_COLOR: Record<string, string> = {
  primary: "#2348ff",
  warning: "#b88737",
  info: "#0f7b8a",
  danger: "#e5484d",
  success: "#2f8f4e",
};

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export type RevenuePending = {
  /** 환불 신청 중 아직 승인/반려가 안 난 건. */
  approvalWaiting: number;
  /** 승인은 났고 실제 환불 처리가 안 끝난 건. */
  processWaiting: number;
};

type Props = {
  rows: RevenueRowLike[];
  pending: RevenuePending;
  /** 결제일시를 KST 날짜로 자르는 함수. 화면과 같은 규칙을 써야 한다. */
  toKstYmd: (date: Date) => string;
  periodLabel: string;
};

export default function RevenueDashboard({
  rows,
  pending,
  toKstYmd,
  periodLabel,
}: Props) {
  const refundedCount = useMemo(
    () => rows.filter((row) => Number(row.refunded_amount ?? 0) > 0).length,
    [rows],
  );

  const kpis = useMemo(
    () => buildRevenueKpis(rows, refundedCount),
    [rows, refundedCount],
  );
  const trend = useMemo(
    () => buildDailyTrend(rows, toKstYmd),
    [rows, toKstYmd],
  );
  const share = useMemo(() => buildProgramShare(rows), [rows]);
  const summary = useMemo(() => buildSummaryRows(rows), [rows]);

  // 막대 높이의 기준. 0으로 나누지 않도록 최소 1을 깐다.
  const trendMax = Math.max(
    1,
    ...trend.map((point) => Math.max(point.paid, point.refund)),
  );

  const todos = [
    { title: "환불 승인·검토 대기", count: pending.approvalWaiting },
    { title: "환불 처리 대기 (승인 완료분)", count: pending.processWaiting },
  ];

  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card
            key={kpi.key}
            size="sm"
            className="border-l-4 px-2"
            style={{ borderLeftColor: TONE_COLOR[kpi.tone] }}
          >
            <div className="text-xs font-medium text-muted-foreground">
              {kpi.label}
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {formatMoney(kpi.value)}
            </div>
            <div className="text-[0.6875rem] font-medium text-muted-foreground">
              {kpi.sub}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="bg-white px-5 py-4 shadow-sm">
          <div className="text-sm font-semibold">
            일별 매출 · 환불 추이
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              {periodLabel}
            </span>
          </div>

          {trend.length === 0 ? (
            <p className="mt-6 text-sm font-medium text-muted-foreground">
              표시할 데이터가 없습니다.
            </p>
          ) : (
            <>
              <ScrollArea axis="x" className="mt-4 h-40">
                <div className="flex h-40 items-end gap-1">
                  {trend.map((point) => (
                    <div
                      key={point.ymd}
                      className="flex min-w-8 flex-1 flex-col items-center gap-1"
                      title={`${point.ymd} · 실납부 ${formatMoney(point.paid)} · 환불 ${formatMoney(point.refund)}`}
                    >
                      <div className="flex h-32 w-full items-end justify-center gap-0.5">
                        <div
                          className="w-2 bg-primary"
                          style={{
                            height: `${(point.paid / trendMax) * 100}%`,
                          }}
                        />
                        <div
                          className="w-2 bg-[#e5484d]"
                          style={{
                            height: `${(point.refund / trendMax) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground">
                        {point.ymd.slice(5).replace("-", "/")}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-3 flex gap-4 text-[11px] font-medium text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 bg-primary" /> 실납부
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 bg-[#e5484d]" /> 환불
                </span>
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white px-5 py-4 shadow-sm">
            <div className="text-sm font-semibold">처리 필요 항목</div>
            <div className="mt-3 space-y-2">
              {todos.map((todo) => (
                <div
                  key={todo.title}
                  className="flex items-center justify-between border border-border px-4 py-2"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        background: todo.count > 0 ? "#b88737" : "#2f8f4e",
                      }}
                    />
                    {todo.title}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {todo.count > 0 ? `${todo.count}건` : "없음"}
                  </span>
                </div>
              ))}
            </div>
            {/* 파일18 의 "일일정산 미마감"·"매출조정/취소 검토중"은 원장이 없어
                뺐다. 0건으로 그리면 "처리할 게 없다"로 읽혀 더 나쁘다. */}
            <p className="mt-3 text-[11px] font-medium text-muted-foreground">
              일일정산 미마감 · 매출조정/취소 항목은 해당 원장이 아직 없어
              표시하지 않습니다.
            </p>
          </div>

          <div className="bg-white px-5 py-4 shadow-sm">
            <div className="text-sm font-semibold">항목별 집계 요약</div>
            <Table className="mt-3">
              <TableHeader>
                <TableRow className="text-left hover:bg-transparent">
                  <TableHead
                    scope="col"
                    className="whitespace-normal py-2 font-semibold"
                  >
                    항목
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="whitespace-normal py-2 text-right font-semibold"
                  >
                    건수
                  </TableHead>
                  <TableHead
                    scope="col"
                    className="whitespace-normal py-2 text-right font-semibold"
                  >
                    금액
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((entry) => (
                  <TableRow key={entry.label}>
                    <TableCell className="whitespace-normal py-2">
                      {entry.label}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums">
                      {entry.count.toLocaleString()}건
                    </TableCell>
                    <TableCell className="py-2 text-right font-medium tabular-nums">
                      {formatMoney(entry.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="bg-white px-5 py-4 shadow-sm">
        <div className="text-sm font-semibold">프로그램별 매출 비중</div>
        {share.length === 0 ? (
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            표시할 데이터가 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {share.map((entry) => (
              <div key={entry.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{entry.name}</span>
                  <span className="font-semibold tabular-nums text-gray-600">
                    {formatMoney(entry.amount)} · {entry.pct}%
                  </span>
                </div>
                <div className="mt-1 h-2 w-full bg-muted">
                  <div
                    className="h-2 bg-primary"
                    style={{ width: `${entry.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
