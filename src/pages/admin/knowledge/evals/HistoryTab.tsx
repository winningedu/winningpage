import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EvalRun } from "./api";
import { diffMetrics } from "./form";
import { formatMetric, formatParams, RECALL_KS } from "./format";
import { Td, Th } from "./TableCells";

function formatDiff(value: number | null): string {
  if (value === null) return "";
  const text = value.toFixed(3);
  return value > 0 ? `+${text}` : text;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function HistoryTab({ runs }: { runs: EvalRun[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((value) => value !== id)
        : [...prev, id].slice(-2),
    );
  }

  // 비교는 앞 실행(오래된 쪽)에서 뒤 실행으로 본다.
  const picked = runs
    .filter((run) => selected.includes(run.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const [before, after] = picked;

  return (
    <div className="space-y-6">
      {before && after && (
        <div className="bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black">두 실행 비교</h2>
          <div className="mt-1 text-xs font-bold text-gray-500">
            앞 {formatDate(before.created_at)} / 뒤{" "}
            {formatDate(after.created_at)}
          </div>
          <table className="mt-4 w-full max-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-gray-300">
                <Th>지표</Th>
                <Th>앞 실행</Th>
                <Th>뒤 실행</Th>
                <Th>차이</Th>
              </tr>
            </thead>
            <tbody>
              {diffMetrics(before.metrics, after.metrics).map((row) => (
                <tr key={row.label} className="border-b border-gray-100">
                  <td className="px-3 py-3 font-bold">{row.label}</td>
                  <Td>{formatMetric(row.before)}</Td>
                  <Td>{formatMetric(row.after)}</Td>
                  <td
                    className={`px-3 py-3 font-bold ${(row.diff ?? 0) > 0 ? "text-blue-600" : (row.diff ?? 0) < 0 ? "text-red-600" : ""}`}
                  >
                    {formatDiff(row.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white p-6 shadow-sm">
        <div className="mb-4 text-sm font-bold text-gray-500">
          최근 실행 {runs.length}건 / 두 건을 고르면 지표 차이를 보여 줍니다.
        </div>
        <ScrollArea axis="x">
          <table className="w-full min-w-[80rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-gray-300">
                <Th>비교</Th>
                <Th>실행 시각</Th>
                <Th>모드</Th>
                <Th>파라미터</Th>
                <Th>질의 수</Th>
                {RECALL_KS.map((k) => (
                  <Th key={k}>recall@{k}</Th>
                ))}
                <Th>MRR</Th>
                <Th>메모</Th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    실행 이력이 없습니다.
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id} className="border-b border-gray-100">
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`${formatDate(run.created_at)} 실행 비교`}
                        checked={selected.includes(run.id)}
                        onChange={() => toggle(run.id)}
                      />
                    </Td>
                    <Td>{formatDate(run.created_at)}</Td>
                    <Td>{run.mode === "hybrid" ? "하이브리드" : "벡터"}</Td>
                    <Td>{formatParams(run.params)}</Td>
                    <Td>{run.query_count}</Td>
                    {RECALL_KS.map((k) => (
                      <Td key={k}>{formatMetric(run.metrics.recall[k])}</Td>
                    ))}
                    <Td>{formatMetric(run.metrics.mrr)}</Td>
                    <Td>{run.note}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  );
}
