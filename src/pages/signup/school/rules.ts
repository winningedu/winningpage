// 학교 학생 가입 입력 규칙(결정 70, 교 결정 r10).
// 학년 선택지는 서버 학적 검증(student_enrollments CHECK)과 같은 목록을 쓴다.
import type { useSignup } from "@/context/SignupContext";
import { normalizePhone } from "@/lib/phoneVerification";
import { normalizeTenantCode } from "@/lib/tenantCode";
import type { SchoolSignupBody } from "./api";

export { ENROLLMENT_GRADES } from "../../../../api/_lib/console/enrollmentInput";

const USERNAME_PATTERN = /^[a-z0-9]{4,20}$/;
const CLASS_NUMBER_PATTERN = /^[1-9][0-9]?$/;

export function isValidUsername(value: string) {
  return USERNAME_PATTERN.test(value);
}

// 번호는 1에서 99까지 숫자. 비우는 것은 호출부가 먼저 거른다.
export function isValidClassNumber(value: string) {
  return CLASS_NUMBER_PATTERN.test(value);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type SignupSnapshot = Pick<
  ReturnType<typeof useSignup>,
  | "formData"
  | "agreements"
  | "tenant"
  | "birthDate"
  | "isUnder14"
  | "verification"
>;

const SCHOOL_ORG_TYPE = "학교";

// 입력 상태를 서버 본문으로 바꾼다. 화면에서 숨긴 칸과 비운 칸은 보내지 않는다.
// withGuardian이 false면 건너뛴 것이라 학부모 칸을 보내지 않는다(14세 미만은 항상 보낸다).
export function buildSignupBody(
  {
    formData,
    agreements,
    tenant,
    birthDate,
    isUnder14,
    verification,
  }: SignupSnapshot,
  withGuardian: boolean,
): SchoolSignupBody {
  const isMinor = isUnder14 === true;
  const orgType = tenant && !tenant.isCatchAll ? tenant.orgType : null;
  const sendGuardian = withGuardian || isMinor;
  const text = (value: string) => value.trim();

  return {
    username: formData.username,
    password: formData.password,
    name: text(formData.name),
    email: text(formData.email),
    ...(formData.phone && { phone: normalizePhone(formData.phone) }),
    birthDate: `${birthDate.slice(0, 4)}-${birthDate.slice(4, 6)}-${birthDate.slice(6, 8)}`,
    gender: formData.gender,
    tenantCode:
      tenant?.isCatchAll === false
        ? normalizeTenantCode(formData.orgCode)
        : null,
    grade: formData.grade,
    ...(orgType &&
      orgType !== SCHOOL_ORG_TYPE &&
      text(formData.groupName) && {
        groupName: text(formData.groupName),
      }),
    ...(!tenant?.isCatchAll && { className: text(formData.className) }),
    ...(!tenant?.isCatchAll &&
      formData.classNumber && {
        number: Number(formData.classNumber),
      }),
    ...(sendGuardian &&
      text(formData.guardianName) && {
        guardianName: text(formData.guardianName),
      }),
    ...(sendGuardian &&
      formData.guardianPhone && {
        guardianPhone: normalizePhone(formData.guardianPhone),
      }),
    ...(sendGuardian &&
      formData.guardianRelation && {
        guardianRelation: formData.guardianRelation,
      }),
    guardianConsent: isMinor && formData.guardianConsent,
    ...(isMinor &&
      verification.pass.requestId && {
        identityRequestId: verification.pass.requestId,
      }),
    agreeService: agreements.service,
    agreePrivacy: agreements.privacyRequired,
    agreeDbTransfer: agreements.dbTransfer,
    agreeMarketing: agreements.marketing,
  };
}
