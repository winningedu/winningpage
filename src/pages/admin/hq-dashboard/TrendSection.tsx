// 본사 대시보드 가입, 결제 추이(분석 grill Q5 A10). 로그인 이용(LoginSection)과 같은 기간, 묶음, MAU 기준과
// "QA, 관리자 계정 포함" 스위치를 주소에서 읽는다(기간 선택을 따로 두지 않는다). 데이터는 /api/admin/hq-dashboard/trends.

import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useSearchParams } from "react-router";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, CHART_FONT_SIZE } from "@/components/charts/chartTheme";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
import { AdminTableFrame } from "@/pages/admin/shared/AdminTableFrame";
import { AdminLineSkeleton } from "@/pages/admin/shared/skeletons/AdminLineSkeleton";
import { fetchHqTrends } from "./api";
import ErrorBox from "./ErrorBox";
import { readLoginFilters, trendSearch } from "./filters";
import { period } from "./LoginStats";
import { formatByMemberType } from "./labels";

export default function TrendSection() {
  const id = useId();
  const [params] = useSearchParams();
  const search = trendSearch(
    readLoginFilters(params, ymdIn(new Date(), browserTimeZone())),
  );
  const query = useQuery({
    queryKey: ["hqDashboard", "trends", search],
    queryFn: ({ signal }) => fetchHqTrends(search, signal),
  });
  const axis = {
    axisLine: false,
    tickLine: false,
    tick: { fill: CHART_COLORS.label, fontSize: CHART_FONT_SIZE },
  };

  return (
    <section aria-labelledby={`${id}-title`} className="mt-10 space-y-4">
      <div>
        <h2
          id={`${id}-title`}
          className="text-lg font-semibold text-foreground"
        >
          가입과 결제 추이
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          기간과 묶음은 로그인 이용에서 고른 값을 따릅니다.
        </p>
      </div>
      {query.error ? (
        <ErrorBox message={query.error.message} />
      ) : query.data ? (
        <Card size="sm">
          <CardContent className="space-y-4">
            <div className="h-[16rem]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={query.data.series}>
                  <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="start" {...axis} />
                  <YAxis width={40} allowDecimals={false} {...axis} />
                  <Tooltip />
                  <Legend />
                  <Line
                    dataKey="signups"
                    name="새 가입"
                    stroke={CHART_COLORS.line}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="paidOrders"
                    name="결제 주문"
                    stroke={CHART_COLORS.label}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <AdminTableFrame
              label="기간별 가입과 결제"
              aria-label="기간별 가입과 결제"
            >
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">새 가입</TableHead>
                  <TableHead>유형별</TableHead>
                  <TableHead className="text-right">결제 주문</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.series.map((row) => (
                  <TableRow key={row.start}>
                    <TableCell>{period(row.start, row.end)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.signups.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {formatByMemberType(row.signupsByMemberType)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.paidOrders.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AdminTableFrame>
          </CardContent>
        </Card>
      ) : (
        <AdminLineSkeleton className="h-64 w-full" label="추이를 불러오는 중" />
      )}
    </section>
  );
}
