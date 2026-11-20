import type { ReactNode } from "react";
import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function Th({ children }: { children?: ReactNode }) {
  return (
    <TableHead
      scope="col"
      className="px-3 py-3 font-semibold whitespace-normal"
    >
      {children}
    </TableHead>
  );
}

export function Td({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <TableCell className={cn("px-3 py-3", className)}>{children}</TableCell>
  );
}
