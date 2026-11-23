// 본사 대시보드 로그인 지표(분석 grill Q1, Q7, Q13). 로그인 기준 DAU, MAU 와 기간별 추이, 회원별 하루 1행 로그인 기록 표.
// 필터는 주소 검색 파라미터(LOGIN_PARAM)에 두고, "QA, 관리자 계정 포함" 스위치는 기관 현황(TenantOverview)이 그리는
// includeInternal 하나를 같이 읽는다. 데이터는 /api/admin/hq-dashboard/logins 로 읽는다.

import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useSearchParams } from "react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
import { fetchLoginLog, fetchLoginStats } from "./api";
import ErrorBox from "./ErrorBox";
import {
  LOGIN_PARAM,
  logSearch,
  readLoginFilters,
  statsSearch,
} from "./filters";
import LoginLogTable from "./LoginLogTable";
import LoginStats from "./LoginStats";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function Loading() {
  return (
    <div
      role="status"
      className="bg-white p-12 text-center text-sm text-muted-foreground shadow-sm"
    >
      데이터를 불러오는 중입니다.
    </div>
  );
}

export default function LoginSection() {
  const id = useId();
  const [params, setParams] = useSearchParams();
  const filters = readLoginFilters(
    params,
    ymdIn(new Date(), browserTimeZone()),
  );
  const stats = statsSearch(filters);
  const log = logSearch(filters);

  const statsQuery = useQuery({
    queryKey: ["hqDashboard", "logins", stats],
    queryFn: () => fetchLoginStats(stats),
  });
  const logQuery = useQuery({
    queryKey: ["hqDashboard", "logins", log],
    queryFn: () => fetchLoginLog(log),
  });

  // 필터를 바꾸면 기록 표는 1쪽으로 돌아간다.
  const setFilter = (key: string, value: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      next.delete(LOGIN_PARAM.page);
      return next;
    });
  const setPage = (page: number) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(LOGIN_PARAM.page, String(page));
      return next;
    });
  const setDate = (key: "from" | "to", value: string) => {
    if (DATE_RE.test(value)) setFilter(LOGIN_PARAM[key], value);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="mt-10 space-y-6">
      <div>
        <h2
          id={`${id}-title`}
          className="text-lg font-semibold text-foreground"
        >
          로그인 이용
        </h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-from`}>시작일</Label>
            <Input
              id={`${id}-from`}
              type="date"
              className="h-10 w-[10rem]"
              value={filters.from}
              max={filters.to}
              onChange={(e) => setDate("from", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-to`}>종료일</Label>
            <Input
              id={`${id}-to`}
              type="date"
              className="h-10 w-[10rem]"
              value={filters.to}
              min={filters.from}
              onChange={(e) => setDate("to", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-grain`}>묶음</Label>
            <NativeSelect
              id={`${id}-grain`}
              value={filters.grain}
              onChange={(e) => setFilter(LOGIN_PARAM.grain, e.target.value)}
            >
              <NativeSelectOption value="day">일</NativeSelectOption>
              <NativeSelectOption value="week">주</NativeSelectOption>
              <NativeSelectOption value="month">달</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-mau`}>MAU 기준</Label>
            <NativeSelect
              id={`${id}-mau`}
              value={filters.mau}
              onChange={(e) => setFilter(LOGIN_PARAM.mau, e.target.value)}
            >
              <NativeSelectOption value="calendar">
                달력 기준 한 달
              </NativeSelectOption>
              <NativeSelectOption value="rolling30">
                최근 30일
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
      </div>

      {statsQuery.error ? (
        <ErrorBox message={statsQuery.error.message} />
      ) : statsQuery.data ? (
        <LoginStats data={statsQuery.data} />
      ) : (
        <Loading />
      )}

      {logQuery.error ? (
        <ErrorBox message={logQuery.error.message} />
      ) : logQuery.data ? (
        <LoginLogTable data={logQuery.data} onPage={setPage} />
      ) : (
        <Loading />
      )}
    </section>
  );
}
