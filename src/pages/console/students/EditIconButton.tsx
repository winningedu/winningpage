// 이름 옆 "학년, 반 바꾸기" 아이콘(QA 50). 이름 버튼(상세 열기)과 따로 둔 버튼이라 안에 넣지 않는다.

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function EditIconButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="학년, 반 바꾸기"
      title="학년, 반 바꾸기"
      onClick={onClick}
      className={cn("size-8 shrink-0 rounded-lg text-ink-sub", className)}
    >
      <Pencil aria-hidden className="size-4" />
    </Button>
  );
}
