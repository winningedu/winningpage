import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/http/client";
import { addDaysYmd, dayRangeUtc, ymdIn } from "@/lib/time/day";
import { formatDateTime } from "@/lib/time/format";
import { browserTimeZone } from "@/lib/time/zone";
import {
  type RevenueRow,
  revenuePendingQuery,
  revenueRowsKey,
  revenueRowsQuery,
  revenueServicesQuery,
  type ServiceTab,
} from "@/pages/admin/revenue/api";
import RevenueDashboard from "@/pages/admin/revenue/RevenueDashboard";
import { toastWarning } from "@/pages/admin/shared/adminToast";
import { downloadCsv } from "@/pages/admin/shared/csvExport";
import { ActionButton } from "@/pages/admin/shared/formFields";
import { useSensitiveActionGate } from "@/pages/admin/shared/SensitiveActionGate";
import { AdminCardsSkeleton } from "@/pages/admin/shared/skeletons/AdminCardsSkeleton";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";

// ---------------------------------------------------------------------------
// 매출 및 결제(revenue), Figma 4466:7097.
//
// 무엇이 달라졌나
//   예전 「매출 조정」, 「매출 정산」, 「일일정산」은 운영자가 손으로 적는 수기
//   장부였고 실제 결제와 연결이 없었다(2026-08-23 에 셋 다 없앴다). 이 화면은
//   **실제 결제**(orders/order_items)를 본다, admin_revenue_items 뷰가 원천이고,
//   주문 단위 할인 안분과 환불 차감을 거기서 이미 끝내 놓았다.
//   그래서 이 파일은 "기간을 자르고 합을 낸다"만 한다.
//
// 매출 정의 (사용자 확정 2026-08-23)
//   매출 = 정상 건의 최종 결제 금액 합 − 환불된 금액 합.
//   뷰의 net_amount 가 이미 그 차감을 마친 값이라 **net_amount 를 더하면 끝난다.**
//   ⚠️ 환불은 "승인"이 아니라 **실제 환불 완료**(refund_requests.status='completed')
//     기준이다. 승인 기준으로 빼면 토스 취소가 실패했을 때 돈은 안 나갔는데
//     매출만 줄어든다(뷰 상단 주석 참고).
// ---------------------------------------------------------------------------

const HEAD = "whitespace-normal px-4 py-3 font-semibold";

// QA 271 내보내기 컬럼, 화면 표의 여덟 칸에 결제자 이메일을 더한 것이다.
// 이메일은 표에 결제자명이 없을 때만 대체 표기로 쓰여 눈에 잘 띄지 않지만,
// 파일에는 있어야 정산 대사(對査)에 쓸 수 있다. 이 이메일 때문에 이 다운로드가
// 개인정보 반출이고, 그래서 게이트를 탄다.
const REVENUE_EXPORT_COLUMNS = [
  { key: "paid_at", label: "결제일시", type: "datetime" },
  { key: "payer_name", label: "결제자" },
  { key: "payer_email", label: "결제자 이메일" },
  { key: "item_name", label: "이용 서비스" },
  { key: "student_name", label: "이용 학생" },
  { key: "list_amount", label: "서비스 금액", type: "money" },
  { key: "discount_amount", label: "할인 금액", type: "money" },
  { key: "paid_amount", label: "최종 결제 금액", type: "money" },
  { key: "refunded_amount", label: "환불 금액", type: "money" },
  { key: "net_amount", label: "순매출", type: "money" },
  { key: "revenue_status", label: "상태" },
];

/** 달력 날짜 기준 이번 주 월요일의 YYYY-MM-DD. 주 시작은 월요일로 본다. */
function weekStartYmdOf(todayYmd: string): string {
  const [y = 0, m = 0, d = 0] = todayYmd.split("-").map(Number);
  // getUTCDay 는 0=일요일. 월요일을 0 으로 옮긴다.
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDaysYmd(todayYmd, -offset);
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function sumNet(rows: RevenueRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.net_amount || 0), 0);
}

