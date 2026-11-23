import type { PrescriptionTable as PrescriptionTableData } from "@/lib/diagnosis-v3/types";
import CopyText from "./CopyText";
import { REPORT_LABELS } from "./labels";
import ReportCard from "./ReportCard";

/** 22 r53 (page 4) and r69 (page 6): 20_처방 rules already applied upstream. */
export default function PrescriptionTable({
  rx,
}: {
  rx: PrescriptionTableData;
}) {
  return (
    <ReportCard title={REPORT_LABELS.rxTitle}>
      <p className="text-ink">
        <CopyText text={rx.intro} />
      </p>
      {rx.lever && (
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold">{REPORT_LABELS.rxLever}</h3>
          <p>
            <CopyText text={rx.lever} />
          </p>
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">{REPORT_LABELS.rxWeak}</h3>
        {rx.weak.kind === "items" ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-sub">
              <tr>
                <th className="py-2 font-normal">{REPORT_LABELS.rxQuestion}</th>
                <th className="py-2 font-normal">{REPORT_LABELS.rxTarget}</th>
                <th className="py-2 font-normal">{REPORT_LABELS.rxLink}</th>
              </tr>
            </thead>
            <tbody>
              {rx.weak.items.map((item) => (
                <tr key={item.question} className="border-b border-line">
                  <td className="py-2 pr-3">
                    <CopyText text={item.question} />
                  </td>
                  <td className="py-2 pr-3">
                    <CopyText text={item.target} />
                  </td>
                  <td className="py-2">
                    <CopyText text={item.link} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            <CopyText text={rx.weak.text} />
          </p>
        )}
      </section>
      {rx.strong.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold">{REPORT_LABELS.rxStrong}</h3>
          <ul className="grid grid-cols-2 gap-2">
            {rx.strong.map((item) => (
              <li
                key={item.question}
                className="rounded-md bg-surface-card px-3 py-2"
              >
                <CopyText text={item.question} /> (
                <CopyText text={item.answer} />)
              </li>
            ))}
          </ul>
        </section>
      )}
    </ReportCard>
  );
}
