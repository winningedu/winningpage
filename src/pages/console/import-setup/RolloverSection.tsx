// W11 ③ 학년그룹 일괄 변경. 붙여넣은 명단을 미리보기하고 적용한다(W11a).

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** 서버가 정한다. midyear 는 학년을 두고 그룹, 반, 번호만 바꾸며 몇 번이든 쓸 수 있다. */
  mode: "rollover" | "midyear";
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

interface PendingRow {
  name: string;
  grade: string | null;
  groupId: string | null;
  className: string | null;
  number: number | null;
}

interface Preview {
  rows: PreviewRow[];
  applyRows: ApplyRow[];
  /** 가입하지 않은 학생의 명단 줄. 적용하면 학생 목록에 미회원가입으로 저장된다. */
  pendingRows: PendingRow[];
  summary: RolloverSummary;
}

interface RolloverSectionProps {
  text: string;
  onTextChange: (text: string) => void;
}

/** 적용 응답의 미회원가입 저장 결과를 문장 뒤에 붙인다. 저장도 건너뜀도 없으면 붙이지 않는다. */
function pendingSentence(done: {
  pendingStored: number;
  pendingSkipped: number;
}): string {
  const parts = [
    ...(done.pendingStored > 0
      ? [`미회원가입 ${done.pendingStored}명은 학생 목록에 저장했어요`]
      : []),
    ...(done.pendingSkipped > 0
      ? [
          `학년이나 반을 알 수 없는 ${done.pendingSkipped}명은 저장하지 못했어요`,
        ]
      : []),
  ];
  return parts.length > 0 ? `. ${parts.join(", ")}` : "";
}

export default function RolloverSection({
  text,
  onTextChange,
}: RolloverSectionProps) {
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [year, setYear] = useState<SchoolYear | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // 응답이 올 때 지금 입력칸과 같은 명단인지 비교하려고 최신 text 를 들고 있는다.
  const textRef = useRef(text);
  textRef.current = text;

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
    const requested = text;
    setPreviewing(true);
    try {
      const res = await consoleRequest(
        "/api/console/school-year/rollover/preview",
        { method: "POST", body: { toYear: year.toYear, text: requested } },
      );
      // 기다리는 사이 ① 올리기로 명단이 바뀌었으면 낡은 응답은 버린다.
      if (requested !== textRef.current) return;
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
        body: {
          toYear: year.toYear,
          rows: current.applyRows,
          pendingRows: current.pendingRows,
        },
      });
      if (res.status !== 200) {
        toast.show({
          tone: "Error",
          message: errorMessage(res.body) ?? SAVE_FAILED_MESSAGE,
        });
        return;
      }
      const done = res.body as {
        mode: "rollover" | "midyear";
        graduated: number;
        promoted: number;
        assigned: number;
        updated: number;
        pendingStored: number;
        pendingSkipped: number;
      };
      setConfirming(false);
      setPreview(null);
      await load();
      if (done.mode === "midyear") {
        toast.show({
          tone: "Success",
          message: `명단을 적용했어요. 그룹, 반, 번호 변경 ${done.updated}명${pendingSentence(done)}`,
        });
        return;
      }
      // 졸업과 진급이 모두 0이면 그 사이 다른 곳에서 학년도 전환이 끝난 것이다.
      if (done.graduated + done.promoted === 0) {
        toast.show({
          tone: "Error",
          message: "이미 학년도 전환이 끝났어요. 명단을 다시 미리보기해 주세요",
        });
        return;
      }
      toast.show({
        tone: "Success",
        message: `학년그룹 일괄 변경을 적용했어요. 학년 +1 ${done.assigned}명, 졸업 처리 ${done.graduated}명, 반영하지 못한 ${done.promoted - done.assigned}명은 미배정 목록에서 확인해 주세요${pendingSentence(done)}`,
      });
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    } finally {
      setApplying(false);
    }
  };

  const midyear = year?.mode === "midyear";
  const target = year && !midyear ? targetLine(year) : null;

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-lg font-semibold tracking-[-0.02em] text-ink-strong">
          ③ 학년그룹 일괄 변경
        </h2>
        <TemplateLink
          file="grade-bulk-change.xlsx"
          downloadName="스쿨멘토_학년그룹일괄변경_샘플.xlsx"
        />
      </div>
      <p className="text-app-body text-ink-sub">
        {midyear
          ? "명단의 그룹, 반, 번호를 학생에게 한 번에 반영합니다. 학년은 바뀌지 않고, 명단에 없는 학생은 그대로예요. 학기 중에도 몇 번이든 올릴 수 있어요"
          : "학년그룹이 변경될 때(학년도 전환 등, 보통 1년에 한 번) 기존 학년그룹, 그룹, 반, 번호를 새 학년그룹, 그룹, 반, 번호로 한 번에 바꿉니다"}
      </p>
      {loadFailed && (
        <Notice tone="Danger">
          학년도 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
        </Notice>
      )}
      {target && <p className="text-app-body text-ink-sub">{target}</p>}
      <textarea
        value={text}
        disabled={previewing}
        placeholder="변경할 명단을 붙여넣으세요"
        onChange={(e) => onTextChange(e.target.value)}
        className={cn(
          "h-40 w-full resize-none rounded-lg border border-line bg-background p-4 text-app-label text-ink-strong placeholder:text-neutral-400",
          previewing && "opacity-40",
        )}
      />
      <div className="flex">
        <Button
          type="button"
          disabled={!year || previewing || text.trim() === ""}
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
      {preview && (
        <RolloverConfirmDialog
          open={confirming}
          mode={year?.mode ?? "rollover"}
          changeCount={preview.applyRows.length}
          summary={preview.summary}
          applying={applying}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void apply(preview)}
        />
      )}
    </section>
  );
}
