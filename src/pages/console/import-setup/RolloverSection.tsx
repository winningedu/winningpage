// W11 ③ 학년그룹 일괄 변경. 붙여넣은 명단을 미리보기하고 적용한다(W11a).

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { consoleRequest } from "../api";
import { gradeLabel } from "../classLabel";
import Notice from "../Notice";
import TemplateLink from "./TemplateLink";

interface SchoolYear {
  toYear: number;
  rolledOver: boolean;
  gradeCounts: { grade: string; count: number }[];
  graduatingGrades: string[];
}

/** "1학년 150명과 2학년 150명" 처럼 이어 쓴다. */
function joinCounts(items: string[]): string {
  const last = items[items.length - 1];
  return items.length < 2
    ? (last ?? "")
    : `${items.slice(0, -1).join(", ")}과 ${last}`;
}

function targetLine(year: SchoolYear): string | null {
  const text = (grades: { grade: string; count: number }[]) =>
    joinCounts(grades.map((g) => `${gradeLabel(g.grade)} ${g.count}명`));
  const graduating = year.gradeCounts.filter((g) =>
    year.graduatingGrades.includes(g.grade),
  );
  const promoting = year.gradeCounts.filter(
    (g) => !year.graduatingGrades.includes(g.grade),
  );
  const parts = [
    ...(promoting.length > 0 ? [`${text(promoting)}은 학년 +1`] : []),
    ...(graduating.length > 0 ? [`${text(graduating)}은 졸업 처리`] : []),
  ];
  return parts.length > 0 ? `진급 대상: ${parts.join(", ")}` : null;
}

interface RolloverSectionProps {
  text: string;
  onTextChange: (text: string) => void;
}

export default function RolloverSection({
  text,
  onTextChange,
}: RolloverSectionProps) {
  const [year, setYear] = useState<SchoolYear | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await consoleRequest("/api/console/school-year");
      if (res.status !== 200) throw new Error(`school-year ${res.status}`);
      setYear(res.body as SchoolYear);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const locked = year?.rolledOver === true;
  const target = year ? targetLine(year) : null;

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-lg font-semibold tracking-[-0.02em] text-ink-strong">
          ③ 학년그룹 일괄 변경
        </h2>
        <TemplateLink file="grade-bulk-change.xlsx" />
      </div>
      <p className="text-app-body text-ink-sub">
        학년그룹이 변경될 때(학년도 전환 등, 보통 1년에 한 번) 기존 학년그룹,
        그룹, 반, 번호를 새 학년그룹, 그룹, 반, 번호로 한 번에 바꿉니다. 같은
        학년도에는 한 번만 실행할 수 있어요
      </p>
      {loadFailed && (
        <Notice tone="Danger">학년도 정보를 불러오지 못했어요</Notice>
      )}
      {target && <p className="text-app-body text-ink-sub">{target}</p>}
      <textarea
        value={text}
        disabled={locked}
        placeholder="변경할 명단을 붙여넣으세요"
        onChange={(e) => onTextChange(e.target.value)}
        className={cn(
          "h-40 w-full resize-none rounded-lg border border-line bg-background p-4 text-app-label text-ink-strong placeholder:text-neutral-400",
          locked && "opacity-40",
        )}
      />
      {locked && (
        <Notice tone="Info">
          이번 학년도에는 이미 실행했어요. 같은 학년도에 다시 실행할 수 없어요
        </Notice>
      )}
      <div className="flex">
        <Button
          type="button"
          disabled={locked || text.trim() === ""}
          className="h-11 rounded-lg px-5 text-app-label font-semibold max-md:w-full md:h-10"
        >
          미리보기
        </Button>
      </div>
    </section>
  );
}
