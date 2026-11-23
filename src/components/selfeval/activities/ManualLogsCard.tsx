import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { CARD } from "@/components/growth/start/cardStyles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GENERIC_ERROR_MESSAGE } from "@/lib/growth/apiResult";
import {
  type ApiResult,
  type ManualMemo,
  manualLogsDelete,
  manualLogsList,
  manualLogsSetIncluded,
  manualLogsUpdate,
  manualLogsUpload,
} from "@/lib/selfeval/api";
import {
  canConfirm,
  checkUploadFile,
  draftOf,
  fileToBase64,
  isDirty,
  MEMO_MAX_CHARS,
  NAME_NOTICE,
  PASTE_MAX_CHARS,
  RECORD_BOOK_NOTICE,
} from "./manualLogsLogic";

// 수기 수행보고 카드(명세 No.158~161, 90, 91). 모든 학생에게 연다.
// 파일이나 붙여넣은 글을 올리면 서버가 메모로 나눠 준다. 학생이 날짜와 글을 확인한 메모만 근거가 된다.
// 이용 횟수는 쓰지 않는다. 원본 파일은 서버가 저장하지 않는다.

const TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-app-label text-ink-strong outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const ERROR = "text-app-caption text-destructive";

function messageOf(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
  return result.kind === "error" ? result.message : GENERIC_ERROR_MESSAGE;
}

type Props = { sessionId: string };

