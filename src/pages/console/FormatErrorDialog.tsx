// 두 콘솔 업로드(학생 명단 미리보기, 선생님 엑셀)가 같이 쓰는 형식 오류 확인 창. 틀린 칸마다 한 줄씩 보인다.

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export interface FormatErrorItem {
  /** 줄 번호. 0 이면 줄 없이 이유만 보인다. */
  row: number;
  name: string;
  cell: string;
  value: string;
  message: string;
}

interface FormatErrorDialogProps {
  open: boolean;
  onClose: () => void;
  items: FormatErrorItem[];
}

/** 이유 문장에서 앞의 주어("학년은 ", "반은 ")를 뺀다. 창은 칸 이름을 따로 붙인다. */
export const dropSubject = (label: string) =>
  label.replace(/^(학년|반)은 /, "");

// 받침이 있게 읽는 숫자: 영, 일, 삼, 육, 칠, 팔.
const BATCHIM_DIGITS = "013678";

/** 값의 마지막 글자가 받침이 있게 읽히면 "은", 아니면 "는". */
export function josaEunNeun(value: string): "은" | "는" {
  const last = value.slice(-1);
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3)
    return (code - 0xac00) % 28 === 0 ? "는" : "은";
  return BATCHIM_DIGITS.includes(last) && last !== "" ? "은" : "는";
}

const lineOf = (item: FormatErrorItem) => {
  const head =
    item.name === "" ? `${item.row}행` : `${item.row}행 ${item.name}`;
  if (item.row === 0) return item.message;
  if (item.value === "") return `${head}: ${item.message}`;
  return `${head}: ${item.cell} "${item.value}"${josaEunNeun(item.value)} ${item.message}`;
};

export default function FormatErrorDialog({
  open,
  onClose,
  items,
}: FormatErrorDialogProps) {
  const rows = new Set(items.filter((i) => i.row > 0).map((i) => i.row)).size;
  const count = rows || items.length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="gap-5 rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[30rem]"
      >
        <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
          형식 오류 {count}줄을 고쳐 주세요
        </DialogTitle>
        <p className="text-app-body text-ink">
          {count}줄에 형식 오류가 있어요. 오류 줄은 저장하지 않아요
        </p>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto text-app-body text-ink-sub">
          {items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 같은 줄에 칸이 여럿일 수 있다
            <p key={i}>{lineOf(item)}</p>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg px-5 text-app-label font-semibold"
          >
            확인
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
