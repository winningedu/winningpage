// 이용권 부여 폼 검증과 요청 본문. 기간은 개월 또는 종료일 중 하나만 받는다.
// 둘 다 비우면 서버에서 기간 무기한 부여가 되므로 실수로 무기한이 되지 않게 화면에서 막는다.
export type GrantFormValues = {
  profileId: string;
  sessionQuota: string;
  months: string;
  endsAt: string;
};

function isPositiveInt(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) >= 1;
}

export function validateGrantForm(values: GrantFormValues): string | null {
  if (!values.profileId) return "학생을 선택해 주세요.";
  if (!isPositiveInt(values.sessionQuota)) {
    return "회차 수는 1 이상의 정수로 입력해 주세요.";
  }
  const hasMonths = values.months.trim() !== "";
  const hasEndsAt = values.endsAt.trim() !== "";
  if (hasMonths && hasEndsAt) {
    return "기간은 개월 또는 종료일 중 하나만 입력해 주세요.";
  }
  if (!hasMonths && !hasEndsAt) {
    return "기간(개월) 또는 종료일을 입력해 주세요.";
  }
  if (hasMonths && !isPositiveInt(values.months)) {
    return "기간은 1 이상의 정수(개월)로 입력해 주세요.";
  }
  return null;
}

export function buildGrantBody(values: GrantFormValues) {
  const base = {
    profileId: values.profileId,
    sessionQuota: Number(values.sessionQuota),
  };
  if (values.endsAt.trim() !== "") {
    // 종료일은 그날 한국 시간 끝(23:59:59)까지 쓸 수 있게 잡는다.
    return {
      ...base,
      endsAt: new Date(`${values.endsAt.trim()}T23:59:59+09:00`).toISOString(),
    };
  }
  return { ...base, months: Number(values.months) };
}
