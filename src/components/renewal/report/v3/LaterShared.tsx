// Shared building blocks for report v3 pages 7 to 16 (own file; parts/ belongs to U10A).
// Sheet frame: ReportSheetA4 (fd-report-sheet class) plus the "N / 16" footer.
import type { ReactNode } from "react";
import { withDedupedKeys } from "@/lib/reactKeys";
import ReportSheetA4 from "../ReportSheetA4";

export const TOTAL_PAGES = 16;

export function PageSheet({
  no,
  children,
}: {
  no: number;
  children: ReactNode;
}) {
  return (
    <ReportSheetA4 page={no} totalPages={TOTAL_PAGES}>
      <div className="flex flex-col gap-6">{children}</div>
      <p className="mt-8 text-end text-sm text-[#808080]">
        {no} / {TOTAL_PAGES}
      </p>
    </ReportSheetA4>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-2xl font-bold leading-[1.3] text-ink">{children}</h2>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-lg font-bold leading-[1.3] text-ink">{children}</h3>
  );
}

export function Para({ children }: { children: ReactNode }) {
  return <p className="text-base leading-[1.4] text-[#808080]">{children}</p>;
}

export function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 ps-4.5">
      {withDedupedKeys([...items]).map(({ item, key }) => (
        <li key={key} className="text-base leading-[1.4] text-[#808080]">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-[1.4] text-[#808080]">{children}</p>;
}
