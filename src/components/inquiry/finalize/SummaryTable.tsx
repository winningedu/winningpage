import { cn } from "@/lib/utils";
import type { SummaryRow } from "./finalizeLogic";

const TH = "px-4 py-3 text-left text-app-label font-semibold";

export default function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  return (
    <section
      aria-labelledby="finalize-summary"
      className="rounded-xl border border-border bg-white p-6"
    >
      <h2
        id="finalize-summary"
        className="mb-4 text-app-section font-bold text-ink-strong"
      >
        적립될 내용
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table aria-label="적립될 내용" className="w-full border-collapse">
          <thead className="bg-surface-04">
            <tr>
              <th scope="col" className={cn(TH, "w-48 text-ink-sub")}>
                항목
              </th>
              <th scope="col" className={cn(TH, "text-ink-sub")}>
                내용
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <th scope="row" className={cn(TH, "text-ink-strong")}>
                  {row.label}
                </th>
                <td className="px-4 py-3 text-app-label">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={row.error ? "text-error" : "text-ink"}>
                      {row.value}
                    </span>
                    {row.badge && (
                      <span className="rounded-full bg-surface-02 px-2 py-0.5 text-app-badge font-semibold text-primary">
                        {row.badge}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
