// 발급 완료 본문(W14b, W16b success). 아이디만 보이고 임시 비밀번호는 안내 파일로 한 번만 내려받는다(교 #125).
// 내려받은 뒤에는 메모리에서도 비밀번호를 지워 다시 받을 수 없게 한다.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadIssuedFile, type IssuedRow } from "./issuedFile";
import { CancelButton, DialogFooter } from "./TeacherDialog";

interface IssuedPanelProps {
  rows: IssuedRow[];
  onClose: () => void;
}

export default function IssuedPanel({ rows, onClose }: IssuedPanelProps) {
  const [pending, setPending] = useState<IssuedRow[] | null>(rows);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    if (!pending) return;
    try {
      await downloadIssuedFile(pending);
      setPending(null);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.loginId}
            className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-4 py-3 text-app-label text-ink"
          >
            <span className="font-semibold text-ink-strong">{r.name}</span>
            <span>{r.loginId}</span>
          </li>
        ))}
      </ul>
      <p className="text-app-label text-ink-sub">
        임시 비밀번호는 화면에 보이지 않아요. 안내 파일은 지금 한 번만 내려받을
        수 있어요
      </p>
      {failed && (
        <p role="alert" className="text-app-label text-ink-danger">
          안내 파일을 만들지 못했어요. 다시 눌러 주세요
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          disabled={pending === null}
          onClick={() => void download()}
          className="h-10 rounded-lg px-5 text-app-label font-semibold disabled:opacity-40"
        >
          {pending === null ? "내려받았어요" : "안내 파일 내려받기"}
        </Button>
        <CancelButton onClick={onClose}>닫기</CancelButton>
      </DialogFooter>
    </>
  );
}
