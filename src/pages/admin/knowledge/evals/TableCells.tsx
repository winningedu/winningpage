import type { ReactNode } from "react";

export function Th({ children }: { children?: ReactNode }) {
  return <th className="px-3 py-3 text-left">{children}</th>;
}

export function Td({ children }: { children?: ReactNode }) {
  return <td className="px-3 py-3">{children}</td>;
}
