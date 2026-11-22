import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmAdminOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // 되돌릴 수 없거나 권한을 넓히는 동작. 확인 버튼이 destructive 가 되고, 처음 포커스가
  // 취소에 간다(Enter 한 번으로 실행되지 않게).
  destructive?: boolean;
}

interface Pending {
  id: number;
  options: ConfirmAdminOptions;
  resolve: (confirmed: boolean) => void;
}

// 확인창은 한 번에 하나만 뜬다. 열려 있는 동안 들어온 호출은 줄에 세우고, 앞의 창이
// 닫히면 들어온 순서대로 띄운다(앞 호출을 취소로 끝내지 않는다).
const queue: Pending[] = [];
let nextId = 0;
let current: Pending | null = null;
let showCurrent: ((pending: Pending | null) => void) | null = null;

function pump() {
  if (!showCurrent || current) return;
  current = queue.shift() ?? null;
  showCurrent(current);
}

function settle(confirmed: boolean) {
  if (!current) return;
  const finished = current;
  current = null;
  showCurrent?.(null);
  finished.resolve(confirmed);
  pump();
}

/** 확인창을 띄우고 확인이면 true, 취소나 Esc 면 false 로 끝난다. */
export function confirmAdmin(options: ConfirmAdminOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ id: nextId++, options, resolve });
    pump();
  });
}

/** AdminLayout 에 한 번만 둔다. */
export function ConfirmAdminHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    showCurrent = setPending;
    pump();
    return () => {
      showCurrent = null;
      // 호스트가 사라지면 기다리는 호출이 영영 멈추지 않게 취소로 끝낸다.
      const waiting = [...(current ? [current] : []), ...queue.splice(0)];
      current = null;
      for (const item of waiting) item.resolve(false);
    };
  }, []);

  const options = pending?.options;

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      {options ? (
        // 줄에 선 호출은 창을 닫지 않고 내용만 바뀌므로, id 로 다시 마운트해 호출마다
        // initialFocus 가 돈다. 닫힘 애니메이션이 생략되는 것은 겉모습일 뿐이라 받아들인다.
        <AlertDialogContent
          key={pending?.id}
          initialFocus={options.destructive ? cancelRef : actionRef}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description ? (
              <AlertDialogDescription className="whitespace-pre-line">
                {options.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>
              {options.cancelLabel ?? "취소"}
            </AlertDialogCancel>
            <AlertDialogAction
              ref={actionRef}
              variant={options.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {options.confirmLabel ?? "확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}
