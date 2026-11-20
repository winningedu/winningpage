import type { ReactNode } from "react";
import { TableCell, TableHead } from "@/components/ui/table";

export function Th({ children }: { children?: ReactNode }) {
  return (
    <TableHead scope="col" className="font-semibold whitespace-normal">
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
  return <TableCell className={className}>{children}</TableCell>;
}
