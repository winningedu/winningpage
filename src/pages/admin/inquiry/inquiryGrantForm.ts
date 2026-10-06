// 이용권 부여 폼 검증과 요청 본문. 서버 계약은 api/_lib/inquiry/ops/grant.ts 의 GrantBody.
// 날짜는 한국 시각 기준 하루 경계로 보낸다(시작일 0시, 만료일 그날 마지막 초).
export type InquiryGrantFormValues = {
  profileId: string;
  sessionQuota: string;
  unlimited: boolean;
  /** YYYY-MM-DD 또는 빈 값(지금부터). */
  startsOn: string;
  /** YYYY-MM-DD 또는 빈 값(기간 무기한). */
  endsOn: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

function isPositiveInt(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) >= 1;
}

export function validateGrantForm(
  values: InquiryGrantFormValues,
): string | null {
  if (!values.profileId) return "학생을 선택해 주세요.";
  if (!values.unlimited && !isPositiveInt(values.sessionQuota))
    return "세션 수는 1 이상의 정수로 입력해 주세요.";
  if (values.startsOn && !isDate(values.startsOn))
    return "시작일 형식이 올바르지 않습니다.";
  if (values.endsOn && !isDate(values.endsOn))
    return "만료일 형식이 올바르지 않습니다.";
  if (values.unlimited && !values.endsOn)
    return "무제한 부여는 만료일이 필요합니다.";
  if (values.startsOn && values.endsOn && values.endsOn <= values.startsOn)
    return "만료일은 시작일보다 늦어야 합니다.";
  return null;
}

export function buildGrantBody(values: InquiryGrantFormValues) {
  return {
    profileId: values.profileId,
    sessionQuota: values.unlimited ? null : Number(values.sessionQuota),
    startsAt: values.startsOn ? `${values.startsOn}T00:00:00+09:00` : null,
    endsAt: values.endsOn ? `${values.endsOn}T23:59:59+09:00` : null,
  };
}
