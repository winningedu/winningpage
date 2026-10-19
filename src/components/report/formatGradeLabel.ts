// 학생 프로필 학년 값("고1" 등)을 표지 표기("고등학교 1학년")로 바꾼다. 그 외 값은 그대로 둔다.
const SCHOOL_NAME = { 고: "고등학교", 중: "중학교" } as const;

export function formatGradeLabel(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const match = /^(고|중)([1-3])$/.exec(value);
  if (!match) return value;
  return `${SCHOOL_NAME[match[1] as keyof typeof SCHOOL_NAME]} ${match[2]}학년`;
}
