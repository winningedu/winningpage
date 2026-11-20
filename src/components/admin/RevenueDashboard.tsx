import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
          <div
            key={kpi.key}
            className="border-l-4 bg-white px-5 py-4 shadow-sm"
            style={{ borderLeftColor: TONE_COLOR[kpi.tone] }}
          >
            <div className="text-xs font-bold text-gray-500">{kpi.label}</div>
            <div className="mt-2 text-xl font-black tabular-nums">
              {formatMoney(kpi.value)}
            </div>
            <div className="mt-1 text-[11px] font-bold text-muted-foreground">
              {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="bg-white px-5 py-4 shadow-sm">
          <div className="text-sm font-black">
            일별 매출 · 환불 추이
            <span className="ml-2 text-xs font-bold text-muted-foreground">
              {periodLabel}
            </span>
          </div>

          {trend.length === 0 ? (
            <p className="mt-6 text-sm font-bold text-muted-foreground">
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
                      <div className="text-[10px] font-bold text-muted-foreground">
                        {point.ymd.slice(5).replace("-", "/")}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-3 flex gap-4 text-[11px] font-bold text-gray-500">
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
            <div className="text-sm font-black">처리 필요 항목</div>
            <div className="mt-3 space-y-2">
              {todos.map((todo) => (
                <div
                  key={todo.title}
                  className="flex items-center justify-between border border-[#edf0f4] px-4 py-2"
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        background: todo.count > 0 ? "#b88737" : "#2f8f4e",
                      }}
                    />
                    {todo.title}
                  </span>
                  <span className="text-sm font-black tabular-nums">
                    {todo.count > 0 ? `${todo.count}건` : "없음"}
                  </span>
                </div>
              ))}
            </div>
            {/* 파일18 의 "일일정산 미마감"·"매출조정/취소 검토중"은 원장이 없어
                뺐다. 0건으로 그리면 "처리할 게 없다"로 읽혀 더 나쁘다. */}
            <p className="mt-3 text-[11px] font-bold text-muted-foreground">
              일일정산 미마감 · 매출조정/취소 항목은 해당 원장이 아직 없어
              표시하지 않습니다.
            </p>
          </div>

          <div className="bg-white px-5 py-4 shadow-sm">
            <div className="text-sm font-black">항목별 집계 요약</div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-[#edf0f4] text-left">
                  <th className="py-2 font-black">항목</th>
                  <th className="py-2 text-right font-black">건수</th>
                  <th className="py-2 text-right font-black">금액</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((entry) => (
                  <tr key={entry.label} className="border-b border-[#edf0f4]">
                    <td className="py-2">{entry.label}</td>
                    <td className="py-2 text-right tabular-nums">
                      {entry.count.toLocaleString()}건
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums">
                      {formatMoney(entry.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white px-5 py-4 shadow-sm">
        <div className="text-sm font-black">프로그램별 매출 비중</div>
        {share.length === 0 ? (
          <p className="mt-4 text-sm font-bold text-muted-foreground">
            표시할 데이터가 없습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {share.map((entry) => (
              <div key={entry.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold">{entry.name}</span>
                  <span className="font-black tabular-nums text-gray-600">
                    {formatMoney(entry.amount)} · {entry.pct}%
                  </span>
                </div>
                <div className="mt-1 h-2 w-full bg-[#f1f3f6]">
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
