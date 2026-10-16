import type { SectionId } from "@/lib/inquiry/types";
import { placeholderSummary } from "./writeLogic";

// 대괄호 자리표시자가 남은 절별 개수 안내(No.78). 제출은 막지 않고 경고만 한다.
export default function PlaceholderWarning({
  placeholders,
}: {
  placeholders: Partial<Record<SectionId, number>>;
}) {
  const summary = placeholderSummary(placeholders);
  if (summary === "") return null;
  return (
    <p
      role="note"
      className="rounded-xl bg-amber-50 px-6 py-3 text-app-label text-ink-strong"
    >
      {`대괄호 자리표시자가 남아 있어요: ${summary}. 그대로 제출할 수 있어요. 평가에서 절별 개수가 표시되고 감점돼요.`}
    </p>
  );
}
