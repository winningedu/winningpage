import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ScrollArea, type ScrollAreaHandle } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// 어드민 표 공용 껍데기. ui/table의 Table 대신 쓴다(ui/table은 건드리지 않는다).
// 가로 스크롤 뷰포트를 키보드로 닿는 이름 붙은 region으로 만들고, 가로로 더 스크롤할
// 수 있는 쪽 끝에 그림자를 깔아 "옆에 열이 더 있다"는 단서를 준다.

const EDGE_BASE =
  "pointer-events-none absolute inset-y-0 z-20 w-6 from-foreground/10 to-transparent transition-opacity";

function EdgeShadow({
  side,
  visible,
}: {
  side: "left" | "right";
  visible: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      data-edge={side}
      data-visible={visible}
      className={cn(
        EDGE_BASE,
        side === "left" ? "left-0 bg-linear-to-r" : "right-0 bg-linear-to-l",
        visible ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

export function AdminTableFrame({
  label,
  className,
  children,
  ...tableProps
}: React.ComponentProps<"table"> & { label: string }) {
  const osRef = useRef<ScrollAreaHandle | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const viewport = osRef.current?.osInstance()?.elements().viewport;
    if (!viewport) return;

    const update = () => {
      const left = viewport.scrollLeft > 1;
      const right =
        viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
      setEdges((prev) =>
        prev.left === left && prev.right === right ? prev : { left, right },
      );
    };

    update();
    viewport.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => viewport.removeEventListener("scroll", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    const table = viewport.querySelector("table");
    if (table) observer.observe(table);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <ScrollArea
        data-slot="table-container"
        axis="x"
        osRef={osRef}
        viewportProps={{
          tabIndex: 0,
          role: "region",
          "aria-label": label,
          className:
            "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        }}
        className="relative w-full"
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm break-keep", className)}
          {...tableProps}
        >
          {children}
        </table>
      </ScrollArea>
      <EdgeShadow side="left" visible={edges.left} />
      <EdgeShadow side="right" visible={edges.right} />
    </div>
  );
}
