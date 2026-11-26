// 1단계 약관 동의. 스쿨멘토 학생회원 가입약관 V2(20261125) 그대로: 필수 한 칸(1-1~1-4)과 선택 4-1, 4-2.
// 필수 칸 하나가 이용약관(service)과 개인정보(privacyRequired) 동의를 함께 켠다.
import { AgreementList, AuthTitle } from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import StepActions from "./StepActions";

const AGREEMENT_ITEMS = [
  {
    key: "service",
    label: "아래 스쿨멘토 약관 및 이용 방침에 동의합니다.",
    required: true,
    to: "/terms/student/service",
  },
  {
    key: "marketing",
    label: "마케팅 및 광고성 정보 수신 동의",
    required: false,
    to: "/terms/student/marketing",
  },
  {
    key: "privacyOptional",
    label: "선택 개인정보 수집 및 이용 동의",
    required: false,
    to: "/privacy-additional",
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
