// W9a 서비스 상세 창. 한 번에 하나만 뜬다(결정 39). 닫기, ESC, 바깥 클릭으로 닫히고 화면을 떠나면 사라진다.
// 서버가 준 지표, 표, 상담 포인트를 그대로 그리고, 리포트 보기(W9b)는 이 창 위에 덮어 연다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ReportViewer from "./ReportViewer";
import type { ServiceKey } from "./types";
import { useServiceDetail } from "./useCoaching";

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
              서비스 상세를 불러오지 못했어요
            </p>
          )}
          {d && (
            <>
              <dl className="grid gap-3 sm:grid-cols-2">
                {d.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="flex flex-col gap-1 rounded-xl bg-surface-muted p-4"
                  >
                    <dt className="text-app-caption text-ink-sub">{m.label}</dt>
                    <dd className="text-app-card-title font-bold text-ink-strong">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {d.table && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-app-label font-semibold text-ink-strong">
                    {d.table.heading}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-app-label">
                      <thead>
                        <tr className="text-ink-sub">
                          {d.table.columns.map((c) => (
                            <th key={c} className="py-2 pr-3 font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.table.rows.map((row) => (
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
              )}
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
