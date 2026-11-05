// W2 첫 로그인 새 비밀번호(스펙 2절). 사이드바 없이 사이트 헤더만 있는 카드 한 장.
// 임시 비밀번호 칸은 가린 읽기 전용 표시일 뿐 서버로 보내지 않는다(결정 46).

import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { consoleRequest, errorCode } from "./api";
import {
  isPasswordRuleCode,
  PASSWORD_MISMATCH_ERROR,
  PASSWORD_RULE_ERROR,
  SAVE_FAILED_MESSAGE,
  violatesPasswordRule,
} from "./passwordRule";
import TextField from "./TextField";
import { useToast } from "./Toast";
import { useConsoleMe } from "./useConsoleMe";

interface Errors {
  newPassword?: string;
  confirm?: string;
}

export default function FirstPasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { reload } = useConsoleMe();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // me 를 다시 읽어 임시 비밀번호 상태가 풀린 것을 가드가 알게 한 뒤 이동한다.
  const leave = async () => {
    await reload();
    navigate("/teacher", { replace: true });
  };

  const save = async () => {
    const next: Errors = {};
    if (violatesPasswordRule(newPassword))
      next.newPassword = PASSWORD_RULE_ERROR;
    else if (confirm !== newPassword) next.confirm = PASSWORD_MISMATCH_ERROR;
    setErrors(next);
    if (next.newPassword || next.confirm) return;

    setSaving(true);
    try {
      const res = await consoleRequest("/api/console/first-password", {
        method: "POST",
        body: { password: newPassword },
      });
      const code = errorCode(res.body);
      if (
        res.status === 200 ||
        (res.status === 409 && code === "NOT_REQUIRED")
      ) {
        await leave();
        return;
      }
      if (res.status === 400 && code === "PASSWORD_SAME_AS_TEMP") {
        setErrors({ newPassword: "임시 비밀번호와 다르게 써 주세요" });
      } else if (res.status === 400 && isPasswordRuleCode(code)) {
        setErrors({ newPassword: PASSWORD_RULE_ERROR });
      } else {
        toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
      }
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    }
    setSaving(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 pt-16 pb-12">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex w-full flex-col gap-5 rounded-2xl border border-line bg-background px-5 py-8 md:w-[27.5rem] md:p-8"
      >
        <h1 className="text-app-section font-bold text-ink-strong">
          새 비밀번호 설정
        </h1>
        <p className="text-app-body text-ink-sub">
          임시 비밀번호로 처음 들어오셨어요. 새 비밀번호를 정해야 다음으로 갈 수
          있어요.
        </p>
        <TextField
          label="임시 비밀번호"
          type="password"
          value="••••••••"
          readOnly
          tabIndex={-1}
        />
        <TextField
          label="새 비밀번호"
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상, 영문과 숫자 포함, 임시 비밀번호와 다르게"
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
        <Button
          type="submit"
          disabled={saving}
          className="h-11 w-full rounded-lg bg-primary text-app-label font-semibold text-primary-foreground md:h-10"
        >
          저장
        </Button>
      </form>
    </div>
  );
}
