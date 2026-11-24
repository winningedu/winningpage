import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, Select } from "@/pages/admin/shared/formFields";
import { errorText, evalKeys, fetchRuns } from "./api";
import ErrorBox from "./ErrorBox";
import type { KnowledgeType } from "./form";
import HistoryTab from "./HistoryTab";
import QueriesTab from "./QueriesTab";
import RunTab from "./RunTab";

type Tab = "golden" | "run" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "golden", label: "기준 문제집" },
  { key: "run", label: "평가 실행" },
  { key: "history", label: "이력" },
];

const KNOWLEDGE_TYPES: { value: KnowledgeType; label: string }[] = [
  { value: "topic_pattern", label: "수행 주제" },
  { value: "verified_resource", label: "수행 자료" },
];

const isTab = (value: string | null): value is Tab =>
  TABS.some((t) => t.key === value);

const isKnowledgeType = (value: string | null): value is KnowledgeType =>
  KNOWLEDGE_TYPES.some((t) => t.value === value);

const GUIDE =
  "문제집은 30문항부터 시작하고, 운영 검색 설정 변경은 이 결과를 근거로 별도로 결정합니다.";

interface Props {
  config: { title: string; [key: string]: unknown };
}

export default function EvalsAdmin({ config }: Props) {
  // 새로고침해도 같은 탭과 유형이 남도록 주소에 둔다. 없거나 올바르지 않으면 처음 값이다.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const typeParam = searchParams.get("type");
  const tab: Tab = isTab(tabParam) ? tabParam : "golden";
  const knowledgeType: KnowledgeType = isKnowledgeType(typeParam)
    ? typeParam
    : "topic_pattern";

  function setParam(key: "tab" | "type", value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  const queryClient = useQueryClient();
  const runsQuery = useQuery({
    queryKey: evalKeys.runs(knowledgeType),
    queryFn: ({ signal }) => fetchRuns(knowledgeType, signal),
  });
  const runs = runsQuery.data ?? null;
  const runsError = runsQuery.error ? errorText(runsQuery.error) : "";
  const reloadRuns = () =>
    queryClient.invalidateQueries({ queryKey: evalKeys.runs(knowledgeType) });

  const productionParams = runs?.productionParams[knowledgeType] ?? null;

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <Tabs
            value={tab}
            onValueChange={(value) => setParam("tab", String(value))}
          >
            <TabsList aria-label="평가 화면">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="px-4">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="w-[10rem]">
            <Field label="지식 유형">
              <Select
                value={knowledgeType}
                onChange={(value) => setParam("type", value)}
              >
                {KNOWLEDGE_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <h1 className="mt-4 text-2xl font-semibold">{config.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{GUIDE}</p>
      </div>

      {tab === "golden" && (
        <QueriesTab key={knowledgeType} knowledgeType={knowledgeType} />
      )}
      {tab === "run" && (
        <>
          <ErrorBox message={runsError} />
          {productionParams && (
            <RunTab
              key={knowledgeType}
              knowledgeType={knowledgeType}
              productionParams={productionParams}
              onSaved={reloadRuns}
            />
          )}
        </>
      )}
      {tab === "history" && (
        <>
          <ErrorBox message={runsError} />
          {runs && <HistoryTab key={knowledgeType} runs={runs.items} />}
        </>
      )}
    </div>
  );
}
