import { useEffect, useId, useState } from "react";
import MyPageModalShell from "@/components/mypage/MyPageModalShell";
import ModalFooter from "@/components/mypage/modal/ModalFooter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isValidTenantCodeFormat, normalizeTenantCode } from "@/lib/tenantCode";
import { TENANT_MESSAGES } from "@/pages/signup/school/copy";
import {
  ENROLLMENT_GRADES,
  isValidClassNumber,
} from "@/pages/signup/school/rules";
import { joinTenant, lookupJoinTenant, SUBMIT_FAILED } from "./api";

// 기타 소속 학생이 소속코드로 기관을 옮기는 모달(결정 96, 98, 99).
// 서비스 막힘 화면과 마이페이지가 같이 연다. 끝나면 onJoined 에 새 기관 이름을 넘기고 닫는다.
// 단계: 코드 입력, 기관 이름 확인, 학적 입력. 그룹은 학교가 아닌 기관만, 반은 필수, 번호는 선택(1~99)이다.
type Step = "code" | "confirm" | "fields";

export type JoinTenantModalProps = {
  open: boolean;
  onClose: () => void;
  onJoined?: (tenantName: string) => void;
};

const FIELD_CLASS =
  "h-13 w-full rounded-xl border border-line px-4 text-[0.9375rem] text-ink outline-hidden focus:border-accent";
const LABEL_CLASS = "mt-4 block text-[0.8125rem] font-semibold text-ink";

export default function JoinTenantModal({
  open,
  onClose,
  onJoined,
}: JoinTenantModalProps) {
  const base = useId();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [tenant, setTenant] = useState<{
    name: string;
    orgType: string | null;
  } | null>(null);
  const [grade, setGrade] = useState("");
  const [groupName, setGroupName] = useState("");
  const [className, setClassName] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep("code");
    setCode("");
    setTenant(null);
    setGrade("");
    setGroupName("");
    setClassName("");
    setNumber("");
    setBusy(false);
    setErrorMsg("");
  }, [open]);

  const goTo = (next: Step) => {
    setErrorMsg("");
    setStep(next);
  };

  const handleLookup = async () => {
    if (!isValidTenantCodeFormat(code)) {
      setErrorMsg(TENANT_MESSAGES.notFound);
      return;
    }
    setBusy(true);
    setErrorMsg("");
    try {
      const result = await lookupJoinTenant(normalizeTenantCode(code));
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      setTenant({ name: result.name, orgType: result.orgType });
      setStep("confirm");
    } catch {
      setErrorMsg(SUBMIT_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!grade) {
      setErrorMsg("학년을 선택해 주세요.");
      return;
    }
    if (!className.trim()) {
      setErrorMsg("반을 입력해 주세요.");
      return;
    }
    if (number.trim() && !isValidClassNumber(number.trim())) {
      setErrorMsg("번호는 1에서 99까지 숫자로 입력해 주세요.");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    try {
      const result = await joinTenant({
        code: normalizeTenantCode(code),
        grade,
        ...(tenant?.orgType !== "학교" &&
          groupName.trim() && { groupName: groupName.trim() }),
        className: className.trim(),
        ...(number.trim() && { number: Number(number.trim()) }),
      });
      if (!result.ok) {
        setErrorMsg(result.message);
        return;
      }
      onJoined?.(result.tenantName);
      onClose();
    } catch {
      setErrorMsg(SUBMIT_FAILED);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const footers = {
    code: [
      { key: "cancel", label: "취소", variant: "neutral", onClick: onClose },
      {
        key: "lookup",
        label: busy ? "확인 중..." : "확인",
        variant: "primary",
        disabled: busy || !code.trim(),
        onClick: handleLookup,
      },
    ],
    confirm: [
      {
        key: "back",
        label: "다시 입력",
        variant: "neutral",
        onClick: () => goTo("code"),
      },
      {
        key: "next",
        label: "다음",
        variant: "primary",
        onClick: () => goTo("fields"),
      },
    ],
    fields: [
      {
        key: "back",
        label: "이전",
        variant: "neutral",
        onClick: () => goTo("confirm"),
      },
      {
        key: "join",
        label: busy ? "옮기는 중..." : "옮기기",
        variant: "primary",
        disabled: busy,
        onClick: handleJoin,
      },
    ],
  } as const;

  return (
    <MyPageModalShell
      open={open}
      onClose={onClose}
      size="sm"
      title="소속코드를 입력해 주세요"
      subtitle="소속코드를 입력하면 서비스를 이용할 수 있어요."
      footer={<ModalFooter buttons={[...footers[step]]} />}
    >
      <ScrollArea className="flex-1 px-6">
        {step === "code" && (
          <label className="mt-2 block">
            <span className="text-[0.8125rem] font-semibold text-ink">
              소속코드
            </span>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setErrorMsg("");
              }}
              maxLength={20}
              placeholder="영문, 숫자 8자리 소속코드 입력"
              className={`mt-2 ${FIELD_CLASS}`}
            />
          </label>
        )}
        {step === "confirm" && tenant && (
          <div className="mt-2 text-center">
            <p className="text-lg font-semibold text-ink">{tenant.name}</p>
            <p className="mt-2 text-sm text-ink-sub">
              이 기관이 맞는지 확인해 주세요.
            </p>
          </div>
        )}
        {step === "fields" && (
          <div className="pb-2">
            <label htmlFor={`${base}-grade`} className={LABEL_CLASS}>
              학년
            </label>
            <select
              id={`${base}-grade`}
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className={`mt-2 ${FIELD_CLASS}`}
            >
              <option value="">선택</option>
              {ENROLLMENT_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {tenant?.orgType !== "학교" && (
              <>
                <label htmlFor={`${base}-group`} className={LABEL_CLASS}>
                  그룹(선택)
                </label>
                <input
                  id={`${base}-group`}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className={`mt-2 ${FIELD_CLASS}`}
                />
              </>
            )}
            <label htmlFor={`${base}-class`} className={LABEL_CLASS}>
              반
            </label>
            <input
              id={`${base}-class`}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className={`mt-2 ${FIELD_CLASS}`}
            />
            <label htmlFor={`${base}-number`} className={LABEL_CLASS}>
              번호(선택)
            </label>
            <input
              id={`${base}-number`}
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className={`mt-2 ${FIELD_CLASS}`}
            />
          </div>
        )}
        {errorMsg && (
          <p role="alert" className="mt-4 text-[0.8125rem] text-error">
            {errorMsg}
          </p>
        )}
      </ScrollArea>
    </MyPageModalShell>
  );
}
