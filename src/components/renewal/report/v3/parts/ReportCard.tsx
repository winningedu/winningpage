import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CopyText from "./CopyText";

type ReportCardProps = {
  title: string;
  /** right-aligned question reference such as "8번" */
  meta?: string;
  className?: string;
  children: ReactNode;
};

/** Titled card block used for every boxed section of the report pages. */
export default function ReportCard({
  title,
  meta,
  className,
  children,
}: ReportCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex items-baseline justify-between">
        <CardTitle className="text-base font-bold text-ink-title">
          <CopyText text={title} />
        </CardTitle>
        {meta && <span className="text-xs text-ink-sub">{meta}</span>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-ink-strong">
        {children}
      </CardContent>
    </Card>
  );
}
