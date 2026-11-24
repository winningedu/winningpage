// 본사 대시보드 위닝 B2C 회원(분석 grill Q5 A11). 소속 기관이 없거나 기타 소속인 회원만 센다.
// site.features.hqB2cView 가 켜진 사이트(위닝)에서만 그린다. 기간과 "QA, 관리자 계정 포함" 스위치는
// 로그인 이용(LoginSection)의 주소 값을 따른다. DAU, MAU 는 logins?scope=b2c, 회원 수와 결제는 /b2c 로 읽는다.
// 결제 금액은 매출 및 결제 화면과 같은 원천(admin_revenue_items)의 합이다.

import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useSearchParams } from "react-router";
import { site } from "@/config/site";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
import { AdminCardsSkeleton } from "@/pages/admin/shared/skeletons/AdminCardsSkeleton";
import { fetchHqB2c, fetchLoginStats } from "./api";
import ErrorBox from "./ErrorBox";
import { b2cSearch, readLoginFilters, statsSearch } from "./filters";
import { StatCard } from "./LoginStats";
import { formatByMemberType } from "./labels";

const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;

function B2cBody() {
  const id = useId();
  const [params] = useSearchParams();
  const today = ymdIn(new Date(), browserTimeZone());
  const filters = readLoginFilters(params, today);
  const stats = statsSearch(filters, "b2c");
  const summary = b2cSearch(filters);
  const statsQuery = useQuery({
    queryKey: ["hqDashboard", "logins", stats],
    queryFn: ({ signal }) => fetchLoginStats(stats, signal),
  });
  const summaryQuery = useQuery({
    queryKey: ["hqDashboard", "b2c", summary],
    queryFn: ({ signal }) => fetchHqB2c(summary, signal),
  });
  const error = statsQuery.error ?? summaryQuery.error;
  const s = statsQuery.data;
  const b = summaryQuery.data;

  return (
    <section aria-labelledby={`${id}-title`} className="mt-10 space-y-4">
      <div>
        <h2
          id={`${id}-title`}
          className="text-lg font-semibold text-foreground"
        >
          위닝 B2C 회원
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          소속 기관이 없거나 기타 소속인 회원입니다. 회원 수는 오늘 기준, 결제는
          결제일 기준입니다.
        </p>
      </div>
      {error ? (
        <ErrorBox message={error.message} />
      ) : s && b ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="B2C 회원"
            value={b.members.total.toLocaleString()}
            from={today}
            to={today}
            note={formatByMemberType(b.members.byMemberType)}
          />
          <StatCard
            label="B2C DAU 일평균"
            value={s.dau.average.toLocaleString()}
            from={s.dau.from}
            to={s.dau.to}
            source={s.dau.source}
          />
          <StatCard
            label={
              s.mau.mode === "calendar"
                ? "B2C MAU 달력 기준"
                : "B2C MAU 최근 30일"
            }
            value={s.mau.members.toLocaleString()}
            from={s.mau.from}
            to={s.mau.to}
            source={s.mau.source}
          />
          <StatCard
            label="결제 회원"
            value={b.payments.payingMembers.toLocaleString()}
            from={b.from}
            to={b.to}
            note={`주문 ${b.payments.orderCount.toLocaleString()}건`}
          />
          <StatCard
            label="결제 금액"
            value={won(b.payments.paidAmount)}
            from={b.from}
            to={b.to}
          />
          <StatCard
            label="환불 금액"
            value={won(b.payments.refundedAmount)}
            from={b.from}
            to={b.to}
          />
          <StatCard
            label="순매출"
            value={won(b.payments.netAmount)}
            from={b.from}
            to={b.to}
          />
        </div>
      ) : (
        <AdminCardsSkeleton count={7} label="B2C 회원 현황을 불러오는 중" />
      )}
    </section>
  );
}

export default function B2cSection() {
  return site.features.hqB2cView ? <B2cBody /> : null;
}
