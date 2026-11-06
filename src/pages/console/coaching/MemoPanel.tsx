// W9 교사 메모 패널과 W9d 삭제 확인. 데스크톱은 늘 펼쳐 있고 태블릿과 휴대폰은 접어 둔다(memo-open 이 펼친 상태).
// 열람 범위는 서버가 정한다(담임은 모두, 학교 관리자는 자기 메모). 삭제는 작성자만 화면에서 숨긴다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { consoleRequest } from "../api";
import { kstDotDate } from "../date";
import Notice from "../Notice";

interface Memo {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  canDelete: boolean;
}

function DeleteDialog({
  busy,
  error,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  error: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="gap-5 rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[30rem]"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          메모를 삭제할까요?
        </DialogTitle>
        <p className="text-app-body text-ink-sub">
          삭제하면 화면에서만 숨겨져요. 작성한 교사만 삭제할 수 있어요
        </p>
        {error && <Notice tone="Danger">메모를 지우지 못했어요</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="bg-error text-white hover:bg-error/90"
          >
            삭제
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MemoPanel({
  studentId,
  admin,
}: {
  studentId: string;
  admin: boolean;
}) {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const key = ["console", "memos", studentId];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  // 저장이 실패해 다시 누를 때는 같은 요청 번호를 쓴다(서버가 한 줄만 남긴다).
  const requestId = useRef<string | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await consoleRequest(
        `/api/console/memos?studentId=${encodeURIComponent(studentId)}`,
      );
      if (res.status !== 200) throw new Error(`memos ${res.status}`);
      return (res.body as { memos: Memo[] }).memos;
    },
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      requestId.current ??= crypto.randomUUID();
      const res = await consoleRequest("/api/console/memos", {
        method: "POST",
        body: { studentId, body: text, requestId: requestId.current },
      });
      if (res.status !== 200) throw new Error(`memo save ${res.status}`);
    },
    onSuccess: async () => {
      requestId.current = null;
      setText("");
      setSaveError(false);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => setSaveError(true),
  });

  const hide = useMutation({
    mutationFn: async (memoId: string) => {
      const res = await consoleRequest("/api/console/memos/hide", {
        method: "POST",
        body: { memoId },
      });
      if (res.status !== 200) throw new Error(`memo hide ${res.status}`);
    },
    onSuccess: async () => {
      setDeleting(null);
      setDeleteError(false);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => setDeleteError(true),
  });

  const memos = list.data ?? [];
  return (
    <aside className="flex w-full flex-col rounded-2xl bg-goal-cardTone-neutral lg:sticky lg:top-6 lg:w-[22.5rem] lg:shrink-0 lg:self-start">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center justify-between px-6 text-app-card-title font-semibold text-ink-strong lg:hidden"
      >
        교사 메모
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        className={cn("flex-col gap-4 p-6", open ? "flex" : "hidden lg:flex")}
      >
        <h2 className="text-app-card-title font-semibold text-ink-strong max-lg:sr-only">
          교사 메모
        </h2>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={fieldId}
            className="text-app-label font-medium text-ink-sub"
          >
            메모
          </label>
          <textarea
            id={fieldId}
            value={text}
            placeholder="오늘 상담 내용을 적어요"
            onChange={(e) => {
              // 내용이 바뀌면 다른 저장이므로 요청 번호를 새로 받는다(같은 번호에 다른 내용은 서버가 거부한다).
              requestId.current = null;
              setText(e.target.value);
            }}
            className="h-[7.5rem] resize-none rounded-xl border border-line bg-background p-4 text-app-label text-ink-strong placeholder:text-ink-sub"
          />
          <p className="text-app-caption text-ink-sub">
            작성자와 현재 담임만 열람, 학생과 학부모 비공개
          </p>
          {admin && (
            <p className="text-app-caption text-ink-sub">
              내가 쓴 메모만 보여요
            </p>
          )}
          {saveError && <Notice tone="Danger">메모를 저장하지 못했어요</Notice>}
          <Button
            type="button"
            variant="secondary"
            disabled={text.trim() === "" || save.isPending}
            onClick={() => save.mutate()}
            className="self-start"
          >
            저장
          </Button>
        </div>
        {list.isSuccess && memos.length === 0 && (
          <p className="text-app-label text-ink-sub">아직 메모가 없어요</p>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {memos.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 py-3">
              <p className="text-app-caption text-ink-sub">
                {kstDotDate(m.createdAt)} {m.authorName}
              </p>
              <p className="text-app-label font-semibold text-ink-strong">
                {m.body}
              </p>
              {m.canDelete ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDeleteError(false);
                    setDeleting(m.id);
                  }}
                  className="self-end"
                >
                  삭제
                </Button>
              ) : (
                <p className="text-app-caption text-ink-sub">
                  작성한 교사만 지울 수 있어요
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
      {deleting && (
        <DeleteDialog
          busy={hide.isPending}
          error={deleteError}
          onConfirm={() => hide.mutate(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </aside>
  );
}