export default function ManualLogsCard({ sessionId }: Props) {
  const base = useId();
  const queryClient = useQueryClient();
  const key = ["selfeval", "manual-logs", sessionId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await manualLogsList(sessionId);
      if (result.kind !== "ok") throw new Error(messageOf(result));
      return result.data.memos;
    },
  });
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personName, setPersonName] = useState(false);

  const setMemos = (fn: (memos: ManualMemo[]) => ManualMemo[]) =>
    queryClient.setQueryData<ManualMemo[]>(key, (prev) => fn(prev ?? []));

  async function upload(input: Parameters<typeof manualLogsUpload>[1]) {
    setBusy(true);
    setError(null);
    const result = await manualLogsUpload(sessionId, input);
    setBusy(false);
    if (result.kind !== "ok") {
      setError(messageOf(result));
      return false;
    }
    setPersonName(result.data.personNameDetected);
    setMemos((prev) => [...prev, ...result.data.memos]);
    return true;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const problem = checkUploadFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    await upload({
      file: { mimeType: file.type, data: await fileToBase64(file) },
    });
  }

  async function onPaste() {
    if (await upload({ text: pasted.trim() })) setPasted("");
  }

  const memos = list.data ?? [];

  return (
    <section className={CARD} aria-label="수기 수행보고">
      <h2 className="text-app-card-title font-bold text-ink-strong">
        수기 수행보고
      </h2>
      <p className="mt-1 text-app-label text-ink-sub">
        손으로 쓴 수행 기록 사진이나 PDF를 올리거나 글을 붙여넣을 수 있어요.
        메모마다 날짜와 글을 확인한 것만 근거로 써요. 원본 파일은 글자를 읽은 뒤
        바로 지우고 저장하지 않아요. 이용 횟수도 쓰지 않아요.
      </p>
      {RECORD_BOOK_NOTICE && (
        <p className="mt-2 rounded-lg bg-surface-04 px-3 py-2 text-app-label font-medium text-ink-strong">
          {RECORD_BOOK_NOTICE}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${base}-file`}
            className="text-app-label font-medium text-ink-sub"
          >
            사진이나 PDF 올리기
          </label>
          <Input
            id={`${base}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="h-auto py-1.5 text-app-label md:text-app-label"
            disabled={busy}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="text-app-caption text-ink-sub">
            파일 하나가 3MB까지예요. 문서 파일은 글을 복사해 붙여넣어 주세요.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${base}-paste`}
            className="text-app-label font-medium text-ink-sub"
          >
            글 붙여넣기
          </label>
          <textarea
            id={`${base}-paste`}
            rows={4}
            className={TEXTAREA}
            maxLength={PASTE_MAX_CHARS}
            value={pasted}
            disabled={busy}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="lg"
              className="h-9 px-4 text-app-label font-semibold"
              disabled={busy || pasted.trim() === ""}
              onClick={() => void onPaste()}
            >
              붙여넣은 글 올리기
            </Button>
          </div>
        </div>
        {busy && (
          <p role="status" className="text-app-label text-ink-sub">
            글자를 읽는 중이에요. 잠시만 기다려 주세요.
          </p>
        )}
        {error && (
          <p role="alert" className={ERROR}>
            {error}
          </p>
        )}
        {personName && (
          <p className="text-app-label text-ink-strong">
            올린 글에서 사람 이름이 보여요. 메모를 확인하기 전에 지우거나 바꿔
            주세요.
          </p>
        )}
      </div>

      {list.isError && (
        <p role="alert" className={`mt-4 ${ERROR}`}>
          올린 메모를 불러오지 못했어요. {GENERIC_ERROR_MESSAGE}
        </p>
      )}
      {memos.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3" aria-label="올린 메모">
          {memos.map((memo) => (
            <MemoItem
              key={memo.id}
              sessionId={sessionId}
              memo={memo}
              onChange={(next) =>
                setMemos((prev) =>
                  prev.map((m) => (m.id === next.id ? next : m)),
                )
              }
              onRemove={() =>
                setMemos((prev) => prev.filter((m) => m.id !== memo.id))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type ItemProps = {
  sessionId: string;
  memo: ManualMemo;
  onChange: (memo: ManualMemo) => void;
  onRemove: () => void;
};

function MemoItem({ sessionId, memo, onChange, onRemove }: ItemProps) {
  const base = useId();
  const [draft, setDraft] = useState(draftOf(memo));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = isDirty(memo, draft);

  async function save(confirmed: boolean | undefined) {
    setBusy(true);
    setError(null);
    const result = await manualLogsUpdate(sessionId, memo.id, {
      writtenAt: draft.writtenAt,
      text: draft.text,
      ...(confirmed === undefined ? {} : { confirmed }),
    });
    setBusy(false);
    if (result.kind !== "ok") {
      setError(messageOf(result));
      return;
    }
    onChange(result.data.memo);
    setDraft(draftOf(result.data.memo));
  }

  async function toggleIncluded(included: boolean) {
    setBusy(true);
    setError(null);
    const result = await manualLogsSetIncluded(sessionId, memo.id, included);
    setBusy(false);
    if (result.kind !== "ok") {
      setError(messageOf(result));
      return;
    }
    onChange(result.data.memo);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await manualLogsDelete(sessionId, memo.id);
    setBusy(false);
    if (result.kind !== "ok") {
      setError(messageOf(result));
      return;
    }
    onRemove();
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line/60 bg-surface-04 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={
            memo.confirmed
              ? "text-app-caption font-semibold text-ink-strong"
              : "text-app-caption text-ink-sub"
          }
        >
          {memo.confirmed ? "확인함" : "확인 전"}
          {memo.ocr ? ", 사진에서 읽음" : ""}
        </span>
        <label className="flex items-center gap-2 text-app-label text-ink-strong">
          <input
            type="checkbox"
            checked={memo.included}
            disabled={busy}
            onChange={(e) => void toggleIncluded(e.target.checked)}
          />
          근거에 포함
        </label>
      </div>
      <fieldset disabled={busy} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${base}-date`}
            className="text-app-label font-medium text-ink-sub"
          >
            작성일
          </label>
          <Input
            id={`${base}-date`}
            type="date"
            className="h-9 text-app-label md:text-app-label"
            value={draft.writtenAt}
            onChange={(e) =>
              setDraft((d) => ({ ...d, writtenAt: e.target.value }))
            }
          />
          {draft.writtenAt === "" && (
            <p className="text-app-caption text-ink-sub">
              작성일을 읽지 못했어요. 직접 넣어야 확인할 수 있어요.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${base}-text`}
            className="text-app-label font-medium text-ink-sub"
          >
            메모 글
          </label>
          <textarea
            id={`${base}-text`}
            rows={4}
            className={TEXTAREA}
            value={draft.text}
            onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          />
          <p className="text-right text-app-caption text-ink-sub">
            {draft.text.length}/{MEMO_MAX_CHARS}자
          </p>
        </div>
      </fieldset>
      {memo.nameNotice && (
        <p className="text-app-label text-ink-strong">{NAME_NOTICE}</p>
      )}
      {error && (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-9 px-4 text-app-label"
          disabled={busy}
          onClick={() => void remove()}
        >
          삭제
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-9 px-4 text-app-label"
            disabled={busy || draft.text.trim() === ""}
            onClick={() => void save(undefined)}
          >
            저장
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          className="h-9 px-4 text-app-label font-semibold"
          disabled={busy || !canConfirm(draft) || (memo.confirmed && !dirty)}
          onClick={() => void save(true)}
        >
          확인
        </Button>
      </div>
    </li>
  );
}
