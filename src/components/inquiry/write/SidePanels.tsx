import { buildChecklistRows } from "@/components/inquiry/design/designLogic";
import { HYPOTHESIS_NOTICE, WRITING_FORBIDDEN } from "@/lib/inquiry/labels";
import type { DesignView } from "@/lib/inquiry/types";

// 보고서 작성 화면 오른쪽 패널 3종. 이행 점검은 정적 목록이고 작성 중에는 갱신하지 않는다(No.73).
const CARD = "rounded-xl border border-line/60 bg-white p-5";

export const CHECKLIST_STATIC_NOTE =
  "작성 중에는 갱신되지 않아요. 평가에서 같은 기준으로 확인해요";

export default function SidePanels({ design }: { design: DesignView }) {
  const rows = buildChecklistRows(design);
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="설계 이행 점검" className={CARD}>
        <h2 className="text-app-card-title font-bold text-ink-strong">
          설계 이행 점검
        </h2>
        <p className="mt-1 text-app-caption text-ink-sub">
          {CHECKLIST_STATIC_NOTE}
        </p>
        <ol aria-label="설계 이행 점검" className="mt-3 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.no} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 rounded-full border border-line"
              />
              <span className="flex flex-col">
                <span className="text-app-label font-semibold text-ink-strong">
                  {row.text}
                </span>
                <span className="text-app-caption text-ink-sub">
                  {row.meta}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-label={HYPOTHESIS_NOTICE.title}
        className="rounded-xl bg-blue-50 p-5"
      >
        <h2 className="text-app-card-title font-bold text-ink-strong">
          {HYPOTHESIS_NOTICE.title}
        </h2>
        <p className="mt-1 text-app-label text-ink-sub">
          {HYPOTHESIS_NOTICE.body}
        </p>
      </section>

      <section aria-label="쓰면 안 되는 것" className={CARD}>
        <h2 className="text-app-card-title font-bold text-ink-strong">
          쓰면 안 되는 것
        </h2>
        <ul aria-label="쓰면 안 되는 것" className="mt-2 flex flex-col gap-1">
          {WRITING_FORBIDDEN.map((text) => (
            <li key={text} className="text-app-label text-ink-sub">
              {text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
