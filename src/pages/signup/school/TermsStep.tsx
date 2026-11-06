// 1단계 약관 동의(사 #99). 필수 3개(이용약관, 개인정보, DB 전환 안내)와 선택 1개(마케팅).
import { AgreementList, AuthTitle } from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import StepActions from "./StepActions";

const AGREEMENT_ITEMS = [
  {
    key: "service",
    label: "이용약관",
    required: true,
    to: "/terms/student/service",
  },
  {
    key: "privacyRequired",
    label: "개인정보 수집 및 이용",
    required: true,
    to: "/terms/student/privacy",
  },
  {
    key: "dbTransfer",
    label: "DB 전환 안내",
    required: true,
    to: "/terms/student/db-transfer",
  },
  {
    key: "marketing",
    label: "마케팅 정보 수신",
    required: false,
    to: "/terms/student/marketing",
  },
] as const;

const AGREEMENT_KEYS: string[] = AGREEMENT_ITEMS.map((item) => item.key);

interface TermsStepProps {
  onPrev: () => void;
  onNext: () => void;
}

export default function TermsStep({ onPrev, onNext }: TermsStepProps) {
  const { agreements, updateAgreements, setAllAgreements } = useSignup();

  const allChecked = AGREEMENT_ITEMS.every((item) => agreements[item.key]);
  const requiredChecked = AGREEMENT_ITEMS.filter((item) => item.required).every(
    (item) => agreements[item.key],
  );

  return (
    <>
      <AuthTitle line1="약관에 동의해 주세요" line1Color="ink" />

      <AgreementList
        className="w-full"
        items={AGREEMENT_ITEMS.map((item) => ({
          ...item,
          checked: agreements[item.key],
        }))}
        allChecked={allChecked}
        onToggleAll={() => setAllAgreements(!allChecked, AGREEMENT_KEYS)}
        onToggleItem={(key) => {
          const agreementKey = key as (typeof AGREEMENT_ITEMS)[number]["key"];
          updateAgreements({ [agreementKey]: !agreements[agreementKey] });
        }}
      />

      <StepActions
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={!requiredChecked}
      />
    </>
  );
}
