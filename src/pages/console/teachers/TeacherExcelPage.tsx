// W15 교사 엑셀 일괄업로드. 교사 콘솔 /teacher/teachers/excel. 담임은 셸(ConsoleLayout)이 막는다.
// 흐름: 양식 내려받기, 올리기 또는 붙여넣기, 행 판정 미리보기, 적용(덮어쓰기 또는 건너뛰기), 결과와 안내 파일(교 #121~#125).
// 휴대폰(768 미만)은 PC 전용 안내만 보인다(결정 8). 미리보기는 서버가 판정만 하고 쓰지 않으며, 적용 때 서버가 다시 판정한다.

import { useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { consoleRequest, errorMessage } from "../api";
import FormatErrorDialog, {
  dropSubject,
  type FormatErrorItem,
} from "../FormatErrorDialog";
import PageHeader from "../PageHeader";
import ExcelPreview from "./ExcelPreview";
import ExcelUpload from "./ExcelUpload";
import {
  type ApplyMode,
  type ApplyTotals,
  applyRows,
  EMPTY_TOTALS,
  isErrorVerdict,
  REASON_LABEL,
  type Reason,
  type Verdict,
} from "./excelImport";
import IssuedPanel from "./IssuedPanel";
import {
  EMPTY_TEACHER_MESSAGE,
  parseTeacherLines,
  type TeacherFileRow,
} from "./teacherFile";

const PC_ONLY = "선생님 엑셀 일괄업로드는 PC나 태블릿에서 할 수 있어요";
const PREVIEW_FAILED = "미리보기를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요";

/** 형식 오류 줄의 이유를 확인 창의 항목(틀린 칸마다 하나)으로 바꾼다. 이유 문장은 줄마다 보이는 것과 같은 말이다. */
function formatErrorItems(
  rows: TeacherFileRow[],
  reasons: Reason[][],
): FormatErrorItem[] {
  return rows.flatMap((row, i) =>
    (reasons[i] ?? []).map((reason) => {
      const item = { row: i + 1, name: row.name, cell: "", value: "" };
      const label = REASON_LABEL[reason];
      switch (reason) {
        case "phone":
          return row.phone === ""
            ? { ...item, message: label }
            : {
                ...item,
                cell: "전화번호",
                value: row.phone,
                message: "형식이 맞지 않아요",
              };
        case "grade":
          return {
            ...item,
            cell: "학년",
            value: row.grade,
            message: dropSubject(label),
          };
        case "class":
          return {
            ...item,
            cell: "반",
            value: row.className,
            message: dropSubject(label),
          };
        default:
          return { ...item, message: label };
      }
    }),
  );
}

type Phase =
  | { step: "input" }
  | {
      step: "preview";
      rows: TeacherFileRow[];
      verdicts: Verdict[];
      reasons: Reason[][];
    }
  | { step: "done"; totals: ApplyTotals; errors: number };

export default function TeacherExcelPage() {
  const mobile = useIsMobile();
  const [phase, setPhase] = useState<Phase>({ step: "input" });
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ApplyMode>("skip");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [errorItems, setErrorItems] = useState<FormatErrorItem[]>([]);
  // 같은 미리보기를 다시 적용하는 동안 같은 요청 번호와 끝낸 청크를 이어 쓴다.
  const requestId = useRef(crypto.randomUUID());
  const totals = useRef<ApplyTotals>(EMPTY_TOTALS);

  const reset = () => {
    setPhase({ step: "input" });
    setText("");
    setError(null);
    setApplyError(null);
    requestId.current = crypto.randomUUID();
    totals.current = EMPTY_TOTALS;
  };

  const upload = async () => {
    const rows = parseTeacherLines(text);
    if (rows.length === 0) {
      setError(EMPTY_TEACHER_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await consoleRequest("/api/console/teachers/import-preview", {
      method: "POST",
      body: { rows },
    });
    setBusy(false);
    const verdicts = (
      res.body as {
        rows?: { index: number; verdict: Verdict; reasons?: Reason[] }[];
      } | null
    )?.rows;
    if (res.status !== 200 || !verdicts) {
      setError(errorMessage(res.body) ?? PREVIEW_FAILED);
      return;
    }
    requestId.current = crypto.randomUUID();
    totals.current = EMPTY_TOTALS;
    setApplyError(null);
    const reasons = verdicts.map((v) => v.reasons ?? []);
    setPhase({
      step: "preview",
      rows,
      verdicts: verdicts.map((v) => v.verdict),
      reasons,
    });
    setErrorItems(formatErrorItems(rows, reasons));
  };

  const apply = async () => {
    if (phase.step !== "preview") return;
    setBusy(true);
    setApplyError(null);
    // 오류 행은 서버도 건너뛰지만, 청크가 갈라져 학급 중복 판정이 어긋나지 않도록 보내지 않는다.
    const sendable = phase.rows.filter(
      (_, i) => !isErrorVerdict(phase.verdicts[i] as Verdict),
    );
    const result = await applyRows(
      sendable,
      mode,
      requestId.current,
      totals.current,
    );
    totals.current = result.totals;
    setBusy(false);
    if (result.error) {
      setApplyError(result.error);
      return;
    }
    setPhase({
      step: "done",
      totals: result.totals,
      errors: phase.verdicts.filter(isErrorVerdict).length,
    });
  };

  return (
    <>
      <PageHeader
        title="선생님 엑셀 일괄업로드"
        subtitle="엑셀(.xlsx, .xls) 또는 CSV 파일로 여러 선생님의 이름, 전화번호, 학년, 반을 한 번에 등록합니다"
        mobileSubtitle={PC_ONLY}
      />
      <FormatErrorDialog
        open={errorItems.length > 0}
        onClose={() => setErrorItems([])}
        items={errorItems}
      />
      {!mobile && (
        <div className="flex max-w-content flex-col gap-8 px-4 pb-24 md:px-8 lg:px-12">
          {phase.step === "input" && (
            <ExcelUpload
              text={text}
              error={error}
              busy={busy}
              onText={setText}
              onUpload={() => void upload()}
            />
          )}
          {phase.step === "preview" && (
            <ExcelPreview
              rows={phase.rows}
              verdicts={phase.verdicts}
              reasons={phase.reasons}
              mode={mode}
              busy={busy}
              error={applyError}
              onMode={setMode}
              onApply={() => void apply()}
              onCancel={reset}
            />
          )}
          {phase.step === "done" && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-strong">
                적용을 마쳤어요
              </h2>
              <p className="text-app-body text-ink">
                {`신규 ${phase.totals.created}명, 변경 ${phase.totals.updated}명, 계정 ${phase.totals.accounts}개를 만들었어요.${phase.errors > 0 ? ` 오류 ${phase.errors}건은 반영하지 않았어요.` : ""}`}
              </p>
              {phase.totals.files.length > 0 ? (
                <IssuedPanel rows={phase.totals.files} onClose={reset} />
              ) : (
                <div>
                  <Button
                    type="button"
                    onClick={reset}
                    className={cn(
                      buttonVariants(),
                      "h-10 rounded-lg px-5 text-app-label font-semibold",
                    )}
                  >
                    닫기
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
