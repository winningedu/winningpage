import { CheckIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ReportPlanItem } from "@/lib/growth/api";
import { normalizeParentPlan, planSummary } from "./parentPlanLogic";

/** 학부모용 실행계획 읽기 전용 목록. 체크할 수 없고 접어서 볼 수 있다. */
export default function ChildPlanList({ items }: { items: ReportPlanItem[] }) {
  const rows = normalizeParentPlan(items);
  if (rows.length === 0) return null;
  const { total, done } = planSummary(rows);

  return (
    <section
      aria-label="실행계획"
      className="rounded-xl border border-border bg-white px-6"
    >
      <Accordion defaultValue={["plan"]}>
        <AccordionItem value="plan" className="border-0">
          <AccordionTrigger className="py-5 text-app-section font-bold text-ink-strong">
            실행계획 {done}/{total} 완료
          </AccordionTrigger>
          <AccordionContent>
            <ul className="flex flex-col divide-y divide-border pb-4">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 py-3"
                  data-done={row.done}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-ink-sub data-[done=true]:border-primary data-[done=true]:bg-primary data-[done=true]:text-white"
                    data-done={row.done}
                  >
                    {row.done ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-app-body font-medium text-ink-strong">
                      {row.title}
                    </p>
                    <p className="mt-0.5 text-app-caption text-ink-sub">
                      {row.programLabel}, {row.priorityLabel}
                      {row.deadlineLabel ? `, 마감 ${row.deadlineLabel}` : ""}
                    </p>
                  </div>
                  <span className="text-app-label text-ink-sub">
                    {row.done ? "완료" : "진행 중"}
                  </span>
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
