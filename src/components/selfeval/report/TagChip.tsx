import { cn } from "@/lib/utils";
import { tagKind } from "./reportFormat";

// 꼬리표 색: P 파랑, D 주황, H 초록, A 보라. 종류마다 구분되는 색이면 되고 표지 팔레트와 맞췄다.
const KIND_STYLE: Record<string, string> = {
  P: "bg-[#e8f0fe] text-[#1e6fd9]",
  D: "bg-[#fdece7] text-[#d9482b]",
  H: "bg-[#e3f5ec] text-[#15845a]",
  A: "bg-[#efeafd] text-[#6b4fd8]",
};

export default function TagChip({
  tag,
  className,
}: {
  tag: string;
  className?: string;
}) {
  const kind = tagKind(tag);
  return (
    <span
      data-testid="tag-chip"
      data-kind={kind}
      className={cn(
        "inline-block rounded px-1.5 py-0.5 align-middle text-[0.6875rem] font-bold leading-none",
        KIND_STYLE[kind] ?? "bg-surface-04 text-ink-sub",
        className,
      )}
    >
      {tag}
    </span>
  );
}
