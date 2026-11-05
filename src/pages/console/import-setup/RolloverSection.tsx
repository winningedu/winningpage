// W11 ③ 학년그룹 일괄 변경. 붙여넣은 명단을 미리보기하고 적용한다(W11a).

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { consoleRequest, errorMessage } from "../api";
import { gradeLabel } from "../classLabel";
import Notice from "../Notice";
import { SAVE_FAILED_MESSAGE } from "../passwordRule";
import { useToast } from "../Toast";
import RolloverConfirmDialog, {
  type RolloverSummary,
} from "./RolloverConfirmDialog";
import RolloverPreviewTable, {
  type PreviewRow,
  RESULT_LEGEND,
} from "./RolloverPreviewTable";
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

interface ApplyRow {
  studentId: string;
  groupId: string | null;
  className: string;
  number: number | null;
}

interface Preview {
  rows: PreviewRow[];
  applyRows: ApplyRow[];
  summary: RolloverSummary;
}

interface RolloverSectionProps {
  text: string;
  onTextChange: (text: string) => void;
  /** 이미 실행한 학년도인지 알린다(① 올리기를 같이 막는다). */
  onLockedChange: (locked: boolean) => void;
}

export default function RolloverSection({
  text,
  onTextChange,
  onLockedChange,
}: RolloverSectionProps) {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [year, setYear] = useState<SchoolYear | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // 명단이 바뀌면 낡은 미리보기는 적용할 수 없다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text 가 바뀔 때만 비운다
  useEffect(() => setPreview(null), [text]);

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

  const runPreview = async () => {
    if (!year) return;
    setPreviewing(true);
    try {
      const res = await consoleRequest(
        "/api/console/school-year/rollover/preview",
        { method: "POST", body: { toYear: year.toYear, text } },
      );
      if (res.status !== 200) {
        toast.show({
          tone: "Error",
          message: errorMessage(res.body) ?? SAVE_FAILED_MESSAGE,
        });
        return;
      }
      setPreview(res.body as Preview);
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    } finally {
      setPreviewing(false);
    }
  };

  const apply = async (current: Preview) => {
    if (!year) return;
    setApplying(true);
    try {
      const res = await consoleRequest("/api/console/school-year/rollover", {
        method: "POST",
        body: { toYear: year.toYear, rows: current.applyRows },
      });
      if (res.status !== 200) {
        toast.show({
          tone: "Error",
          message: errorMessage(res.body) ?? SAVE_FAILED_MESSAGE,
        });
        return;
      }
      const done = res.body as { graduated: number; promoted: number };
      setConfirming(false);
      setPreview(null);
      await load();
      toast.show({
        tone: "Success",
        message: `학년그룹 일괄 변경을 적용했어요. 학년 +1 ${done.promoted}명, 졸업 처리 ${done.graduated}명, 반영하지 못한 ${current.summary.waiting}명은 미배정 목록에서 확인해 주세요`,
      });
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    } finally {
      setApplying(false);
    }
  };

  const locked = year?.rolledOver === true;
  useEffect(() => onLockedChange(locked), [locked, onLockedChange]);
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
      <div className="flex">
        <Button
          type="button"
          disabled={locked || !year || previewing || text.trim() === ""}
          onClick={() => void runPreview()}
          className="h-11 rounded-lg px-5 text-app-label font-semibold max-md:w-full md:h-10"
        >
          미리보기
        </Button>
      </div>
      {preview && (
        <>
          <RolloverPreviewTable rows={preview.rows} />
          <div className="flex items-center gap-4">
            <p className="flex-1 text-app-label text-ink-sub">
              {RESULT_LEGEND}
            </p>
            <Button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-11 rounded-lg px-5 text-app-label font-semibold md:h-10"
            >
              적용
            </Button>
          </div>
        </>
      )}
      {locked && (
        <Notice tone="Info">
          이번 학년도에는 이미 실행했어요. 같은 학년도에 다시 실행할 수 없어요
        </Notice>
      )}
      {preview && (
        <RolloverConfirmDialog
          open={confirming}
          summary={preview.summary}
          applying={applying}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void apply(preview)}
        />
      )}
    </section>
  );
}
