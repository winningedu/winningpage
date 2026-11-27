import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function Th({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      scope="col"
      className={cn("px-3 py-3 font-semibold whitespace-normal", className)}
    >
      {children}
    </TableHead>
  );
}
