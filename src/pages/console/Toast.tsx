// 한 번에 하나, 약 3초 보이는 토스트(교 #11). 콘솔 어느 화면이든 useToast().show 로 부른다.

import { CircleAlert } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export const TOAST_MS = 3000;

interface ToastMessage {
  tone: "Success" | "Error";
  message: string;
}

const ToastContext = createContext<{ show: (t: ToastMessage) => void } | null>(
  null,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const show = useCallback((t: ToastMessage) => setToast({ ...t }), []);
  const value = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-4 bottom-8 z-[60] flex justify-center">
          <div
            role="status"
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-3 text-sm leading-[1.4] text-primary-foreground shadow-[0_0.5rem_1.5rem_0_rgb(0_0_0/0.16)]",
              toast.tone === "Success" ? "bg-neutral-900" : "bg-ink-danger",
            )}
          >
            {toast.tone === "Error" && (
              <CircleAlert aria-hidden className="size-[1.125rem]" />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
