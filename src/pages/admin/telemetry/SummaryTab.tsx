import { type ReactNode, useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_FONT_SIZE } from "@/components/charts/chartTheme";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SummaryItem, SummaryResponse } from "./api";
import {
  formatInt,
  formatMs,
  formatPercent,
  formatUsd,
  NO_DATA,
  serviceLabel,
} from "./format";
import { Th } from "./TableCells";

// 서비스별 선 색. 서비스 순서대로 돌려 쓴다.
const SERIES_COLORS = [
  CHART_COLORS.line,
  "#1D63B3",
  "#2E8B57",
  "#B88737",
  "#8B3A62",
  "#5AA6F0",
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold">{value || NO_DATA}</div>
      </CardContent>
    </Card>
  );
}

type ChartRow = Record<string, string | number | null>;

function buildCallsChart(items: SummaryItem[]) {
  const services = [...new Set(items.map((i) => i.service))].sort();
  const byDay = new Map<string, ChartRow>();
  for (const item of items) {
    const row = byDay.get(item.day) ?? { day: item.day };
    row[item.service] = item.calls;
    byDay.set(item.day, row);
  }
  const rows = [...byDay.values()].sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  );
  return { services, rows };
}

// 일별 금액 합계. 그날 단가가 없는 모델이 섞였으면 합계를 만들지 않고 비워 둔다.
function buildCostChart(items: SummaryItem[]): ChartRow[] {
  const byDay = new Map<string, number | null>();
  for (const item of items) {
    const prev = byDay.get(item.day);
    if (prev === null || item.costUsd === null) {
      byDay.set(item.day, null);
    } else {
      byDay.set(item.day, (prev ?? 0) + item.costUsd);
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, costUsd]) => ({ day, costUsd }));
}

function ChartBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[16rem]">{children}</CardContent>
    </Card>
  );
}

export default function SummaryTab({ data }: { data: SummaryResponse }) {
  const { totals, items } = data;
  const calls = useMemo(() => buildCallsChart(items), [items]);
  const cost = useMemo(() => buildCostChart(items), [items]);
  const axis = {
    axisLine: false,
    tickLine: false,
    tick: { fill: CHART_COLORS.label, fontSize: CHART_FONT_SIZE },
  };

  return (
    <div className="space-y-4">
      {!data.pricingConfigured && (
        <div className="border border-[#B88737] bg-[#FFF8E8] px-4 py-3 text-sm font-medium text-[#7A4A12]">
          단가가 없어 금액은 비워 둡니다. 단가 탭에서 입력하세요.
        </div>
      )}
      <div className="grid grid-cols-6 gap-3">
        <StatCard label="호출 수" value={formatInt(totals.calls)} />
        <StatCard label="실패율" value={formatPercent(totals.failureRate)} />
        <StatCard label="재요청률" value={formatPercent(totals.retryRate)} />
        <StatCard
          label="캐시 토큰 비율"
          value={formatPercent(totals.cachedRatio)}
        />
        <StatCard label="p95 ms" value={formatMs(totals.p95Ms)} />
        <StatCard label="금액 USD" value={formatUsd(totals.costUsd)} />
      </div>

      {items.length === 0 ? (
        <div className="bg-white p-12 text-center text-sm text-muted-foreground shadow-sm">
          조회된 호출이 없습니다.
        </div>
      ) : (
        <div className="bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <ChartBox title="일별 호출 수">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calls.rows}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="day" {...axis} />
                  <YAxis width={40} {...axis} />
                  <Tooltip />
                  {calls.services.map((service, i) => (
                    <Line
                      key={service}
                      dataKey={service}
                      name={serviceLabel(service)}
                      stroke={
                        SERIES_COLORS[i % SERIES_COLORS.length] ??
                        CHART_COLORS.line
                      }
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
            <ChartBox title="일별 금액 합계 USD">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cost}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="day" {...axis} />
                  <YAxis width={48} {...axis} />
                  <Tooltip />
                  <Line
                    dataKey="costUsd"
                    name="금액 USD"
                    stroke={CHART_COLORS.line}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartBox>
          </div>

          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <Th>일</Th>
                  <Th>서비스</Th>
                  <Th>호출</Th>
                  <Th>실패율</Th>
                  <Th>재요청률</Th>
                  <Th>prompt</Th>
                  <Th>output</Th>
                  <Th>cached</Th>
                  <Th>thoughts</Th>
                  <Th>캐시 비율</Th>
                  <Th>p50 ms</Th>
                  <Th>p95 ms</Th>
                  <Th>금액 USD</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={`${row.day}-${row.service}`}>
                    <TableCell>{row.day}</TableCell>
                    <TableCell>{serviceLabel(row.service)}</TableCell>
                    <TableCell>{formatInt(row.calls)}</TableCell>
                    <TableCell>{formatPercent(row.failureRate)}</TableCell>
                    <TableCell>{formatPercent(row.retryRate)}</TableCell>
                    <TableCell>{formatInt(row.promptTokens)}</TableCell>
                    <TableCell>{formatInt(row.outputTokens)}</TableCell>
                    <TableCell>{formatInt(row.cachedTokens)}</TableCell>
                    <TableCell>{formatInt(row.thoughtsTokens)}</TableCell>
                    <TableCell>{formatPercent(row.cachedRatio)}</TableCell>
                    <TableCell>{formatMs(row.p50Ms)}</TableCell>
                    <TableCell>{formatMs(row.p95Ms)}</TableCell>
                    <TableCell>{formatUsd(row.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
