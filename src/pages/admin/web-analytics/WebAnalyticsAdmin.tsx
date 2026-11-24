import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/http/client";
import { addDaysYmd, ymdIn } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";
import { ActionButton, Field } from "@/pages/admin/shared/formFields";
import {
  type WebAnalyticsEventName,
  type WebAnalyticsProperty,
  type WebAnalyticsPropertyValue,
  type WebAnalyticsRange,
  type WebAnalyticsReport,
  webAnalyticsQueryOptions,
} from "./api";

// ---------------------------------------------------------------------------
// 본사 방문 분석(계획 10번, 분석 grill Q11, Q12). Vercel Web Analytics 를 서버 라우트로 읽어
// 방문 합계, 많이 본 페이지, 이벤트 10개 횟수와 속성별 나눔을 보여 준다. 기간은 URL 검색 파라미터
// (from, to, 브라우저 시간대의 날짜)에 두고, 없으면 오늘까지 최근 7일을 연다. 화면에 기간을 항상 보인다.
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 7;

const EVENT_LABELS: Record<WebAnalyticsEventName, string> = {
  signup_complete: "회원가입 완료",
  service_start: "서비스 시작",
  diagnosis_complete: "진단 완료",
  checkout_start: "결제 시작",
  payment_complete: "결제 완료",
  consult_apply: "상담 신청",
  kakao_inquiry_click: "카카오 문의 클릭",
  report_export: "보고서 내보내기",
  paywall_cta_click: "결제 유도 버튼 클릭",
  ai_regenerate: "AI 다시 만들기",
};

const PROPERTY_LABELS: Record<WebAnalyticsProperty, string> = {
  member_type: "회원 유형",
  service: "서비스",
  method: "방식",
  location: "위치",
  step: "단계",
};

function defaultRange(): WebAnalyticsRange {
  const tz = browserTimeZone();
  const today = ymdIn(new Date(), tz);
  return { from: addDaysYmd(today, -(DEFAULT_DAYS - 1)), to: today };
}

function useRangeParams(): [
  WebAnalyticsRange,
  (next: WebAnalyticsRange) => void,
] {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range = from && to ? { from, to } : defaultRange();
  const setRange = (next: WebAnalyticsRange) => {
    const params = new URLSearchParams(searchParams);
    params.set("from", next.from);
    params.set("to", next.to);
    setSearchParams(params);
  };
  return [range, setRange];
}

const numberFormat = new Intl.NumberFormat("ko-KR");

// 속성 값 한글 이름. 값 목록은 src/lib/analytics.ts(hqa-vercel)의 유니온과 같다.
// 타입이 값마다 이름을 요구한다. 그래도 응답에 목록 밖 값(Vercel 의 "Others" 묶음)이 오면 받은 값을 그대로 보인다.
const VALUE_LABELS: {
  [P in WebAnalyticsProperty]: Record<WebAnalyticsPropertyValue<P>, string>;
} = {
  member_type: {
    student: "학생",
    under14: "만 14세 미만 학생",
    parent: "학부모",
    school_student: "학교 학생",
  },
  service: {
    diagnosis: "진단",
    goal: "목표 관리",
    growth: "성장설계",
    performance: "수행평가",
    selfeval: "자기평가",
    inquiry: "심화탐구",
  },
  method: {
    card: "카드",
    virtual_account: "가상계좌",
    easy_pay: "간편결제",
    transfer: "계좌이체",
    other: "기타",
    pdf: "PDF",
    print: "인쇄",
    copy: "복사",
  },
  location: {
    footer: "하단",
    online_inquiry: "온라인 문의",
    mypage: "마이페이지",
    payment: "결제 결과",
    premium: "프리미엄",
    signup_notice: "가입 안내",
    chat_card: "대화 카드",
    banner: "배너",
    start_page: "시작 화면",
    survey: "설문",
    reports: "보고서 목록",
    usage_exhausted: "이용 횟수 소진",
    finalize: "저장 화면",
  },
  step: { topics: "주제", result: "결과" },
};

type Breakdown = WebAnalyticsReport["events"][number]["breakdowns"][number];

