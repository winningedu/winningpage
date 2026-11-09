// W9a 서비스 상세 창. 한 번에 하나만 뜬다(결정 39). 닫기, ESC, 바깥 클릭으로 닫히고 화면을 떠나면 사라진다.
// 서버가 준 지표, 표, 상담 포인트를 그대로 그리고, 리포트 보기(W9b)는 이 창 위에 덮어 연다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ReportViewer from "./ReportViewer";
import type { ServiceDetail, ServiceKey } from "./types";
import { useServiceDetail } from "./useCoaching";

const GROUP_NAME = {
  execution: "학습 실행 역량",
  readiness: "학교생활 준비도",
} as const;

function DataTable({ table }: { table: NonNullable<ServiceDetail["table"]> }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-app-label font-semibold text-ink-strong">
        {table.heading}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-app-label">
          <thead>
            <tr className="text-ink-sub">
              {table.columns.map((c) => (
                <th key={c} className="py-2 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr
                key={row.join("|")}
                className="border-t border-line text-ink-strong"
              >
                {row.map((cell, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 열 순서가 곧 키다
                  <td key={i} className="py-2 pr-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 12개 영역 점수 막대. 도형 차트 없이 div 로 그리고, 목표선은 학습 실행 역량 줄에만 둔다. */
function AreaBars({ bars }: { bars: NonNullable<ServiceDetail["bars"]> }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-app-label font-semibold text-ink-strong">
        12개 영역 점수 (목표 75점 세로선, 학습 실행 역량에만)
      </h3>
      {(["execution", "readiness"] as const).map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <h4 className="text-app-body font-bold text-ink-strong">
            {GROUP_NAME[group]}
          </h4>
          {bars
            .filter((b) => b.group === group)
            .map((b) => (
              <div
                key={b.name}
                data-testid="area-bar"
                className="flex flex-wrap items-center gap-3 text-app-label"
              >
                <span className="w-[4.75rem] font-medium text-ink-strong">
                  {b.name}
                </span>
                <span className="relative h-2 w-[7.5rem] rounded bg-surface-muted">
                  <span
                    className="absolute inset-y-0 left-0 rounded bg-primary"
                    style={{ width: `${b.score}%` }}
                  />
                  {b.target !== undefined && (
                    <span
                      data-testid="target-line"
                      className="absolute -top-1 h-4 w-px bg-ink-strong"
                      style={{ left: `${b.target}%` }}
                    />
                  )}
                </span>
                <span className="w-20 text-ink-strong">
                  {b.score}점 {b.status}
                </span>
                <span className="flex-1 text-ink-sub">
                  먼저 할 것: {b.firstStep}
                </span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

export default function ServiceWindow({
  studentId,
  service,
  onClose,
}: {
  studentId: string;
  service: ServiceKey;
  onClose: () => void;
}) {
  const detail = useServiceDetail(studentId, service);
  const [report, setReport] = useState(false);
  const d = detail.data;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !report && onClose()}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
          className="max-h-[90vh] max-w-[calc(100%-2rem)] gap-5 overflow-y-auto rounded-2xl p-6 sm:max-w-[50rem]"
        >
          <DialogTitle className="text-app-section font-semibold text-ink-strong">
            {d?.title ?? "서비스 상세"}
          </DialogTitle>
          {detail.isPending && (
            <p className="text-app-body text-ink-sub">불러오는 중</p>
          )}
          {detail.isError && (
            <p className="text-app-body text-ink-danger">
              서비스 상세를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
            </p>
          )}
          {d && (
            <>
              <dl
                className={`grid gap-3 ${d.metrics.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
              >
                {d.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="flex flex-col gap-1 rounded-xl bg-surface-muted p-4"
                  >
                    <dt className="text-app-caption text-ink-sub">{m.label}</dt>
                    <dd className="text-app-card-title font-bold text-ink-strong">
                      {m.value}
                    </dd>
                    {m.sub && (
                      <dd className="text-app-caption text-ink-sub">{m.sub}</dd>
                    )}
                  </div>
                ))}
              </dl>
              {d.notice && (
                <p className="text-app-caption text-ink-sub">{d.notice}</p>
              )}
              {d.summary && (
                <p className="text-app-body text-ink-strong">{d.summary}</p>
              )}
              {d.bars && <AreaBars bars={d.bars} />}
              {d.table && <DataTable table={d.table} />}
              {d.secondTable && <DataTable table={d.secondTable} />}
              {d.points.length > 0 && (
                <div className="flex flex-col gap-1">
                  <h3 className="text-app-label font-semibold text-ink-strong">
                    상담 포인트
                  </h3>
                  {d.points.map((p) => (
                    <p key={p} className="text-app-body text-ink-strong">
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReport(true)}
            >
              리포트 보기
            </Button>
            <Button type="button" onClick={onClose}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {report && (
        <ReportViewer
          studentId={studentId}
          service={service}
          fallbackTitle={d?.title ?? "리포트"}
          onClose={() => setReport(false)}
        />
      )}
    </>
  );
}
