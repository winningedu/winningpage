import { Download, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import RevenueDashboard, {
  type RevenuePending,
} from "@/components/admin/RevenueDashboard";
import { useSensitiveActionGate } from "@/components/admin/SensitiveActionGate";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "@/pages/admin/shared/csvExport";
import { ActionButton } from "@/pages/admin/shared/formFields";

// ---------------------------------------------------------------------------
// 매출 및 결제(revenue) — Figma 4466:7097.
//
// 무엇이 달라졌나
//   예전 「매출 조정」·「매출 정산」·「일일정산」은 운영자가 손으로 적는 수기
//   장부였고 실제 결제와 연결이 없었다(2026-08-23 에 셋 다 없앴다). 이 화면은
//   **실제 결제**(orders/order_items)를 본다 — admin_revenue_items 뷰가 원천이고,
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

interface RevenueRow {
  order_item_id: string;
  order_id: string;
  paid_at: string | null;
  payer_name: string | null;
  payer_email: string | null;
  student_name: string | null;
  service_key: string | null;
  item_name: string | null;
  list_amount: number | null;
  discount_amount: number | null;
  paid_amount: number | null;
  refunded_amount: number | null;
  revenue_status: string;
  net_amount: number | null;
}

interface ServiceTab {
  key: string;
  label: string;
}

// PostgREST 응답 상한이 1,000행이라 그보다 크게 잡아도 잘려 나온다 — Admin.tsx 의
// CSV 내보내기(EXPORT_CHUNK)와 같은 제약이라 값도 맞춘다.
const PAGE_SIZE = 1000;

const VIEW_COLUMNS =
  "order_item_id, order_id, paid_at, payer_name, payer_email, student_name, service_key, item_name, list_amount, discount_amount, paid_amount, refunded_amount, revenue_status, net_amount";

// QA 271 내보내기 컬럼 — 화면 표의 여덟 칸에 결제자 이메일을 더한 것이다.
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

/**
 * KST 기준 'YYYY-MM-DD'. 브라우저 시간대와 무관하게 같은 값을 낸다.
 *
 * 왜 필요한가 — "오늘 매출"은 한국 날짜여야 한다. 로컬 시간대를 그냥 쓰면 해외에서
 * 접속한 관리자에게 다른 날짜가 보이고, UTC 를 쓰면 매일 09:00 이전이 전날로 잡힌다.
 * 'sv-SE' 로케일이 ISO 와 같은 YYYY-MM-DD 형식을 주는 성질을 이용한다.
 */
function toKstYmd(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** KST 날짜(YYYY-MM-DD)의 0시 → timestamptz 비교에 쓸 ISO 문자열. */
function kstDayStart(ymd: string): string {
  return `${ymd}T00:00:00+09:00`;
}

/** KST 날짜의 끝(다음 날 0시). 상한은 '미만'으로 비교한다 — 23:59:59 로 자르면 그 사이 1초가 샌다. */
function kstDayEnd(ymd: string): string {
  const next = new Date(`${ymd}T00:00:00+09:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

/** KST 기준 이번 주 월요일의 YYYY-MM-DD. 주 시작은 월요일로 본다. */
function kstWeekStartYmd(todayYmd: string): string {
  const date = new Date(`${todayYmd}T00:00:00+09:00`);
  // getUTCDay 는 0=일요일. 월요일을 0 으로 옮긴다.
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return toKstYmd(date);
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/**
 * 기간 안의 뷰 행을 전부 가져온다. 1,000행씩 끊어 받는다 — 한 달치 결제가 그보다
 * 많아지면 조용히 잘려서 매출이 과소 집계되기 때문에 페이지를 끝까지 돈다.
 */
async function fetchRange(fromIso: string, toIso: string) {
  const rows: RevenueRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("admin_revenue_items")
      .select(VIEW_COLUMNS)
      .gte("paid_at", fromIso)
      .lt("paid_at", toIso)
      .order("paid_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data as unknown as RevenueRow[]) || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function sumNet(rows: RevenueRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.net_amount || 0), 0);
}

export default function RevenueAdmin() {
  const todayYmd = useMemo(() => toKstYmd(new Date()), []);
  const weekStartYmd = useMemo(() => kstWeekStartYmd(todayYmd), [todayYmd]);
  const monthStartYmd = useMemo(() => `${todayYmd.slice(0, 7)}-01`, [todayYmd]);

  const [serviceTabs, setServiceTabs] = useState<ServiceTab[]>([]);
  const [activeService, setActiveService] = useState("all");

  const [fromYmd, setFromYmd] = useState(monthStartYmd);
  const [toYmd, setToYmd] = useState(todayYmd);

  // 이번 달 1일~오늘. 오늘·이번 주·이번 달 카드 셋을 이 한 번의 조회로 다 계산한다
  // (이번 달이 나머지 둘을 포함하므로 따로 부를 이유가 없다).
  const [monthRows, setMonthRows] = useState<RevenueRow[]>([]);
  // 달력으로 고른 기간. 표와 네 번째 카드가 같이 쓴다.
  const [periodRows, setPeriodRows] = useState<RevenueRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // QA 274 「처리 필요 항목」 — 환불 원장에서 대기 건수만 센다. 목록을 통째로
  // 받지 않고 count 만 받는다(화면이 쓰는 건 숫자뿐이고, 환불 신청에는
  // 계좌·사유 같은 개인정보가 들어 있어 필요 없는 걸 끌어오지 않는다).
  const [pending, setPending] = useState<RevenuePending>({
    approvalWaiting: 0,
    processWaiting: 0,
  });

  // 개인정보 반출 게이트 (QA 271).
  const { requestAccess, gate } = useSensitiveActionGate();

  async function loadServices() {
    // 탭 목록을 하드코딩하지 않는다 — 서비스가 늘거나 이름이 바뀌면 화면만 옛것으로
    // 남는다. products 가 정본이고, 이 화면은 그 목록을 그대로 따른다.
    const { data, error: serviceError } = await supabase
      .from("products")
      .select("service_key, service_name, service_sort_order")
      .eq("is_active", true)
      .order("service_sort_order");

    if (serviceError) {
      console.error("서비스 목록 조회 실패:", serviceError);
      return;
    }

    const seen = new Map<string, string>();
    for (const row of data || []) {
      const key = String(row.service_key || "");
      if (key && !seen.has(key)) seen.set(key, String(row.service_name || key));
    }

    setServiceTabs([...seen.entries()].map(([key, label]) => ({ key, label })));
  }

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const [month, period] = await Promise.all([
        fetchRange(kstDayStart(monthStartYmd), kstDayEnd(todayYmd)),
        fetchRange(kstDayStart(fromYmd), kstDayEnd(toYmd)),
      ]);
      setMonthRows(month);
      setPeriodRows(period);
    } catch (loadError) {
      console.error("매출 조회 실패:", loadError);
      setError((loadError as Error).message);
      setMonthRows([]);
      setPeriodRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadPending() {
    try {
      const [approval, process] = await Promise.all([
        // 아직 승인/반려가 안 난 신청.
        supabase
          .from("refund_requests")
          .select("id", { count: "exact", head: true })
          .eq("approval_status", "requested"),
        // 승인은 났는데 실제 환불이 안 끝난 건. status='completed' 가 실제 환불
        // 완료라(admin_revenue_items 주석) 그 전 단계를 센다.
        supabase
          .from("refund_requests")
          .select("id", { count: "exact", head: true })
          .eq("approval_status", "approved")
          .in("status", ["requested", "processing"]),
      ]);

      if (approval.error) throw approval.error;
      if (process.error) throw process.error;

      setPending({
        approvalWaiting: approval.count ?? 0,
        processWaiting: process.count ?? 0,
      });
    } catch (pendingError) {
      // 대시보드 보조 지표라 실패해도 화면 전체를 막지 않는다 — 0으로 두고 넘어간다.
      console.error("환불 대기 건수 조회 실패:", pendingError);
    }
  }

  const onMountLoad = useEffectEvent(() => {
    loadServices();
    loadRows();
    loadPending();
  });

  useEffect(() => {
    onMountLoad();
  }, []);

  // 서비스 필터는 이미 받아온 행에 걸면 된다 — 탭을 옮길 때마다 다시 조회하면
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
          (row) => row.paid_at && toKstYmd(new Date(row.paid_at)) === todayYmd,
        ),
      ),
    [filteredMonth, todayYmd],
  );

  const weekTotal = useMemo(
    () =>
      sumNet(
        filteredMonth.filter(
          (row) =>
            row.paid_at && toKstYmd(new Date(row.paid_at)) >= weekStartYmd,
        ),
      ),
    [filteredMonth, weekStartYmd],
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

  // QA 271 — 매출·결제 다운로드. 결제자 이름·이메일이 함께 나가므로 게이트를 탄다.
  function exportRevenue() {
    downloadCsv(
      `매출및결제_${fromYmd}_${toYmd}.csv`,
      filteredPeriod as unknown as Record<string, unknown>[],
      REVENUE_EXPORT_COLUMNS,
    );
  }

  function requestExport() {
    if (filteredPeriod.length === 0) {
      alert("내보낼 데이터가 없습니다.");
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
        {/* 서비스별 탭 — 시안의 전체/목표관리/콜멘토/… 줄 */}
        <div className="mb-5 flex flex-wrap gap-1 border-b border-[#edf0f4]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveService(tab.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold ${
                activeService === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="border border-[#edf0f4] bg-[#fafafa] px-5 py-4"
            >
              <div className="text-sm font-bold text-gray-500">
                {card.label}
              </div>
              <div className="mt-2 text-2xl font-black">
                {formatMoney(card.value)}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-gray-500">기간</span>
          <input
            type="date"
            value={fromYmd}
            max={toYmd}
            onChange={(event) => setFromYmd(event.target.value)}
            className="h-9 border border-gray-400 px-3 text-sm outline-hidden"
          />
          <span className="text-sm text-gray-500">~</span>
          <input
            type="date"
            value={toYmd}
            min={fromYmd}
            onChange={(event) => setToYmd(event.target.value)}
            className="h-9 border border-gray-400 px-3 text-sm outline-hidden"
          />
          <ActionButton onClick={loadRows} disabled={loading}>
            {loading ? "불러오는 중..." : "조회"}
          </ActionButton>
          <button
            type="button"
            onClick={loadRows}
            className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
          <button
            type="button"
            onClick={requestExport}
            className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
          >
            <Download size={14} />
            엑셀 다운로드
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm font-bold text-red-600">
            조회에 실패했습니다: {error}
          </p>
        )}
      </div>

      {/* QA 274 총괄 대시보드 — 파일18 「정산관리」의 정산 총괄표. 선택 기간과
          서비스 탭이 적용된 행(filteredPeriod)을 그대로 본다. */}
      {!loading && (
        <RevenueDashboard
          rows={filteredPeriod}
          pending={pending}
          toKstYmd={toKstYmd}
          periodLabel={`${fromYmd} ~ ${toYmd}`}
        />
      )}

      {loading ? (
        <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
          데이터를 불러오는 중입니다.
        </div>
      ) : (
        <ScrollArea axis="x" className="bg-white shadow-sm">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-[#edf0f4] bg-[#fafafa] text-left">
                <th className="px-4 py-3 font-black">결제일시</th>
                <th className="px-4 py-3 font-black">결제자</th>
                <th className="px-4 py-3 font-black">이용 서비스</th>
                <th className="px-4 py-3 font-black">이용 학생</th>
                <th className="px-4 py-3 text-right font-black">서비스 금액</th>
                <th className="px-4 py-3 text-right font-black">할인 금액</th>
                <th className="px-4 py-3 text-right font-black">
                  최종 결제 금액
                </th>
                <th className="w-24 px-4 py-3 font-black">상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeriod.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center font-bold text-gray-500"
                  >
                    이 기간에 결제 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredPeriod.map((row) => (
                  <tr
                    key={row.order_item_id}
                    className="border-b border-[#edf0f4]"
                  >
                    <td className="px-4 py-3">{formatDateTime(row.paid_at)}</td>
                    <td className="px-4 py-3 font-bold">
                      {row.payer_name || row.payer_email || "-"}
                    </td>
                    <td className="px-4 py-3">{row.item_name || "-"}</td>
                    <td className="px-4 py-3">{row.student_name || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(Number(row.list_amount || 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(Number(row.discount_amount || 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {formatMoney(Number(row.paid_amount || 0))}
                    </td>
                    <td className="px-4 py-3">
                      {row.revenue_status === "refunded" ? (
                        // 부분환불이면 최종 결제 금액과 실제 환불액이 다르다 —
                        // 상태만 보고 전액이 돌아간 것으로 오해하지 않도록 금액을 같이 쓴다.
                        <span className="font-bold text-red-600">
                          환불 {formatMoney(Number(row.refunded_amount || 0))}
                        </span>
                      ) : (
                        <span className="text-gray-600">정상</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}
