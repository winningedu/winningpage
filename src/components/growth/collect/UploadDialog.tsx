import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  collectExtract,
  collectUploadUrl,
  type HighGrade,
} from "@/lib/growth/api";
import { supabase } from "@/lib/supabase";
import {
  ACCEPT_ATTRIBUTE,
  IDLE,
  isUploadBusy,
  LIMIT_MESSAGE,
  runUpload,
  type UploadDeps,
  type UploadOutcome,
  uploadReducer,
  validateUploadFile,
} from "./uploadFlow";

export const realUploadDeps: UploadDeps = {
  requestUploadUrl: collectUploadUrl,
  // contentType 을 안 주면 Storage 가 text/plain 을 붙여 버킷 MIME 제한에 걸린다(guideUpload.ts 선례).
  uploadToStorage: (bucket, path, token, file) =>
    supabase.storage
      .from(bucket)
      .uploadToSignedUrl(path, token, file, { contentType: file.type }),
  extract: collectExtract,
};

const CONSENT_TEXT =
  "올린 자료를 열람하고 주제, 개념, 결과, 한계만 뽑아 분석에 쓰는 것에 동의해요. 원문은 보관하지 않아요.";

export type UploadTarget = {
  title: string;
  gradeLabel: HighGrade;
  semester: 1 | 2;
  uploadsLeft: number | null;
};

/** 파일 추가 모달(시안 646:2436). 한 번에 한 파일을 올리고 추출까지 이어서 한다. */
export function UploadDialog({
  target,
  deps = realUploadDeps,
  onClose,
  onSettled,
  onBusyChange,
}: {
  target: UploadTarget;
  deps?: UploadDeps;
  onClose: () => void;
  /** 업로드가 끝난 뒤(성공, 실패 모두) 부른다. 호출자가 summary 를 다시 부른다. */
  onSettled: (outcome: UploadOutcome) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [state, dispatch] = useReducer(uploadReducer, IDLE);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = isUploadBusy(state);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const error = validateUploadFile(picked);
    setFileError(error);
    setFile(error ? null : picked);
  };

  const limited = target.uploadsLeft === 0;
  const canSubmit =
    file !== null && consent && !limited && state.phase === "idle";

  const submit = async () => {
    if (!file || !canSubmit) return;
    const outcome = await runUpload(
      deps,
      { gradeLabel: target.gradeLabel, semester: target.semester, file },
      dispatch,
    );
    onSettled(outcome);
  };

  const requestClose = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{target.title} 파일 추가</DialogTitle>
          <DialogDescription>
            PDF, 이미지, TXT, DOCX / 학기당 10개까지
          </DialogDescription>
        </DialogHeader>

        {state.phase === "idle" && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pick(e.dataTransfer.files[0]);
              }}
              className="flex h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-surface-04 text-app-label text-ink-sub hover:bg-surface-03"
            >
              {file ? (
                <span className="font-medium text-ink-strong">{file.name}</span>
              ) : (
                <span>파일을 끌어다 놓거나 눌러서 고르세요</span>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              aria-label="올릴 파일 선택"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {fileError && (
              <p role="alert" className="text-app-label text-error">
                {fileError}
              </p>
            )}
            {limited && (
              <p role="alert" className="text-app-label text-error">
                {LIMIT_MESSAGE}
              </p>
            )}
            <label className="flex items-start gap-2 text-app-label text-ink-strong">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>{CONSENT_TEXT}</span>
            </label>
          </div>
        )}

        {(state.phase === "requesting" || state.phase === "uploading") && (
          <p role="status" className="text-app-body text-ink-strong">
            파일을 올리는 중이에요.
          </p>
        )}
        {state.phase === "extracting" && (
          <p role="status" className="text-app-body text-ink-strong">
            내용을 읽는 중이에요. 약 1분 걸려요.
          </p>
        )}
        {state.phase === "ok" && (
          <p role="status" className="text-app-body text-ink-strong">
            {state.topic
              ? `주제를 뽑았어요: ${state.topic}`
              : "추출을 마쳤어요."}
          </p>
        )}
        {(state.phase === "failed" || state.phase === "limit") && (
          <p role="alert" className="text-app-body text-error">
            {state.message}
          </p>
        )}

        <DialogFooter>
          {state.phase === "idle" && (
            <>
              <Button type="button" variant="outline" onClick={requestClose}>
                취소
              </Button>
              <Button type="button" disabled={!canSubmit} onClick={submit}>
                올리기
              </Button>
            </>
          )}
          {state.phase === "ok" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  dispatch({ type: "reset" });
                  setFile(null);
                  setConsent(false);
                }}
              >
                파일 더 올리기
              </Button>
              <Button type="button" onClick={onClose}>
                닫기
              </Button>
            </>
          )}
          {(state.phase === "failed" || state.phase === "limit") && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                닫기
              </Button>
              {state.phase === "failed" && (
                <Button
                  type="button"
                  onClick={() => dispatch({ type: "reset" })}
                >
                  다시 시도
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
