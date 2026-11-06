// 2단계 소속 확인(사 #100, #7, 결정 r4). 소속코드를 확인하면 기관명이 보인다.
import { useState } from "react";
import { AuthTitle, TextField } from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import { isValidTenantCodeFormat, normalizeTenantCode } from "@/lib/tenantCode";
import { lookupTenant } from "./api";
import { TENANT_MESSAGES } from "./copy";
import StepActions from "./StepActions";

interface TenantStepProps {
  onPrev: () => void;
  onNext: () => void;
}

export default function TenantStep({ onPrev, onNext }: TenantStepProps) {
  const { formData, updateFormData, tenant, setTenant } = useSignup();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const foundTenant = tenant && !tenant.isCatchAll ? tenant : null;

  const fieldStatus = (() => {
    if (foundTenant) return "success";
    return error ? "error" : "default";
  })();

  function handleCodeChange(value: string) {
    updateFormData({ orgCode: value });
    setTenant(null);
    setError("");
  }

  async function handleCheck() {
    if (!isValidTenantCodeFormat(formData.orgCode)) {
      setError(TENANT_MESSAGES.notFound);
      return;
    }

    setChecking(true);
    setError("");
    try {
      const result = await lookupTenant(normalizeTenantCode(formData.orgCode));

      if (result.ok) {
        setTenant({ isCatchAll: false, ...result.tenant });
        return;
      }

      setError(
        result.reason === "too_many"
          ? TENANT_MESSAGES.tooMany
          : TENANT_MESSAGES.notFound,
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <AuthTitle line1="소속을 확인해 주세요" line1Color="ink" />

      <TextField
        label="소속코드"
        id="school-org-code"
        name="orgCode"
        size="lg"
        className="w-full"
        value={formData.orgCode}
        onChange={handleCodeChange}
        actionLabel="확인"
        onAction={handleCheck}
        actionDisabled={checking}
        helperText={foundTenant?.name ?? error}
        status={fieldStatus}
        autoComplete="off"
      />

      <StepActions
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={!foundTenant}
      />
    </>
  );
}
