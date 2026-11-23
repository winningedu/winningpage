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
import { Badge } from "@/components/ui/badge";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LoginSource, LoginStatsResponse } from "./api";
import { formatByMemberType, SOURCE_LABEL } from "./labels";

const GRAIN_LABEL = { day: "일", week: "주", month: "달" } as const;

function SourceBadge({ source }: { source: LoginSource }) {
  return (
    <Badge variant={source === "measured" ? "secondary" : "outline"}>
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

export function period(from: string, to: string) {
  return from === to ? from : `${from} ~ ${to}`;
}

export function StatCard({
  label,
  value,
  from,
  to,
  source,
  note,
}: {
  label: string;
  value: string;
  from: string;
  to: string;
  source?: LoginSource;
  note?: string;
}) {
  return (
    <section aria-label={label}>
      <Card size="sm">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-xl font-semibold">{value}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{period(from, to)}</span>
            {source && <SourceBadge source={source} />}
            {note && <span>{note}</span>}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export default function LoginStats({ data }: { data: LoginStatsResponse }) {
  const axis = {
    axisLine: false,
    tickLine: false,
    tick: { fill: CHART_COLORS.label, fontSize: CHART_FONT_SIZE },
  };
  const mauLabel =
    data.mau.mode === "calendar" ? "MAU 달력 기준" : "MAU 최근 30일";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {data.firstMeasuredOn
          ? `로그인 실측은 ${data.firstMeasuredOn}부터입니다. 그 전은 활동 기록으로 추정합니다.`
          : "로그인 실측 기록이 아직 없어 활동 기록으로 추정합니다."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="DAU 일평균"
          value={data.dau.average.toLocaleString()}
          from={data.dau.from}
          to={data.dau.to}
          source={data.dau.source}
        />
        <StatCard
          label={mauLabel}
          value={data.mau.members.toLocaleString()}
          from={data.mau.from}
          to={data.mau.to}
          source={data.mau.source}
        />
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="font-semibold">
            {GRAIN_LABEL[data.grain]}별 이용자 ({period(data.from, data.to)})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-[16rem]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series}>
                <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                <XAxis dataKey="start" {...axis} />
                <YAxis width={40} allowDecimals={false} {...axis} />
                <Tooltip />
                <Line
                  dataKey="members"
                  name="이용자"
                  stroke={CHART_COLORS.line}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Table aria-label="기간별 이용자">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>기간</TableHead>
                <TableHead>출처</TableHead>
                <TableHead>이용자</TableHead>
                <TableHead>유형별</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.series.map((row) => (
                <TableRow key={row.start}>
                  <TableCell>{period(row.start, row.end)}</TableCell>
                  <TableCell>
                    <SourceBadge source={row.source} />
                  </TableCell>
                  <TableCell>{row.members.toLocaleString()}</TableCell>
                  <TableCell>{formatByMemberType(row.byMemberType)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