// 예: "방식: pdf 6, copy 3"
function breakdownText(breakdown: Breakdown): string {
  const label = PROPERTY_LABELS[breakdown.property];
  const values = breakdown.values
    .map(
      (v) =>
        `${
          (VALUE_LABELS[breakdown.property] as Record<string, string>)[
            v.value
          ] ?? v.value
        } ${numberFormat.format(v.count)}`,
    )
    .join(", ");
  return `${label}: ${values}`;
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-semibold text-foreground">
        {numberFormat.format(value)}
      </CardContent>
    </Card>
  );
}

function ReportBody({ report }: { report: WebAnalyticsReport }) {
  return (
    <>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard title="페이지 조회 수" value={report.totals.pageviews} />
        <StatCard title="방문자 수" value={report.totals.visitors} />
      </div>

      <h2 className="mb-2 text-lg font-semibold text-foreground">
        많이 본 페이지
      </h2>
      <Table aria-label="많이 본 페이지" className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">페이지</TableHead>
            <TableHead scope="col" className="text-right">
              조회 수
            </TableHead>
            <TableHead scope="col" className="text-right">
              방문자
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.topPages.map((page) => (
            <TableRow key={page.path}>
              <TableCell className="whitespace-normal">{page.path}</TableCell>
              <TableCell className="text-right">
                {numberFormat.format(page.pageviews)}
              </TableCell>
              <TableCell className="text-right">
                {numberFormat.format(page.visitors)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        {report.topPages.length === 0 && (
          <TableCaption>기록이 없어요.</TableCaption>
        )}
      </Table>

      <h2 className="mb-2 text-lg font-semibold text-foreground">
        이벤트 횟수
      </h2>
      <Table aria-label="이벤트 횟수">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">이벤트</TableHead>
            <TableHead scope="col" className="text-right">
              횟수
            </TableHead>
            <TableHead scope="col" className="text-right">
              방문자
            </TableHead>
            <TableHead scope="col">속성별 나눔</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.events.map((event) => (
            <TableRow key={event.name}>
              <TableCell>{EVENT_LABELS[event.name]}</TableCell>
              <TableCell className="text-right">
                {numberFormat.format(event.count)}
              </TableCell>
              <TableCell className="text-right">
                {numberFormat.format(event.visitors)}
              </TableCell>
              <TableCell className="whitespace-normal">
                {event.breakdowns
                  .filter((b) => b.values.length > 0)
                  .map((b) => (
                    <div key={b.property}>{breakdownText(b)}</div>
                  ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

// 입력 중인 기간은 이 폼만 들고 있다. 바깥에서 URL 기간이 바뀌면 key 가 바뀌어 새 값으로 다시 연다.
function RangeForm({
  range,
  onSubmit,
}: {
  range: WebAnalyticsRange;
  onSubmit: (next: WebAnalyticsRange) => void;
}) {
  const [draft, setDraft] = useState<WebAnalyticsRange>(range);
  return (
    <form
      className="mb-6 flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft);
      }}
    >
      <Field label="시작일">
        <Input
          type="date"
          value={draft.from}
          onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          className="h-10 font-medium"
        />
      </Field>
      <Field label="종료일">
        <Input
          type="date"
          value={draft.to}
          onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          className="h-10 font-medium"
        />
      </Field>
      <ActionButton type="submit">조회</ActionButton>
    </form>
  );
}

// 서버가 준 한글 문구(ApiError.detail)를 그대로 보인다. 그 밖의 실패는 기본 문구다.
function errorText(error: Error | null): string | null {
  if (!error) return null;
  return error instanceof ApiError
    ? error.detail
    : "방문 분석을 불러오지 못했어요.";
}

export default function WebAnalyticsAdmin() {
  const [range, setRange] = useRangeParams();
  const query = useQuery(webAnalyticsQueryOptions(range));
  const errorMessage = errorText(query.error);

  return (
    <div className="bg-white p-10 shadow-sm">
      <h1 className="text-2xl font-semibold text-foreground">방문 분석</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        기간 {range.from} ~ {range.to} (내 시간대 날짜, 운영 사이트 기준)
      </p>
      <RangeForm
        key={`${range.from}|${range.to}`}
        range={range}
        onSubmit={setRange}
      />
      {errorMessage && (
        <p role="alert" className="mb-3 text-sm font-medium text-destructive">
          {errorMessage}
        </p>
      )}
      {query.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          불러오는 중이에요.
        </p>
      )}
      {query.data && <ReportBody report={query.data} />}
    </div>
  );
}
