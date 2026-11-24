import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCardsSkeleton } from "@/pages/admin/shared/skeletons/AdminCardsSkeleton";
import { AdminDetailSkeleton } from "@/pages/admin/shared/skeletons/AdminDetailSkeleton";
import { AdminTableSkeleton } from "@/pages/admin/shared/skeletons/AdminTableSkeleton";
import {
  errorMessage,
  fetchCalls,
  fetchCitations,
  fetchPricing,
  fetchSummary,
  telemetryKeys,
} from "./api";
import CallsTab from "./CallsTab";
import CitationsTab from "./CitationsTab";
import FilterForm from "./FilterForm";
import PricingTab from "./PricingTab";
import {
  type AiTelemetryTab,
  buildCallsSearch,
  buildCitationsSearch,
  buildSummarySearch,
  readQuery,
  withFilters,
  withPage,
  withTab,
} from "./query";
import SummaryTab from "./SummaryTab";

const TABS: { key: AiTelemetryTab; label: string }[] = [
  { key: "summary", label: "요약" },
  { key: "calls", label: "호출 목록" },
  { key: "citations", label: "자료 인용" },
  { key: "pricing", label: "단가" },
];

interface Props {
  config: { title: string; [key: string]: unknown };
}

export default function TelemetryAdmin({ config }: Props) {
  const [params, setParams] = useSearchParams();
  const [now] = useState(() => new Date());
  const query = readQuery(params, now);
  const { tab } = query;

  const summarySearch = buildSummarySearch(query);
  const callsSearch = buildCallsSearch(query);
  const citationsSearch = buildCitationsSearch(query);

  const summary = useQuery({
    queryKey: telemetryKeys.summary(summarySearch),
    queryFn: ({ signal }) => fetchSummary(summarySearch, signal),
    enabled: tab === "summary",
  });
  const calls = useQuery({
    queryKey: telemetryKeys.calls(callsSearch),
    queryFn: ({ signal }) => fetchCalls(callsSearch, signal),
    enabled: tab === "calls",
  });
  const citations = useQuery({
    queryKey: telemetryKeys.citations(citationsSearch),
    queryFn: ({ signal }) => fetchCitations(citationsSearch, signal),
    enabled: tab === "citations",
  });
  const pricing = useQuery({
    queryKey: telemetryKeys.pricing(),
    queryFn: ({ signal }) => fetchPricing(signal),
    enabled: tab === "pricing",
  });

  const active =
    tab === "summary"
      ? summary
      : tab === "calls"
        ? calls
        : tab === "citations"
          ? citations
          : pricing;

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setParams(withTab(params, value as AiTelemetryTab))
          }
        >
          <TabsList aria-label="호출 계기판 화면">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="px-4">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {tab !== "pricing" && (
          <FilterForm
            key={JSON.stringify(query.applied)}
            tab={tab}
            applied={query.applied}
            onSubmit={(filters) => setParams(withFilters(params, filters))}
          />
        )}
        <h1 className="mt-4 text-2xl font-semibold">{config.title}</h1>
      </div>

      {active.isError && (
        <div
          role="alert"
          className="mb-4 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {errorMessage(active.error)}
        </div>
      )}

      {active.isPending ? (
        tab === "summary" ? (
          <AdminCardsSkeleton count={6} label="요약을 불러오는 중" />
        ) : tab === "calls" ? (
          <AdminTableSkeleton columns={15} label="호출 목록을 불러오는 중" />
        ) : tab === "citations" ? (
          <AdminTableSkeleton columns={7} label="인용 목록을 불러오는 중" />
        ) : (
          <AdminDetailSkeleton rows={4} label="단가를 불러오는 중" />
        )
      ) : (
        <>
          {tab === "summary" && summary.data && (
            <SummaryTab data={summary.data} />
          )}
          {tab === "calls" && calls.data && (
            <CallsTab
              data={calls.data}
              page={query.page}
              pageSize={query.pageSize}
              onPage={(page) => setParams(withPage(params, page))}
            />
          )}
          {tab === "citations" && citations.data && (
            <CitationsTab items={citations.data} />
          )}
          {tab === "pricing" && pricing.data && (
            <PricingTab initial={pricing.data} />
          )}
        </>
      )}
    </div>
  );
}
