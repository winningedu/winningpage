// W15 1, 2단계. 양식 내려받기와 파일 올리기 또는 붙여넣기. 파일은 읽어서 아래 칸에 줄로 채우고 "올리기"가 미리보기를 요청한다.
// 읽을 수 없는 파일은 CSV나 붙여넣기 안내와 함께 오류로 알린다(교 #206).

import { useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Notice from "../Notice";
import { readTeacherFile } from "./teacherFile";

interface ExcelUploadProps {
  text: string;
  error: string | null;
  busy: boolean;
  onText: (text: string) => void;
  onUpload: () => void;
}

export default function ExcelUpload({
  text,
  error,
  busy,
  onText,
  onUpload,
}: ExcelUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const readFile = async (file: File) => {
    try {
      setFileError(null);
      onText(await readTeacherFile(file));
    } catch (e) {
      setFileError((e as Error).message);
    }
  };

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-strong">
          1. 양식 내려받기
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/templates/teacher-roster.xlsx"
            download
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary",
            )}
          >
            양식 내려받기(.xlsx)
          </a>
          <p className="text-app-label text-ink-sub">
            양식 5칸: 교사명, 전화번호, 학년, 그룹, 반. 예시 2행이 들어 있어요
          </p>
        </div>
      </section>
      <hr className="border-line" />
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-strong">
          2. 파일 올리기 또는 붙여넣기
        </h2>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 끌어다 놓기는 보조 수단이고 키보드는 파일 선택 버튼이 맡는다 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line p-4",
            over && "bg-surface-muted",
          )}
        >
          <p className="text-app-label text-neutral-400">
            엑셀 파일(.xlsx, .xls, .csv)을 끌어다 놓거나 복사한 명단을
            붙여넣으세요
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            aria-label="교사 엑셀 파일"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void readFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
          >
            파일 선택
          </Button>
          <textarea
            aria-label="붙여넣기"
            value={text}
            placeholder="교사명, 전화번호, 학년, 그룹, 반 순서로 한 줄에 한 학급씩 붙여넣으세요"
            onChange={(e) => onText(e.target.value)}
            className="h-32 w-full resize-none rounded-lg border border-line bg-background p-4 text-app-label text-ink-strong placeholder:text-ink-sub"
          />
        </div>
        {(fileError ?? error) && (
          <Notice tone="Danger">{fileError ?? error}</Notice>
        )}
        <div>
          <Button
            type="button"
            disabled={text.trim() === "" || busy}
            onClick={onUpload}
            className="h-10 rounded-lg px-5 text-app-label font-semibold disabled:opacity-40"
          >
            올리기
          </Button>
        </div>
      </section>
    </>
  );
}