export default function RevenueAdmin() {
  // 화면의 "오늘"과 기간은 보는 사람의 브라우저 시간대 기준이다.
  const timeZone = useMemo(() => browserTimeZone(), []);
  const todayYmd = useMemo(() => ymdIn(new Date(), timeZone), [timeZone]);
  const weekStartYmd = useMemo(() => weekStartYmdOf(todayYmd), [todayYmd]);
  const monthStartYmd = useMemo(() => `${todayYmd.slice(0, 7)}-01`, [todayYmd]);

  const [searchParams, setSearchParams] = useSearchParams();
  // 새로고침해도 탭과 기간이 남도록 URL 이 정본이다. 없으면 전체, 이번 달 1일~오늘.
  const activeService = searchParams.get("service") ?? "all";
  const periodFrom = searchParams.get("from") ?? monthStartYmd;
  const periodTo = searchParams.get("to") ?? todayYmd;

  // 날짜 입력은 조회를 누를 때까지 화면에만 둔다.
  const [fromYmd, setFromYmd] = useState(periodFrom);
  const [toYmd, setToYmd] = useState(periodTo);

  // 이번 달 1일~오늘. 오늘, 이번 주, 이번 달 카드 셋을 이 한 번의 조회로 다 계산한다
  // (이번 달이 나머지 둘을 포함하므로 따로 부를 이유가 없다).
  // 상한은 '미만'으로 비교한다, 다음 날 0시 직전의 1초도 새지 않는다.
  const monthRange = dayRangeUtc(monthStartYmd, todayYmd, timeZone);
  const monthQuery = useQuery(
    revenueRowsQuery(monthRange.from, monthRange.toExclusive),
  );
  // 달력으로 고른 기간. 표와 네 번째 카드가 같이 쓴다.
  const periodRange = dayRangeUtc(periodFrom, periodTo, timeZone);
  const periodQuery = useQuery(
    revenueRowsQuery(periodRange.from, periodRange.toExclusive),
  );

  const servicesQuery = useQuery(revenueServicesQuery);
  // QA 274 「처리 필요 항목」, 환불 원장에서 대기 건수만 센다. 목록을 통째로
  // 받지 않고 count 만 받는다(화면이 쓰는 건 숫자뿐이고, 환불 신청에는
  // 계좌, 사유 같은 개인정보가 들어 있어 필요 없는 걸 끌어오지 않는다).
  const pendingQuery = useQuery(revenuePendingQuery);

  // 처음 받을 때와 기간 키가 바뀔 때만 스켈레톤이다. 배경 재조회는 행을 그대로 둔다.
  const loading = monthQuery.isPending || periodQuery.isPending;
  const queryClient = useQueryClient();
  const loadError = monthQuery.error ?? periodQuery.error;
  const error = loadError
    ? loadError instanceof ApiError
      ? loadError.detail
      : loadError.message
    : "";
  // 실패하면 이전 값 대신 빈 목록을 보인다(조회 실패 때 옛 매출이 남지 않도록).
  const monthRows = useMemo<RevenueRow[]>(
    () => (monthQuery.error ? [] : (monthQuery.data ?? [])),
    [monthQuery.data, monthQuery.error],
  );
  const periodRows = useMemo<RevenueRow[]>(
    () => (periodQuery.error ? [] : (periodQuery.data ?? [])),
    [periodQuery.data, periodQuery.error],
  );

  // 탭 목록을 하드코딩하지 않는다, 서비스가 늘거나 이름이 바뀌면 화면만 옛것으로
  // 남는다. products 가 정본이고, 이 화면은 그 목록을 그대로 따른다.
  const serviceTabs = servicesQuery.data ?? [];
  // 대시보드 보조 지표라 실패해도 화면 전체를 막지 않는다, 0으로 두고 넘어간다.
  const pending = pendingQuery.data ?? {
    approvalWaiting: 0,
    processWaiting: 0,
  };

  useEffect(() => {
    if (servicesQuery.error)
      console.error("서비스 목록 조회 실패:", servicesQuery.error);
  }, [servicesQuery.error]);

  useEffect(() => {
    if (pendingQuery.error)
      console.error("환불 대기 건수 조회 실패:", pendingQuery.error);
  }, [pendingQuery.error]);

  useEffect(() => {
    if (loadError) console.error("매출 조회 실패:", loadError);
  }, [loadError]);

  // 개인정보 반출 게이트 (QA 271).
  const { requestAccess, gate } = useSensitiveActionGate();

  function applyPeriod() {
    // 사용자가 직접 누른 조회라 같은 기간이어도 옛 행 대신 스켈레톤 뒤 새 행을 보인다.
    const next = dayRangeUtc(fromYmd, toYmd, timeZone);
    void queryClient.resetQueries({
      queryKey: revenueRowsQuery(next.from, next.toExclusive).queryKey,
    });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("from", fromYmd);
        next.set("to", toYmd);
        return next;
      },
      { replace: true },
    );
  }

  function selectService(service: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (service === "all") next.delete("service");
        else next.set("service", service);
        return next;
      },
      { replace: true },
    );
  }

  function refresh() {
    void queryClient.resetQueries({ queryKey: revenueRowsKey });
  }

  // 서비스 필터는 이미 받아온 행에 걸면 된다, 탭을 옮길 때마다 다시 조회하면
  // 같은 기간을 반복해서 긁는다.
  const filteredMonth = useMemo(
    () =>
      activeService === "all"
        ? monthRows
        : monthRows.filter((row) => row.service_key === activeService),
    [monthRows, activeService],
  );
  const filteredPeriod = useMemo(
    () =>
      activeService === "all"
        ? periodRows
        : periodRows.filter((row) => row.service_key === activeService),
    [periodRows, activeService],
  );

  const todayTotal = useMemo(
    () =>
      sumNet(
        filteredMonth.filter(
          (row) => row.paid_at && ymdIn(row.paid_at, timeZone) === todayYmd,
        ),
      ),
    [filteredMonth, todayYmd, timeZone],
  );

  const weekTotal = useMemo(
    () =>
      sumNet(
        filteredMonth.filter(
          (row) => row.paid_at && ymdIn(row.paid_at, timeZone) >= weekStartYmd,
        ),
      ),
    [filteredMonth, weekStartYmd, timeZone],
  );

  const monthTotal = useMemo(() => sumNet(filteredMonth), [filteredMonth]);
  const periodTotal = useMemo(() => sumNet(filteredPeriod), [filteredPeriod]);

  const cards = [
    { label: `${todayYmd} 매출`, value: todayTotal },
    { label: "이번 주 매출", value: weekTotal },
    { label: "이번 달 매출", value: monthTotal },
    { label: "선택 기간 매출", value: periodTotal },
  ];

  const tabs: ServiceTab[] = [{ key: "all", label: "전체" }, ...serviceTabs];

  // QA 271, 매출, 결제 다운로드. 결제자 이름, 이메일이 함께 나가므로 게이트를 탄다.
  function exportRevenue() {
    downloadCsv(
      `매출및결제_${fromYmd}_${toYmd}.csv`,
      filteredPeriod as unknown as Record<string, unknown>[],
      REVENUE_EXPORT_COLUMNS,
    );
  }

  function requestExport() {
    if (filteredPeriod.length === 0) {
      toastWarning("내보낼 데이터가 없습니다.");
      return;
    }

    requestAccess({
      action: "download",
      resourceKey: "revenue",
      title: "매출 및 결제 다운로드",
      description: `${fromYmd} ~ ${toYmd} 결제 ${filteredPeriod.length.toLocaleString()}건(결제자 이름·이메일 포함)이 CSV 파일로 저장됩니다.`,
      rowCount: filteredPeriod.length,
      onGranted: exportRevenue,
    });
  }

  return (
    <div>
      {gate}

      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        {/* 서비스별 탭, 시안의 전체/목표관리/콜멘토/… 줄 */}
        <Tabs value={activeService} onValueChange={selectService}>
          <TabsList
            variant="line"
            className="mb-5 group-data-horizontal/tabs:h-auto w-full flex-wrap justify-start border-b border-border"
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="h-auto flex-none px-4 py-2 font-medium group-data-horizontal/tabs:after:bottom-0 data-active:text-primary data-active:after:bg-primary"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="mb-5">
            <AdminCardsSkeleton
              count={cards.length}
              label="매출 요약을 불러오는 중입니다."
            />
          </div>
        ) : (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.label} size="sm" className="bg-muted px-2">
                <div className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </div>
                <div className="text-2xl font-semibold">
                  {formatMoney(card.value)}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            기간
          </span>
          <Input
            type="date"
            aria-label="조회 시작일"
            value={fromYmd}
            max={toYmd}
            onChange={(event) => setFromYmd(event.target.value)}
            className="h-9 w-auto px-3 text-sm"
          />
          <span className="text-sm text-muted-foreground">~</span>
          <Input
            type="date"
            aria-label="조회 종료일"
            value={toYmd}
            min={fromYmd}
            onChange={(event) => setToYmd(event.target.value)}
            className="h-9 w-auto px-3 text-sm"
          />
          <ActionButton onClick={applyPeriod} disabled={loading}>
            {loading ? "불러오는 중..." : "조회"}
          </ActionButton>
          <Button type="button" variant="outline" size="lg" onClick={refresh}>
            <RefreshCw aria-hidden="true" />
            새로고침
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={requestExport}
          >
            <Download aria-hidden="true" />
            엑셀 다운로드
          </Button>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            조회에 실패했습니다: {error}
          </p>
        )}
      </div>

      {/* QA 274 총괄 대시보드, 파일18 「정산관리」의 정산 총괄표. 선택 기간과
          서비스 탭이 적용된 행(filteredPeriod)을 그대로 본다. */}
      {!loading && (
        <RevenueDashboard
          rows={filteredPeriod}
          pending={pending}
          timeZone={timeZone}
          periodLabel={`${periodFrom} ~ ${periodTo}`}
        />
      )}

      {loading ? (
        <AdminTableSkeleton
          columns={8}
          label="매출 및 결제 목록을 불러오는 중입니다."
        />
      ) : (
        <div className="bg-white shadow-sm">
          <Table className="min-w-[62.5rem]">
            <TableHeader>
              <TableRow className="bg-muted text-left hover:bg-transparent">
                <TableHead scope="col" className={HEAD}>
                  결제일시
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  결제자
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  이용 서비스
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  이용 학생
                </TableHead>
                <TableHead scope="col" className={`${HEAD} text-right`}>
                  서비스 금액
                </TableHead>
                <TableHead scope="col" className={`${HEAD} text-right`}>
                  할인 금액
                </TableHead>
                <TableHead scope="col" className={`${HEAD} text-right`}>
                  최종 결제 금액
                </TableHead>
                <TableHead scope="col" className={`${HEAD} w-24`}>
                  상태
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPeriod.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="whitespace-normal px-4 py-12 text-center text-muted-foreground"
                  >
                    이 기간에 결제 내역이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPeriod.map((row) => (
                  <TableRow key={row.order_item_id}>
                    <TableCell className="px-4 py-3">
                      {row.paid_at
                        ? formatDateTime(row.paid_at, timeZone)
                        : "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-3 font-medium">
                      {row.payer_name || row.payer_email || "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-3">
                      {row.item_name || "-"}
                    </TableCell>
                    <TableCell className="whitespace-normal px-4 py-3">
                      {row.student_name || "-"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {formatMoney(Number(row.list_amount || 0))}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {formatMoney(Number(row.discount_amount || 0))}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium">
                      {formatMoney(Number(row.paid_amount || 0))}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {row.revenue_status === "refunded" ? (
                        // 부분환불이면 최종 결제 금액과 실제 환불액이 다르다,
                        // 상태만 보고 전액이 돌아간 것으로 오해하지 않도록 금액을 같이 쓴다.
                        <span className="font-medium text-destructive">
                          환불 {formatMoney(Number(row.refunded_amount || 0))}
                        </span>
                      ) : (
                        <span className="text-gray-600">정상</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
