// 이용권 부여 폼 검증과 요청 본문. 기간 필드는 서버 계약 확정 전까지 months(개월)로 가정한다.
export type GrantFormValues = {
  profileId: string;
  sessionQuota: string;
  months: string;
};

function isPositiveInt(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) >= 1;
}

export function validateGrantForm(values: GrantFormValues): string | null {
  if (!values.profileId) return "학생을 선택해 주세요.";
  if (!isPositiveInt(values.sessionQuota)) {
    return "회차 수는 1 이상의 정수로 입력해 주세요.";
  }
  if (!isPositiveInt(values.months)) {
    return "기간은 1 이상의 정수(개월)로 입력해 주세요.";
  }
  return null;
}

export function buildGrantBody(values: GrantFormValues) {
  return {
    profileId: values.profileId,
    sessionQuota: Number(values.sessionQuota),
    months: Number(values.months),
  };
}
