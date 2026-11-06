// 3단계 학생 정보(사 #101, 결정 r7, 교 결정 r10).
import { AuthTitle, TextField } from "@/components/auth";
import { useSignup } from "@/context/SignupContext";
import StepActions from "./StepActions";

interface StudentInfoStepProps {
  onPrev: () => void;
  onNext: () => void;
}

export default function StudentInfoStep({
  onPrev,
  onNext,
}: StudentInfoStepProps) {
  const { formData, updateFormData } = useSignup();

  return (
    <>
      <AuthTitle line1="학생 정보를 입력해 주세요" line1Color="ink" />

      <TextField
        label="이름"
        id="school-name"
        name="name"
        size="lg"
        className="w-full"
        value={formData.name}
        onChange={(name) => updateFormData({ name })}
        autoComplete="name"
      />

      <StepActions onPrev={onPrev} onNext={onNext} />
    </>
  );
}
