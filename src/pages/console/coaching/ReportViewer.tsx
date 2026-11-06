// W9b 리포트 보기 전용. 글만 보이고 인쇄와 내려받기가 없다. 열람자 이름이 워터마크로 깔리고
// 인쇄물에서는 통째로 숨고(@media print), 오른쪽 클릭 메뉴와 글 선택을 막는다.
// 휴대폰에서는 화면 전체를 쓴다.

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useConsoleMe } from "../useConsoleMe";
import type { ServiceKey } from "./types";
import { useReport } from "./useCoaching";

const PRINT_RULE =
  "@media print { .coaching-report-viewer { display: none !important; } }";

export default function ReportViewer({
  studentId,
  service,
  fallbackTitle,
  onClose,
}: {
  studentId: string;
  service: ServiceKey;
  fallbackTitle: string;
  onClose: () => void;
}) {
  const { me } = useConsoleMe();
  const report = useReport(studentId, service);
  const mark =
    `${me.teacher?.name ?? me.tenant.name} ${me.teacher?.loginId ?? ""} 열람 전용`.replace(
      /\s+/g,
      " ",
    );
  const title = report.data?.title ?? fallbackTitle;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="coaching-report-viewer h-dvh max-w-none gap-4 overflow-hidden rounded-none p-0 select-none sm:h-[90vh] sm:max-w-[48rem] sm:rounded-2xl"
        onContextMenu={(e) => e.preventDefault()}
      >
        <style>{PRINT_RULE}</style>
        <DialogTitle className="px-6 pt-6 text-app-section font-semibold text-ink-strong">
          {title}
        </DialogTitle>
        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grid grid-cols-2 content-around gap-y-24 text-center text-app-label font-semibold text-ink-sub/20 -rotate-12"
          >
            {Array.from({ length: 12 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 같은 글을 반복해 깐다
              <span key={i}>{mark}</span>
            ))}
          </div>
          <div className="relative flex flex-col gap-5">
            {report.isPending && (
              <p className="text-app-body text-ink-sub">불러오는 중</p>
            )}
            {report.isError && (
              <p className="text-app-body text-ink-danger">
                리포트를 불러오지 못했어요
              </p>
            )}
            {report.isSuccess && report.data === null && (
              <p className="text-app-body text-ink-sub">
                열람할 리포트가 없어요
              </p>
            )}
            {report.data?.summary && (
              <p className="text-app-body text-ink-strong">
                {report.data.summary}
              </p>
            )}
            {report.data?.sections.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 서버가 준 순서 그대로 그린다
              <section key={i} className="flex flex-col gap-1">
                {s.title && (
                  <h3 className="text-app-label font-semibold text-ink-strong">
                    {s.title}
                  </h3>
                )}
                <p className="whitespace-pre-line text-app-body text-ink-strong">
                  {s.text}
                </p>
              </section>
            ))}
          </div>
        </div>
        <div className="flex justify-end px-6 pb-6">
          <Button type="button" variant="outline" onClick={onClose}>
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
