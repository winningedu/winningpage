// Text blocks for report v3 pages 7 to 16 (title, paragraph, bullets, note). The sheet frame is parts/ReportSheet.
import type { ReactNode } from "react";
import { withDedupedKeys } from "@/lib/reactKeys";
import { pageTitle, twoDigitPage } from "./parts/labels";

/** "07 입시 준비도 ..." eyebrow of the PDF page header; the number is fixed (R9). */
export function PageEyebrow({ page }: { page: number }) {
  return (
    <p className="text-sm text-ink-sub">
      <span className="mr-2 font-semibold text-ink-strong">
        {twoDigitPage(page)}
      </span>
      <span>{pageTitle(page)}</span>
    </p>
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
