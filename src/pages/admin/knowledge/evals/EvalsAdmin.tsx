import { useCallback, useEffect, useState } from "react";
import { ActionButton, Field, Select } from "@/pages/admin/shared/formFields";
import { fetchRuns, type RunsResponse } from "./api";
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

const GUIDE =
  "문제집은 30문항부터 시작하고, 운영 검색 설정 변경은 이 결과를 근거로 별도로 결정합니다.";

interface Props {
  config: { title: string; [key: string]: unknown };
}

export default function EvalsAdmin({ config }: Props) {
  const [tab, setTab] = useState<Tab>("golden");
  const [knowledgeType, setKnowledgeType] =
    useState<KnowledgeType>("topic_pattern");
  const [runs, setRuns] = useState<RunsResponse | null>(null);
  const [runsError, setRunsError] = useState("");

  const reloadRuns = useCallback(() => {
    fetchRuns(knowledgeType).then((result) => {
      if (!result.ok) {
        setRunsError(result.message);
        return;
      }
      setRunsError("");
      setRuns(result.data);
    });
  }, [knowledgeType]);

  useEffect(() => {
    reloadRuns();
  }, [reloadRuns]);

  const productionParams = runs?.productionParams[knowledgeType] ?? null;

  return (
    <div>
      <div className="mb-6 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {TABS.map((t) => (
              <ActionButton
                key={t.key}
                variant={t.key === tab ? "dark" : "light"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </ActionButton>
            ))}
          </div>
          <div className="w-[10rem]">
            <Field label="지식 유형">
              <Select
                value={knowledgeType}
                onChange={(value) => setKnowledgeType(value as KnowledgeType)}
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
        <h1 className="mt-4 text-xl font-black">{config.title}</h1>
        <p className="mt-1 text-sm font-bold text-gray-500">{GUIDE}</p>
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
