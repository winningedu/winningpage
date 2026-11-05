// W18a 비밀번호 변경 창(스펙 5절). 현재 비밀번호 확인은 서버가 로그인 잠금 흐름으로 처리한다.
// 이 호출의 401 은 "현재 비밀번호가 틀림"이라 로그아웃으로 처리하지 않는다.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { consoleRequest, errorCode, errorMessage } from "./api";
import Notice from "./Notice";
import {
  isPasswordRuleCode,
  PASSWORD_MISMATCH_ERROR,
  SAVE_FAILED_MESSAGE,
  violatesPasswordRule,
} from "./passwordRule";
import TextField from "./TextField";
import { useToast } from "./Toast";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Errors {
  current?: string;
  newPassword?: string;
  confirm?: string;
}

const NEW_PASSWORD_ERROR =
  "새 비밀번호가 규칙에 맞지 않아요. 8자 이상, 영문과 숫자를 함께 쓰고 현재 비밀번호와 다르게 써 주세요";
const CURRENT_PASSWORD_ERROR =
  "현재 비밀번호가 맞지 않아요. 다시 입력해 주세요";

export default function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [retryMs, setRetryMs] = useState(0);

  // 잠금 시간 동안만 저장을 막는다.
  useEffect(() => {
    if (retryMs <= 0) return;
    const timer = window.setTimeout(() => setRetryMs(0), retryMs);
    return () => window.clearTimeout(timer);
  }, [retryMs]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCurrent("");
      setNewPassword("");
      setConfirm("");
      setErrors({});
      setDone(false);
    }
    onOpenChange(next);
  };

  const save = async () => {
    const found: Errors = {};
    if (violatesPasswordRule(newPassword) || newPassword === current) {
      found.newPassword = NEW_PASSWORD_ERROR;
    } else if (confirm !== newPassword) {
      found.confirm = PASSWORD_MISMATCH_ERROR;
    }
    setErrors(found);
    if (found.newPassword || found.confirm) return;

    setSaving(true);
    try {
      const res = await consoleRequest("/api/console/change-password", {
        method: "POST",
        body: { currentPassword: current, newPassword },
      });
      const code = errorCode(res.body);
      if (res.status === 200) {
        const session = (
          res.body as {
            session: { access_token: string; refresh_token: string };
          }
        ).session;
        const { error } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (error) throw error;
        setDone(true);
      } else if (res.status === 401 && code === "INVALID") {
        setErrors({ current: CURRENT_PASSWORD_ERROR });
      } else if (res.status === 429 && code === "LOCKED") {
        setErrors({
          current: errorMessage(res.body) ?? CURRENT_PASSWORD_ERROR,
        });
        setRetryMs((res.retryAfterSeconds ?? 0) * 1000);
      } else if (
        res.status === 400 &&
        (isPasswordRuleCode(code) || code === "PASSWORD_SAME_AS_CURRENT")
      ) {
        setErrors({ newPassword: NEW_PASSWORD_ERROR });
      } else {
        toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
      }
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
        className="gap-5 rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[30rem]"
      >
        {done ? (
          <>
            <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
              비밀번호를 바꿨어요
            </DialogTitle>
            <Notice tone="Info">
              변경 일시가 기록됐어요. 다음 로그인부터 새 비밀번호를 써 주세요
            </Notice>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="h-10 rounded-lg px-5 text-app-label font-semibold"
              >
                확인
              </Button>
            </div>
          </>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-5"
          >
            <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
              비밀번호 변경
            </DialogTitle>
            <TextField
              label="현재 비밀번호"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              error={errors.current}
            />
            <TextField
              label="새 비밀번호"
              type="password"
              autoComplete="new-password"
              placeholder="8자 이상, 영문과 숫자 포함, 현재 비밀번호와 다르게"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={errors.newPassword}
            />
            <TextField
              label="새 비밀번호 확인"
              type="password"
              autoComplete="new-password"
              placeholder="한 번 더 입력"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={errors.confirm}
            />
            <Notice tone="Info">
              8자 이상, 영문과 숫자 포함, 현재 비밀번호와 달라야 해요
            </Notice>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={saving || retryMs > 0}
                className="h-10 rounded-lg px-5 text-app-label font-semibold"
              >
                저장
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
