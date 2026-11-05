// W11 ① 끌어다 놓기와 파일 선택. 고른 파일 하나를 onFile 로 넘기기만 한다.

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}

export default function Dropzone({
  accept,
  disabled = false,
  onFile,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 끌어다 놓기는 보조 수단이고 키보드는 파일 선택 버튼이 맡는다
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line p-4",
        over && "bg-surface-muted",
        disabled && "opacity-40",
      )}
    >
      <p className="text-app-label text-neutral-400">
        엑셀 파일을 여기에 끌어다 놓거나 파일 선택을 누르세요
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label="명단 엑셀 파일"
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
      >
        파일 선택
      </Button>
    </div>
  );
}
